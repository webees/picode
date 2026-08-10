/**
 * Naming for personas and triads (16-hr-cell §8 命名).
 *
 * Every persona instance gets a deterministic codename and every recruited
 * triad gets a team name, so runs can talk about "白泽@task-x" or "team 北辰"
 * and HR can aggregate scores per codename / team across runs
 * (docs/knowledge/hr/). Generation is a pure hash over the instance/task id:
 * stable across re-drafts and reproducible for the same id; a caller-supplied
 * override (staffing request) always wins.
 */

/** Persona codenames (每个 seat 的人设代号池). */
export const DEFAULT_CODENAME_POOL = [
  "磐石",
  "流云",
  "惊鸿",
  "青松",
  "白泽",
  "玄甲",
  "朱雀",
  "玄武",
  "青龙",
  "白虎",
  "麒麟",
  "鲲鹏",
  "烛龙",
  "应龙",
  "毕方",
  "獬豸",
  "貔貅",
  "腾蛇",
  "九尾",
  "天狼",
  "孤鸿",
  "伏虎",
  "衔烛",
  "破军",
] as const;

/** Triad team names (三人团队名池). */
export const DEFAULT_TEAM_NAME_POOL = [
  "北辰",
  "破晓",
  "燎原",
  "星野",
  "长庚",
  "白虹",
  "紫电",
  "惊雷",
  "春山",
  "云帆",
  "牧野",
  "关山",
  "鸣沙",
  "沧浪",
  "玉衡",
  "天枢",
  "天璇",
  "天玑",
  "开阳",
  "摇光",
  "参旗",
  "井络",
  "危楼",
  "连璧",
] as const;

/** djb2 hash — deterministic and stable across processes/runs. */
function hashId(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Pick a codename for a persona instance id (e.g. `engineer@task-x`). */
export function generateCodename(
  instanceId: string,
  pool: readonly string[] = DEFAULT_CODENAME_POOL,
): string {
  if (pool.length === 0) throw new Error("codename pool is empty");
  return pool[hashId(instanceId) % pool.length];
}

/** Pick a team name for a recruited triad (keyed by task id). */
export function generateTeamName(
  taskId: string,
  pool: readonly string[] = DEFAULT_TEAM_NAME_POOL,
): string {
  if (pool.length === 0) throw new Error("team name pool is empty");
  return pool[hashId(taskId) % pool.length];
}

/**
 * Safe name pattern for codename / team_name: used as knowledge-archive file
 * names (docs/knowledge/hr/…), so path-unsafe characters (/, .., spaces, …)
 * are rejected — a user-supplied override must never escape the archive dir.
 */
export const SAFE_NAME_RE = /^[\w\u4e00-\u9fa5-]{1,32}$/;

/** Throw unless `name` is safe to use as a codename / team_name file segment. */
export function assertSafeName(name: unknown, kind: "codename" | "team_name"): void {
  if (typeof name !== "string") {
    throw new Error(`${kind} must be a string, got ${typeof name}`);
  }
  if (!SAFE_NAME_RE.test(name)) {
    throw new Error(
      `${kind} "${name}" is not a safe name (letters/digits/_/CJK/hyphen only, 1–32 chars)`,
    );
  }
}
