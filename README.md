# dsh-workspace-focus

给 **DeepSeek Harness (DSH)** 的 Web 客户端用的非官方插件：手动把侧边栏"工作区"列表聚焦到**当前对话所在的工作区**，一个图标按钮即可开关。

> Unofficial community plugin for the DeepSeek Harness web client. It focuses the sidebar workspace list on the workspace that owns the open conversation, toggled by one icon button (no text).

## 效果

默认显示完整的工作区列表；对话区左上角（对话标题左边）有一枚 28px 图标按钮：

| 状态 | 图标 | 点击后 |
| --- | --- | --- |
| 默认 | 网格/取景框 | 聚焦当前对话所在工作区：只保留这条分支，其他工作区隐藏 |
| 聚焦中 | 品牌色返回箭头 | 回到全部工作区 |

- 聚焦**只跟随当前对话**：换到另一个工作区的对话，侧边栏就聚焦那个工作区，直到手动关闭
- 上级工作区只保留标题行作为路径提示，不再展示它们自己的对话
- 当前工作区自己的对话仍遵守宿主原生的"展开其余"水位线（默认 5 条，点一下多显示 5 条）
- 全局搜索（Mod+K）不受影响，始终搜全部
- 不属于任何工作区（"未分组"）的对话：不显示按钮，也不会过滤
- 纯手动：没有"打开对话就自动聚焦""点工作区就自动进入"之类的自动行为

## 安装

插件是一个普通 DSH bundle（`package.json` 里声明 `dsh.bundle.patch` 和 `dsh.client`）。

**从本地目录安装**：把仓库目录交给插件管理器的 `install_bundle`（或 `dsh plugin add <目录>`），然后刷新 Web 页面加载浏览器端模块。

**从 npm 安装**（该包发布到 npm 后）：

```bash
dsh plugin add dsh-workspace-focus
```

**从 GitHub 安装**：

```bash
dsh plugin add github:<你的名字>/dsh-workspace-focus
```

安装后重启/刷新页面即可在对话区左上角看到按钮。

## 实现

- 在 `conversation.header.leading` 槽位注册一枚图标按钮，读取宿主标准的 `useSessions` / `useWorkspaces` 快照钩子判断当前对话所属工作区
- 聚焦时渲染一条 `:has()` 样式表：隐藏不属于当前分支的工作区分组，以及路径上上级工作区自己的对话行
- 不修改宿主状态、不写会话日志；关闭聚焦即恢复，卸载插件也完全恢复
- 依赖宿主侧边栏的行标记（`data-row-key="workspace:<id>"` / `"session:<id>"`，以及行外面的 HoverCard `<span>` 包装）。这些是宿主内部结构：如果将来 DSH 升级改掉它们，过滤会**静默失效**、列表回到普通渲染（不会报错），届时按新版 DOM 调整 `client.js` 里的 `focusCss()`

## 开发

```bash
node --test test/smoke.mjs   # 无需安装依赖
```

单测用极小的 React / DOM 替身覆盖：槽位注册、默认不过滤、手动开关、图标-only 渲染、聚焦跟随当前对话、未分组对话不渲染控件。

```
client.js           浏览器端模块（module loader 工厂）：按钮 + 聚焦样式表 + 本地化
index.js            Host 端壳（无行为）
cordis.patch.yml    插入插件行
locale/{zh,en}.json 插件管理器里的标题/描述
icon.svg            插件图标
```

## License

MIT
