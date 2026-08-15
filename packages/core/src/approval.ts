/**
 * E 升级审批阶梯（chunk-c3-sandbox-approval 单写者域）。
 *
 * 升级请求落 `runs/<id>/approvals/pending-<id>.json`（asked 记录：
 * from_agent/task_id/path/mode/reason）；`picode approval list` +
 * `picode approval decide --id <id> --approve|--reject`（answerer=run-lead 代批）；
 * 决策写回同一文件成对审计（asked+decided 同文件 status）；
 * allowed-once：approved 后 consumeOnce 授**该次调用**单次放行，used 后重试再验拒绝。
 *
 * 全部落盘经 withFileLock（atomic.ts，与 C1 CAS 同源）；策略 ask/never 的
 * 解析在 sandbox.ts（never=fail-closed 直接拒绝不落请求——本 store 只落被允许的请求）。
 *
 * D071：审批观测走 run 目录文件（approvals/*.json），不进 dashboard 面板。
 */
import fs from "node:fs";
import path from "node:path";
import { withFileLock } from "./atomic.js";
import { ErrorCode, PicodeError } from "./errors.js";
import type { SandboxMode } from "./sandbox.js";

export const APPROVAL_KIND = "sandbox_escalation";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "used";

export interface ApprovalAsked {
  at: string;
  from_agent: string;
  task_id: string;
  path: string;
  mode: SandboxMode;
  reason: string;
}

export interface ApprovalDecided {
  at: string;
  by: string;
  decision: "approved" | "rejected";
  note?: string;
}

/** 审计记录：asked+decided 同文件成对；used_at 标记 allowed-once 消费。 */
export interface ApprovalRecord {
  id: string;
  kind: typeof APPROVAL_KIND;
  status: ApprovalStatus;
  asked: ApprovalAsked;
  decided: ApprovalDecided | null;
  used_at: string | null;
}

function approvalsDir(runDir: string): string {
  return path.join(runDir, "approvals");
}

function approvalFile(runDir: string, id: string): string {
  return path.join(approvalsDir(runDir), `pending-${id}.json`);
}

export class ApprovalStore {
  constructor(private readonly runDir: string) {}

  private read(id: string): ApprovalRecord | null {
    const file = approvalFile(this.runDir, id);
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, "utf8")) as ApprovalRecord;
    } catch {
      return null;
    }
  }

  private lockPath(): string {
    return path.join(approvalsDir(this.runDir), ".approvals.lock");
  }

  /** 落升级请求（asked 记录，pending 状态）。 */
  async request(opts: {
    fromAgent: string;
    taskId: string;
    path: string;
    mode: SandboxMode;
    reason: string;
  }): Promise<ApprovalRecord> {
    const id = `appr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const rec: ApprovalRecord = {
      id,
      kind: APPROVAL_KIND,
      status: "pending",
      asked: {
        at: new Date().toISOString(),
        from_agent: opts.fromAgent,
        task_id: opts.taskId,
        path: opts.path,
        mode: opts.mode,
        reason: opts.reason,
      },
      decided: null,
      used_at: null,
    };
    await withFileLock(this.lockPath(), () => {
      fs.mkdirSync(approvalsDir(this.runDir), { recursive: true });
      fs.writeFileSync(approvalFile(this.runDir, id), JSON.stringify(rec, null, 2), "utf8");
    });
    return rec;
  }

  /** 按 id 读回记录（不存在返回 null）。 */
  get(id: string): ApprovalRecord | null {
    return this.read(id);
  }

  /** 全部记录，按 asked.at 升序（D071 观测入口：run 目录文件）。 */
  list(): ApprovalRecord[] {
    const dir = approvalsDir(this.runDir);
    if (!fs.existsSync(dir)) return [];
    const out: ApprovalRecord[] = [];
    for (const f of fs.readdirSync(dir)) {
      if (!/^pending-.*\.json$/.test(f)) continue;
      try {
        out.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as ApprovalRecord);
      } catch {
        /* 跳过损坏文件，不静默影响其余记录 */
      }
    }
    // asked.at 升序；同毫秒（at 相同）以 id 决胜保证确定性（P1 类 flaky 修复）
    return out.sort(
      (a, b) => a.asked.at.localeCompare(b.asked.at) || a.id.localeCompare(b.id),
    );
  }

  /** 仅 pending 记录。 */
  pending(): ApprovalRecord[] {
    return this.list().filter((r) => r.status === "pending");
  }

  /** 决策写回同一文件（asked+decided 成对审计）；非 pending 拒绝二次决策。 */
  async decide(
    id: string,
    opts: { decision: "approved" | "rejected"; by: string; note?: string },
  ): Promise<ApprovalRecord> {
    return withFileLock(this.lockPath(), () => {
      const cur = this.read(id);
      if (!cur) {
        throw new PicodeError(ErrorCode.APPROVAL_NOT_FOUND, `approval not found: ${id}`);
      }
      if (cur.status !== "pending") {
        throw new PicodeError(
          ErrorCode.APPROVAL_ALREADY_DECIDED,
          `approval ${id} already ${cur.status} — no re-decision`,
        );
      }
      const next: ApprovalRecord = {
        ...cur,
        status: opts.decision,
        decided: {
          at: new Date().toISOString(),
          by: opts.by,
          decision: opts.decision,
          ...(opts.note !== undefined ? { note: opts.note } : {}),
        },
      };
      fs.writeFileSync(approvalFile(this.runDir, id), JSON.stringify(next, null, 2), "utf8");
      return next;
    });
  }

  /** allowed-once 消费：approved → used（授该次调用）；其余状态 fail-closed。 */
  async consumeOnce(id: string): Promise<ApprovalRecord> {
    return withFileLock(this.lockPath(), () => {
      const cur = this.read(id);
      if (!cur) {
        throw new PicodeError(ErrorCode.APPROVAL_NOT_FOUND, `approval not found: ${id}`);
      }
      if (cur.status === "pending") {
        throw new PicodeError(
          ErrorCode.APPROVAL_PENDING,
          `approval ${id} still pending — run-lead decide first`,
        );
      }
      if (cur.status === "rejected") {
        throw new PicodeError(ErrorCode.APPROVAL_REJECTED, `approval ${id} rejected`);
      }
      if (cur.status === "used") {
        throw new PicodeError(
          ErrorCode.APPROVAL_ALREADY_USED,
          `approval ${id} already used (allowed-once) — retry requires a new approval`,
        );
      }
      const next: ApprovalRecord = {
        ...cur,
        status: "used",
        used_at: new Date().toISOString(),
      };
      fs.writeFileSync(approvalFile(this.runDir, id), JSON.stringify(next, null, 2), "utf8");
      return next;
    });
  }
}
