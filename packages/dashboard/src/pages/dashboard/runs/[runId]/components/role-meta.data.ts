/**
 * 角色 / 房间 / 阶段静态知识（D71-4/D71-5）。
 *
 * 数据来源（前端静态知识常量，注释标注同步来源）：
 * - ROLE_META.role 描述取自 `<repo>/.picode/agents/<role>.md` frontmatter description；
 * - ROLE_META.room 约定取自 orchestrator pi-adapter ROLE_PRIMARY_ROOM（17 §3.3）与
 *   run-store 平台房成员表（run 初始化时写入 rooms/<room>/members.json）；
 * - ROOM_META 通俗名取自 docs/standards/terminology.md §3 默认启用房间。
 *
 * 若上游成员表/人设描述变更，需同步本文件（面板只读，不读 members.json 以免引入
 * 文件系统耦合；房间成员以静态约定 + 任务 triad 派生为准）。
 */

export interface RoleMeta {
  /** 通俗职责名 */
  label: string
  /** 一句话职责说明 */
  desc: string
  /** ROLE→ROOM 约定：该角色的主房间（platform） */
  room: string
}

export const ROLE_META: Record<string, RoleMeta> = {
  'run-lead': { label: '统筹规划', desc: '制定计划、把守门禁、最终拍板', room: 'leadership' },
  'tpm': { label: '项目调度', desc: '排期、盯进度、处理例外', room: 'program' },
  'proc-audit': { label: '流程审计', desc: '流程漂移监控与红灯告警', room: 'leadership' },
  'pm': { label: '产品管理', desc: '范围、优先级、验收口径', room: 'product' },
  'ind-res': { label: '行业研究', desc: '外部资料取证', room: 'research' },
  'scout': { label: '代码勘探', desc: '摸底代码、分块建议', room: 'architecture' },
  'sys-arch': { label: '架构设计', desc: '仓内方案设计', room: 'architecture' },
  'docs-lead': { label: '文档主责', desc: '记忆与知识治理', room: 'docs' },
  'tech-writer': { label: '技术写作', desc: '编写记忆与简报', room: 'docs' },
  'docs-qa': { label: '文档质检', desc: '文档与证据一致性', room: 'docs' },
  'people-lead': { label: '人才统筹', desc: '用工单与人设审批链', room: 'people' },
  'recruiter': { label: '招聘执行', desc: '起草人设与实例 ID', room: 'people' },
  'people-qa': { label: '人事合规', desc: '席位/工具/约束检查', room: 'people' },
  'code-review': { label: '代码审查', desc: '合并前代码门禁 review', room: 'quality' },
  'release-eng': { label: '发布执行', desc: '构建与串行合并', room: 'release' },
  'sec-eng': { label: '安全工程', desc: '安全门禁', room: 'security' },
  'sess-mgr': { label: '会话调度', desc: '唤醒/休眠会话', room: 'leadership' },
  'squad-lead': { label: '小队队长', desc: '推进任务、协调交接', room: 'squad' },
  'engineer': { label: '软件开发', desc: '写集内实现、自测', room: 'squad' },
  'sdet': { label: '测试验证', desc: '验收与验证命令', room: 'squad' },
}

/** 房间 → 通俗名（terminology §3 默认启用房间）。squad-task- 前缀房与 meeting- 前缀房动态派生。 */
export const ROOM_META: Record<string, string> = {
  leadership: '工程领导',
  product: '产品共创',
  announce: '全员公告',
  program: '项目统筹',
  people: '人力资源',
  research: '行业研究',
  architecture: '架构设计',
  knowledge: '知识管理',
  docs: '技术文档',
  collab: '跨组协同',
  release: '发布工程',
  quality: '质量保障',
  security: '安全合规',
}

/** 任务进度阶段 → 通俗名（progress.yaml schema：running|verifying|handing_over）。 */
export const PHASE_META: Record<string, string> = {
  running: '进行中',
  verifying: '验证中',
  handing_over: '交接中',
}

/**
 * 任务进度阶段 → 进度条百分比（单一来源，审计 P2-11：progress-view 与
 * tasks-board 此前各自映射 — 同一"验证中"一个 50% 一个 75%）。
 */
export const PHASE_PROGRESS: Record<string, number> = {
  running: 40,
  verifying: 75,
  handing_over: 100,
}

/** 任务进度阶段 → 徽章变体（语义色：进行=蓝、验证=天蓝、交接=紫）。 */
export const PHASE_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  running: 'default',
  verifying: 'default',
  handing_over: 'outline',
}

/** squad 房前缀（work_room = squad-<task_id>）；平台房过滤与动态房识别共用（审计 P2-12）。 */
export const SQUAD_ROOM_PREFIX = 'squad-task-'

/** squad-task-<taskId> → 「<taskId> 任务小组」；其他动态房回退原 id。 */
export function roomLabel(room: string): string {
  if (room.startsWith(SQUAD_ROOM_PREFIX))
    return `${room.slice('squad-task-'.length)} 任务小组`
  if (room.startsWith('meeting-'))
    return `${room.slice('meeting-'.length)} 会议`
  return ROOM_META[room] ?? room
}

/** 平台房成员派生：ROLE→ROOM 约定下，主房间为该 room 的所有角色。 */
export function platformRoomMembers(room: string): string[] {
  return Object.entries(ROLE_META)
    .filter(([, meta]) => meta.room === room)
    .map(([role]) => role)
}
