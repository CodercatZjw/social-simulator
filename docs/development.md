# 开发与验证

## 本地运行

需要 Node.js 24+ 与 npm。测试使用 Node 原生 TypeScript 加载，无需额外编译器。

```sh
npm run launch
```

启动器根据依赖锁文件安装依赖，每次启动重新构建，使用 Vinext 的 Node 服务启动网站。安装记录位于忽略提交的 `.local-run/`。默认只监听本机，地址为 [http://localhost:3000/](http://localhost:3000/)。

```sh
npm run launch -- --port 3001 --no-open
```

服务已存在时不会重启或覆盖它；源码更新后先停止原服务再启动。被其他程序占用的端口会给出提示，不会结束其他程序。

修改界面时可使用热更新开发模式：

```sh
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3000
```

若开发模式无法就绪，停止它并运行 `npm run launch`。`npm start` 保留为 Sites / Cloudflare 构建产物的 Wrangler 预览入口，需要先执行 `npm run build`。

## 检查

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

数值测试覆盖确定性、存档恢复、遗传方差、可塑性、人口与账目守恒、继承、雇佣有效性、无供给/无现金、分支、Worker 通信和历史回溯。生成的 shadcn 组件保持原样，静态检查只检查项目拥有的代码。

运行全部数值对照：

```sh
npm run experiments
```

默认每个情景采用 160 人、300 年、20 个种子，六组规则共 120 个世界。结果保存到 `tests/experiment-results.json`，可指定其他输出位置：

```sh
npm run experiments -- results.json
```

## 实现位置

| 位置 | 内容 |
| --- | --- |
| `lib/simulation/` | 纯数值引擎、状态类型、Worker 协议、回溯与本机存档 |
| `app/workbench.tsx` | 中文模拟工作台与交互 |
| `components/lab-charts.tsx` | 社会与市场图表、个体轨迹 |
| `components/world-timeline.tsx` | 历史月份选择与还原进度 |
| `lib/seek-scheduler.ts` | 时间轴拖动请求调度 |
| `scripts/launch.mjs` / `start.cmd` | 跨平台启动器 / Windows 双击入口 |

使用 React、TypeScript、Vinext、Recharts 与 Web Worker；网站计算不依赖远程模型服务。

## README 演示

`assets/demo.gif` 与 `assets/demo.mp4` 来自本项目真实浏览器操作。演示运行默认人口 2,000、种子 `20260909` 的相同财富开局，切换「天资 × 财富」、回看历史，并查看市场和个体。为便于阅读，删去了部分计算等待；画面中的数值与月份来自实际模拟。

录制使用独立浏览器会话，不读取个人存档。演示工具不属于运行依赖，启动项目无需安装 Playwright 或 FFmpeg。

## 常见启动问题

- **提示找不到 Node.js**：安装 Node.js 24+，重新打开终端或重新双击 `start.cmd`。
- **依赖下载失败**：确认 npm 可以联网后重新启动；安装成功前不会写入完成标记。
- **端口占用**：停止自己之前的启动窗口，或加上 `--port 3001`。
- **浏览器没有自动打开**：手动访问启动窗口显示的本地地址。
- **没有找到上次进度**：存档属于浏览器与网址；使用相同浏览器、域名和端口，或导入先前导出的 JSON。
