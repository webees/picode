# skills/ 顶层索引（router · M4）

picode 技能顶层索引。模型据此路由到对应 skill；skill 增删改后**本页必须同步**（防「会撒谎的 router」，见 M4）。

## Bucket 分级

|Bucket|路径|一句话描述|
|------|----|----------|
|Engineering|`skills/engineering/`|日常代码工作（实现、重构、测试、评审）|
|Productivity|`skills/productivity/`|日常非代码流程（简报、规划、写作、研究整理）|

非以上两 bucket 的技能不进索引、不参与路由（M1）。每 bucket 自身索引见 `skills/engineering/README.md` 与 `skills/productivity/README.md`。

## 调用模型（M3）

SKILL.md frontmatter 声明调用边界：

- `disable-model-invocation: true` → **user-invoked**（仅人类可调，模型不得擅自触发）
- 未声明 → **model-invoked**（模型可自主调）

高影响技能一律 user-invoked，防模型擅自触发。

## 技能表（router 主体）

|Skill|Bucket|描述|调用|
|-----|------|----|----|
|_（暂无）_|—|—|—|

> 待 skills/ 首批技能落地后按 [维护纪律](../docs/standards/doc-style.md#6-技能维护纪律) 逐行登记；未登记行等于不存在。

## 维护纪律

- 增/改/删技能 → 同步本 router + 所属 bucket README + docs 页 + 跑校验。  
- 权威规则见 [docs/standards/doc-style.md §6](../docs/standards/doc-style.md)。
