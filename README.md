# picode

基于 [Pi](https://pi.dev/) 的 **通用多智能体编码运行时**（可配置 · 领域中立）。

## 文档（实现必读）

|文档|说明|
|------|------|
|**[docs/README.md](./docs/README.md)**|文档中心与地图|
|**[docs/PROCESSES.md](./docs/PROCESSES.md)**|全部业务流程|
|**[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)**|系统架构一页纸|
|**[docs/standards/terminology.md](./docs/standards/terminology.md)**|术语口径|
|**[docs/GETTING_STARTED.md](./docs/GETTING_STARTED.md)**|安装与 CLI|

## 代码

```bash
npm install && npm run build && npm test
```

|包|职责|
|----|------|
|`@picode/core`|配置、路径、工具画像|
|`@picode/bus`|token + 房间 ACL|
|`@picode/orchestrator`|状态机 CLI|
|`@picode/pi-extension`|Pi 工具扩展|

## 状态

文档按 A–F 分类（见 `docs/AUTHORITY.md`）：流程 / 术语单源；岗位全目录在 `docs/reference/glossary.md`。  
MVP 骨架可编译测试；真 Pi 会话需本机安装 Pi 与模型。

## License

[MIT](./LICENSE) — Copyright (c) 2026 webees
