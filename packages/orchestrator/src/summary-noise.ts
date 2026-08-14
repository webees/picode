/**
 * 摘要去噪统一模块（D092）：把历史摘要生成（historySummary stripNoise）要
 * 剔除的机械投喂模板文本集中到一个零依赖模块，feed / re-spawn / checkpoint
 * 三处消费同一口径（SUMMARY_STRIP_NOISE），避免各自维护列表导致口径漂移。
 *
 * 零 import：本模块不依赖任何其它模块，可被 orchestrator 任意模块引用而
 * 不引入循环依赖。
 */

/** Ready-message 文本（P4：投喂给 agent 的就绪提示，同步落转录归档）。 */
export const READY_MESSAGE_TEXT =
  "你已就绪。按角色 prompt 工作;如需联网/查询按 picode 信息控制流程申请,不要私自 web。文件写入必须在你的 task worktree（.picode/worktrees/<run>/<task>）内，禁止修改仓库根目录文件。提交信息遵循 docs/standards/commit.md：type(scope): 中文摘要 + body 根因 + Reviewed-by footer。";

/** 续跑 prompt 固定模板（N7 v1：复用 ready 的角色/任务上下文 + 固定指令）。 */
export const CONTINUATION_PROMPT =
  "检测到本会话已空闲一段时间。若你负责的任务尚未完成，请继续推进：按你的角色 prompt、任务 work brief 与 write_paths 约束工作，持续推进到可交付状态。若任务已完成或你无法继续，请整理证据/交接并明确回报完成情况。不要等待下一次投喂，直接行动。";

/** 语义续跑摘要段的固定标题（与 composeContinuationPrompt 同源，供测试/引用）。 */
export const CONTINUATION_SUMMARY_HEADER = "## 上一回合要点（转录摘要）";

/** 摘要生成统一剔噪清单（D092）：historySummary stripNoise 消费的机械模板
 * 噪音。feed（D077）/ re-spawn（D083）/ checkpoint（D082）三处共用，避免口径漂移。 */
export const SUMMARY_STRIP_NOISE: readonly string[] = [
  READY_MESSAGE_TEXT,
  CONTINUATION_PROMPT,
];
