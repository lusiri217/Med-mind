# Med-mind · MedMind 临床案例问题图谱

面向医学教学的交互式临床案例学习网页：把一份病例整理成 3D 知识图谱、2D 问题大纲与可自由排布的输入卡片，并能与 AI 扮演的患者进行模拟问诊。

**当前版本是纯静态站点**：React + TypeScript + Vite 构建后就是一组静态文件，没有运行中的后端、没有 `/api` 请求、没有外部 CDN。AI 能力采用 BYOK（Bring Your Own Key）——访客在页面里填自己的模型地址与密钥，请求由浏览器直接发往该地址，站点不转发、不保存。打开链接即可浏览预置案例，填入 API Key 后即可使用完整生成与问诊功能。

## 主要功能

- **模拟问诊**（默认首屏）：AI 扮演患者，按主诉与现病史等 5 个阶段推进；右侧 DNA 双螺旋进度模型可切 3D / 2D，手机端自动降级为聊天界面 + 顶部细进度条。提示词可在设置中编辑。
- **3D 问题图谱**：5 套几何模板共用同一份图谱数据 —— 星系同心轨道、方案中心发散、诊疗时间轴（DNA 双螺旋）、分层推理树、知识域聚类。可暂停 / 恢复旋转、拖拽缩放、点击节点看详情与测评。
- **2D 病例大纲**：按「第 3 层基础知识 → 第 2 层机制与诊断 → 第 1 层临床决策 → 病例最终解决方案」自上而下逐层解锁。
- **2D 卡片画布**：把病例内容拆成可拖拽、可连线的输入卡片，独立于案例图谱保存。
- **神经元 · 案例图谱**：保存生成过的案例（上限 10 个）随时回看；内置 5 个预置教学病例（COPD 急性加重、急性前壁心肌梗死、糖尿病酮症酸中毒、急性缺血性脑卒中、社区获得性肺炎），每个含 29 个问题节点。
- **模型调试 / 紧急停止**：集中管理 API 配置、提示词、连通性测试与「API 抹除」；紧急停止会中止在途请求并抹除本机保存的密钥。

## 本地运行

要求 Node.js 20 或更新版本。

```bash
npm install
npm run dev:client     # 只启动前端，默认 http://localhost:5173
npm run build          # 类型检查 + 构建，产物在 dist/
npx vite preview --port 4173   # 预览构建产物
```

`package.json` 里的 `npm run dev`（同时拉起 Vite 与旧 Express 原型 8787）和 `npm start` 属于早期版本遗留；当前静态版**不需要**启动后端。`server/` 目录仅作为历史原型保留，不参与构建与运行。

> 请通过 HTTP 服务访问，不要直接双击 `dist/index.html`（`file://` 下 SPA 资源路径与浏览器 fetch 会失效）。

## 配置自己的模型 API（BYOK）

打开左侧 **设置 → 模型调试** 填写：

| 字段 | 说明 |
| --- | --- |
| API Base URL | 不预置任何厂商地址，例如 `https://api.openai.com/v1`、自建 OpenAI 兼容网关，或 Anthropic 兼容地址 |
| 协议 | OpenAI 兼容（请求 `/chat/completions`）或 Anthropic（请求 `/v1/messages`） |
| 模型名称 / API Key | 由访客自行填写 |
| 记住配置 | 勾选后写入浏览器 localStorage；取消则仅在当前页面会话有效，刷新需重填 |

- **未填 Key 也能使用**：内置 5 个预置案例与本地演示生成器，打开链接即可浏览图谱、大纲与卡片，不发起任何网络请求。
- 生成时模型只负责「选模板 + 填内容」，图谱结构、校验与布局由前端固定代码完成；输出不合格会回退本地演示图谱并说明原因。
- 密钥、案例文本、图谱、卡片、问诊记录**都只存在访客自己的浏览器**（`medmind-api-settings`、`medmind-case-text-v1`、`medmind-harness-v1`、`medmind-cards-v1`、`medmind-consult-v1`），不同设备不互通，清除浏览器站点数据即可全部删除。
- 请求直接从浏览器发往所填 Base URL，因此需要该服务允许浏览器跨域（CORS）；若报连接错误，优先检查地址、协议与跨域设置。可用「连通性测试」先验证。

## 静态部署

```bash
npm run build
# 把 dist/ 整个目录上传到任意静态托管
```

- Cloudflare Pages：构建命令 `npm run build`，输出目录 `dist`。
- `public/_redirects` 提供 `/* /index.html 200` 的 SPA 回退；`public/_headers` 设置带哈希资源的强缓存与 `.mjs` MIME。
- 站点刻意**不设置 CSP / connect-src**：BYOK 需要允许访客浏览器直连自己填写的任意模型端点。
- 字体（woff2）与 PDF.js worker 均已本地打包，运行时零外部请求。

## 目录结构

```text
src/
  App.tsx              四态视图（问诊 / 3D 图谱 / 2D 大纲 / 卡片画布）
  components/         侧栏、聊天、双螺旋、3D 图谱、大纲、卡片、详情抽屉
  consult/            模拟问诊：提示词、多轮会话、案例文本、双螺旋几何
  llm/                BYOK 请求出口、两阶段 prompt、模板推荐与 JSON 解析
  layouts/            5 套 3D 布局（orbit / radial / timeline / tree / cluster）
  graph/              生成入口、本地演示生成器、图谱校验
  presets/            5 个预置教学病例
  cards/              卡片画布的数据、导入导出与历史
  store/              Zustand 状态与 localStorage 持久化
  config/             BYOK 配置的读写、抹除
  aiSwitch.ts         全局 AI 请求登记与紧急停止（中止在途请求）
  assets/fonts/       本地字体
public/               favicon、_redirects、_headers
server/               早期 Express 原型（历史参考，静态版不调用）
```

## 隐私与教学安全

- 上传或粘贴病例前请先脱敏，删除姓名、证件号、联系方式等可识别信息。
- AI 生成内容需教师审核；预置案例中的教材引用统一标记为「请核对指定教材」，不伪造页码或原文。
- 扫描件 PDF 不支持 OCR；PDF 文本解析在浏览器内完成（PDF.js）。
- 本项目仅供教学辅助，**不替代临床决策**。
