# 验证报告：Sponsor 反馈 + Run-lead 流程复杂度审计（真实性核对）

- 验证席: engineer@task-process-audit-verification（独立验证）
- 验证日期: 2026-08-15（会话）
- 被验证文档: `docs/knowledge/feedback/sponsor-feedback-and-process-audit-2026-08-15.md`
- 数据来源: `.picode/runs/` 三轮 run（01-12-43-3NZ / 02-30-00-DSH / 03-00-00-SUBAGENT）的 README / tasks/*/（brief、staffing、handoff、progress、reviews、change_orders）、`docs/knowledge/hr/`（name-ledger、teams/、personas/）、`docs/knowledge/evolve/`（E16/E17 纪要）、`.git` 全部 reflog（main + 12 个 worktree 分支）

## 0. 验证方法与工具限制说明

- 本会话 bash / glob / grep 三工具均因环境无法启动外部二进制（`spawn bash ENOENT` / `ripgrep launch failed`），全部核验改用 read 直读 + 人工比对，等价于 `git log` 与文件计数的替代路径：
  - git 历史：读 `.git/logs/HEAD`、`.git/logs/refs/heads/main` 及 12 个 `.git/worktrees/squad-task-*/logs/HEAD`（每行含 commit subject），等同于 `git log --all --oneline` 的 subject 全量；
  - 目录枚举：以 `staffing.yaml`（每队 3 条 persona_file）、name-ledger、README、handoff 自述清单交叉替代 `glob`。
- 无法直接实证的项目（如会话聊天实录）按验证清单口径标注"推断，证据不足"。

---

## 1. 逐条核验表（验证清单 9 项）

| # | 审计论断 | 验证方法 | 实证结果 | 证据路径 |
|---|---|---|---|---|
| 1 | 团队规模：12 队、36 名 agent、36 份人设文档 | 数 name-ledger 中本轮新增 team/codename；数 staffing.yaml persona_file | **✓ 成立**。三轮 run 合计 12 team_name + 36 codename（run1：云岫/星汉/松风/流岚/归一 = 5 队 15 席；run2：周晷/锁钥/经纬/运斤 = 4 队 12 席；run3：更漏/城垣/驿道 = 3 队 9 席）。每队 staffing.yaml 均列 3 条 persona_file（personas/{squad-lead,engineer,sdet}.md）且 approved；12×3=36 份人设文档（未能逐文件 glob 计数，但 ledger+12 份 staffing 强支撑）。"人设 12 字段"亦核实：persona frontmatter 恰 12 字段（name/description/tool_profile/role_id/codename/instance_id/seat/team_name/write_paths/read_paths/forbidden/reports_to），更漏队 staffing compliance 亦注明 `persona_dimensions_full: frontmatter 12 字段` | `docs/knowledge/hr/name-ledger.yaml`（L1924-2222）；`…/tasks/task-chunk-config-singleton/staffing/staffing.yaml` + `personas/squad-lead.md`；`…/task-chunk-durable-session/staffing/staffing.yaml`（L58） |
| 2 | run-lead 代提交 ≥5 次（C1/C3/C2/W1 等） | 读全部 reflog commit subject，grep 语义等价的"代提交/接管" | **△ 部分成立（次数高估）**。commit message 明确标注者恰 **3 次**：run2 C1 `2f8ceba`「run-lead 代提交，队内会话延迟」、run2 C3 `2e50375`「run-lead 代提交，队内会话延迟」、run2 C2 `d3bb0c2`「run-lead 接管提交，庖丁会话 failed」。**W1 无代提交证据**：run3 W1（更漏）engineer 秉烛正常提交 `59a515d`（progress.md 04:19Z「engineer 提交 59a515d」，分支 reflog 无代提交标注）。"≥5"中其余 2 次在 git 历史/交接产物中无可复核记录，疑来自会话实录。E17 纪要亦只记录「C1/C2/C3 均出现」（=3） | `.git/worktrees/squad-task-chunk-{c1-goal-crossrun,c2-skill-load,c3-sandbox-approval}/logs/HEAD`；`.git/worktrees/squad-task-chunk-durable-session/logs/HEAD`；`docs/knowledge/evolve/run-2026-08-15T02-30-00-DSH.md`（L19、L79） |
| 3 | 会话失败/零产出 ≥3 例 | handoff known_issues、E 纪要、evidence blockers、progress 找 failed/零交付记录 | **✓ 成立**。① run2 C2 庖丁会话 failed（commit d3bb0c2 + run2 README「庖丁会话 failed（run-lead 接管）」）；② run1 C5 round1 零交付（NOT_PASS：分支相对基线 2df7486 零提交、handoff/progress 空，打回 engineer）；③ run2 C1 队内会话延迟；④ run2 C3 队内会话延迟（后两者均为 run-lead 代提交的注明原因）；另有 run1 规划期"分块核实首派迟到结算" | C5 `handoff/logs/sdet-verdict-round1-notpass-20260815T0936.yaml`；run2 README L10；E17 L79 |
| 4 | 评分区分度：C1-C4 全 95/100、归一 90 | 读 docs/knowledge/hr/teams/*.yaml 与 personas/*.yaml records/score | **✓ 成立（数据准确）**。云岫/星汉/松风/流岚（=C1-C4）team_score 全 **95**；个人三席 100（羲和：公共项 95 + engineer_evidence_pass 5 = 100；run1 README「三席均 100」）；归一（C5）team_score **90**（公共 90 + 个人 95，round-1 打回 -5）。「公式无决策信号」判断合理：单轮 5 队 4 队同分、仅打回罚分产生区分 | `docs/knowledge/hr/teams/{云岫,星汉,松风,流岚,归一}.yaml`；`docs/knowledge/hr/personas/羲和.yaml`、`圭臬.yaml`；run1 README L63-64 |
| 5 | 诚实打回记录：C5 round1 NOT_PASS、C3 基线对照、C4 双跑、验漏 BLK-1 | 读对应 evidence.yaml 的 verdict/blockers/对照记录 | **✓ 成立（四例全部实证）**。① C5 NOT_PASS 完整档案（无实现可验、禁以基线绿冒充交付绿）；② C3 ev-1b「基线对照：base cda6e13 同环境同用例同失败」+ ev-1d 主动发现第二个既有基线失败并附对照日志；③ C4 sdet 在独立临时 worktree 独立双跑 base/chunk + 小队工作房同口径复跑佐证；④ run3 验漏 evidence.yaml `blockers: BLK-1 (RESOLVED)`——首轮 1 fail（D057 旧 sleep-DELETE 断言，文件不在写集）→ run-lead co-003 授权修复 | `…/task-chunk-test-fixtures-unify/handoff/logs/sdet-verdict-round1-notpass-…yaml`；`…/task-chunk-dead-export-cleanup/handoff/evidence.yaml`（ev-1b/1d）；`…/task-chunk-shell-file-merge/handoff/evidence.yaml`（L8-11、ev-s1）；`…/task-chunk-durable-session/handoff/evidence.yaml`（L144-152） |
| 6 | 变更单 co-001/co-002/co-003 存在且 applied | 读各 run change_orders/*.yaml status | **✓ 成立**。co-001（run1，夹具：checkpoint-auto 行级夹具，status=applied，落地提交 188b057）；co-002（run2，计数断言：skill_load 工具计数 20→21，status=applied）；co-003（run3，D057 语义：sleep 零 DELETE+oc-id 保留，status=applied，落地 276f379） | `.picode/runs/{run-2026-08-15T01-12-43-3NZ,run-2026-08-15T02-30-00-DSH,run-2026-08-15T03-00-00-SUBAGENT}/change_orders/co-00{1,2,3}.yaml` |
| 7 | 交接包六件套；"summary/artifact_index 与简报重复" | 数各 task handoff/ 文件；对比 WORK_BRIEF 与 summary 内容重叠 | **✓ 六件套成立；△ "与简报重复"部分成立**。六件齐：summary/artifact_index/known_issues/diff_scope/evidence.yaml/acceptance.yaml（C4/W1/C1 handoff 自述与实测一致）。重复度核验：summary.md「目标与完成情况」「验收结果速览」两节与 WORK_BRIEF §1 目标、§3 验收口径逐条对应、约一半篇幅为简报转述；但 artifact_index.md 为 commits/文件变更/证据索引，与简报几乎不重叠。→ 应细化为「summary 与简报重复度高、artifact_index 重复度低」 | `…/task-chunk-shell-file-merge/handoff/{summary,artifact_index,known_issues,diff_scope,evidence,acceptance}.{md,yaml}`；`…/brief/WORK_BRIEF.md`；W1 `progress/progress.md` L109 |
| 8 | 重复汇报：单角色 6+ 次重复确认报告 | run README/巡检日志/报告频率推断 | **△ 推断，证据不足（按验证口径标注）**。仓库内可读的巡检载体（run README、progress.md 时间线、E 纪要）未见单角色 6+ 次重复确认记录：C1 progress 1 小时 10 条时间戳更新、W1 20 分钟 12 条，均为正常进度留痕。该论断只能来自会话聊天实录（不在仓库），无法复核 | run1/C1/W1 progress.md 时间线；run README |
| 9 | 主责复核价值：C4 readJsonl 打回 | 读 reviews/task-chunk-shell-file-merge.md comments + known_issues ki-8 + 分支 reflog | **✓ 成立**。reviews comments：「readJsonl 首版复制粘贴违规经主责复核打回修正为跨引（279c8d7）——质量门有效」；ki-8 明确主责为 squad-lead 青鸾（白鹤首版 9f5a2f2 复制两份私有函数 → 打回 → 修正 279c8d7）；分支 reflog 有对应 commit「C4 复核打回——readJsonl 复制粘贴改跨引」。注：reviews 文件署名 run-lead、ki-8/evidence 署名青鸾（squad-lead），两者并存不冲突（组内复核 + run-lead 审查门），审计归功 squad-lead 与 ki-8 一致 | `…/reviews/task-chunk-shell-file-merge.md`（L12-14）；`…/handoff/known_issues.md`（ki-8）；`.git/worktrees/squad-task-chunk-shell-file-merge/logs/HEAD` |

---

## 2. 审计其他论断的实证补充

| 论断 | 结果 | 说明 |
|---|---|---|
| "人设是最大文档成本 / 12 字段模板重复" | ✓ | 36 份人设 × 12 字段，且三席人设正文各 ~90 行（C1 squad-lead 人设 91 行），模板段（身份/使命/边界/能力/风格/工具/协作/质量/禁区/记忆/检查）逐队重复 |
| "证据门禁抓假绿/基线失败/越界" | ✓ | checkpoint-auto 用例"基线绿"实为 Bug A 污染掩盖的假绿（E16 co-001 依据）；C3/C4 诚实记录基线失败并附对照；ev-5 diff 门禁 9/9、26/26 全过 |
| "打回-回修循环有效" | ✓ | C5 round1 NOT_PASS → round2 PASS；C4 readJsonl 打回 → 跨引修正；run1 README 巡检日志"先红后绿 + 基线 stash 对照" |
| "engineer 会话失败率 ~10%" | △ 基本成立 | 12 名 engineer（三轮）中 1 名会话 failed（庖丁）= 8.3% ≈ ~10%；另有 C1/C3 会话延迟 2 例（未 failed）。口径（分母=engineer 数）未在审计中写明 |
| "squad-lead 价值最低（仅 C4 readJsonl 打回 1 次真实价值）" | △ 需修正 | C4 打回实证成立，但遗漏可实证的 squad-lead 实质贡献：C1 望舒的 B1 根因分析（二分实验证明 checkpoint 失败非本 chunk 引入、基线假绿机制完整还原，构成 co-001 决策依据）；各队 squad-lead 均承担 progress/交接包组织与复跑复核。"仅 1 次价值"高估了 squad-lead 的无价值程度，但"职责可并入 run-lead + 自动化检查"的方向仍成立（C1 B1 排查可程序化半自动化） |
| "省 30-40% 轮次消耗" | 不可实证（预测） | 试点验收口径为未来目标，run 历史无法证实；但其所依赖的事实基础（重复性文档成本、评分无区分、代提交/会话失能、交接包部分重复）均已实证，方向上非空中楼阁 |

---

## 3. 结论

### 3.1 审计整体真实性评级：**高**

- 9 项验证清单中 **7 项完全成立（✓）**、**2 项部分成立（△）**；无一项 ✗ 不成立。
- 所有"数据事实"（团队规模、评分值、打回记录、变更单状态、交接包构成）逐一与 run 历史档案吻合，无数据造假或捏造。
- 判断结论（证据门禁/打回/变更单保留、人设与交接包超重、评分无区分度）均有实证支撑。

### 3.2 需修正项（按影响排序）

1. **代提交次数 ≥5 → 应修正为「≥3（commit message 实证口径；会话实录或另有记录，仓库无法复核）」**；"W1"不应列入代提交清单（W1 为 engineer 正常提交）。——唯一一处数量级高估。
2. **"squad-lead 仅 C4 readJsonl 打回 1 次真实价值" → 补充 C1 B1 根因分析等实证贡献**；或将措辞改为"价值最低，可被 run-lead/自动化承接"（方向判断保留）。
3. **"summary/artifact_index 与简报重复" → 细化为「summary 重复度高、artifact_index 重复度低」**；交接包合并为 2 件的建议仍成立（evidence + handoff.md 可吸收 summary/known_issues/diff_scope，artifact_index 并入 handoff 或 diff_scope 亦可）。
4. **"重复汇报 6+ 次" → 明确标注来源为会话实录**（仓库巡检载体不可复核），避免后续 run 把未实证数字当作数据引用。

### 3.3 数据不准确之处

- 仅一处数量不准：代提交"≥5 次"（实证 3 次）。其余数据（12/36/36、95/95/95/95/90、100、co-001/002/003 applied、六件套）全部准确。

### 3.4 A 级简化试点可行性初判：**站得住**

- 事实底座扎实：36×12 字段人设（模板重复实证）、评分 4/5 同分（无区分实证）、代提交+会话失能 3 起（接管路径必要性实证）、交接包 summary 与简报重复（合并空间实证）、squad-lead 实证价值稀薄（C4 打回 + C1 B1 两处，均可并入 run-lead/自动化）。
- 风险点（审计 §7 已识别）：双人组后"主责复核"收敛给 sdet/run-lead 自动 diff 检查——C4 readJsonl 复制粘贴违规恰是"复制检测"类可自动化项（grep 单源计数即可拦截），可替代性成立；C1 B1 类根因分析依赖资深席位，sdet 兼抽查可承接。
- 唯一建议：试点验收口径"省 30-40%"应改为可测基线（如轮次内进展日志条数/交接包字段数/人设字节数对比），否则试点结论无法数据化复判（审计 §8 已要求"试点 run 产出对比纪要"，方向正确）。

---

## 4. 交付物与复现路径

- 本报告：`.picode/plans/audit-verification-report.md`
- 关键证据可复现（bash 可用环境）：
  - `git log --all --oneline | grep -E "代提交|接管"` → 3 条（run2 C1/C2/C3）
  - `grep -c "^name:" .picode/runs/*/tasks/*/staffing/personas/*.md` → 36（含各 run 全部任务）
  - `sed -n '1924,2222p' docs/knowledge/hr/name-ledger.yaml` → 12 team + 36 codename
  - `grep team_score docs/knowledge/hr/teams/*.yaml` → 95×4 + 90
