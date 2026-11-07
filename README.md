# MedMind · 医学生临床案例 3D 问题图谱 MVP

面向教学演示的 React + TypeScript + Vite 前端与 Express 后端。默认无模型密钥也可以使用示例病例生成分层问题图谱。

## 项目结构

```text
server/src/       Express API、Mock 生成器、图谱校验
server/examples/  示例 TXT 病例与示例图谱 JSON
src/components/  Harness、3D 图谱、2D 大纲、详情与测评
src/store/        Zustand 配置与学习进度状态
```

## 运行

要求 Node.js 20 或更新版本。

```bash
npm install
npm run dev
```

前端默认在 http://localhost:5173，API 在 http://localhost:8787。`npm run build` 可构建前端产物；`npm start` 启动 API。

## 演示流程

1. 打开左侧“案例上传与生成”，上传 `server/examples/sample-case.txt`。
2. 点击“生成 3D 问题图谱”。默认会生成约 29 个问题节点、五个范畴、三个问题层级和前置依赖。
3. 拖动旋转、滚轮缩放 3D 场景；点击节点阅读内容并完成选择题。左上“2D 大纲”可切换到径向层级列表。先完成基础节点，依赖它们的临床问题才会解锁。
4. Harness 参数和侧栏状态存于 localStorage；API Key 不会存入 localStorage。

## 自定义模型 API 与密钥

Harness 提供 API Base URL、模型名称和 API Key 的表单位置。当前 API Key 只保留在当前页面内存，不持久化；MVP 生成端点使用 Mock 生成器，不会把该 Key 或患者案例发送到外部服务。Temperature、top_p、max_tokens、systemPrompt 和 preset 会真实传给 `/api/generate-graph` 并返回确认信息。

要启用真实模型，后续应在**后端**实现兼容模型服务的代理，密钥通过服务端环境变量注入，例如 `LLM_API_KEY`；不要让浏览器直接调用模型或把患者数据发送到第三方。还需增加提供商白名单、超时/错误处理、输出校验与脱敏确认。前端 API 地址和模型字段目前用于 Harness 配置演示，不会触发第三方连接。

## API

- `GET /api/health`：后端状态与 Mock/已配置模式。
- `POST /api/generate-graph`：接收 `{ text, title, template, harness }`，返回图谱、校验结果及 Mock 说明。
- `POST /api/progress`：接收 `{ caseId, nodeId, action, prerequisites }`，模拟服务端进度校验；依赖未完成时拒绝完成请求。

图谱校验包含唯一中心节点、节点 ID、layer 范围、类别/颜色映射、引用、前置节点存在性、依赖 DAG 无环与测评答案校验。校验失败返回错误，可重新生成。

## 学习通与扩展限制

已支持导出图谱 JSON；SCORM、iframe 和学习通任务点以界面预留按钮展示，未实现平台 API 调用。后续对接需申请超星开放平台 / LTI 权限并完成平台侧授权。

MVP 节点规模约 30 个。扩展至 200–500 个时，可采用按层/邻域增量渲染、标签抽稀、实例化几何、WebGL 性能降级与服务端分页，并在移动端默认 2D。PDF 解析使用浏览器 PDF.js；扫描件 OCR 不在范围内。

## 假设与教学安全

- 未提供外部 LLM 服务凭据，默认运行本地 Mock。
- Mock 教材来源统一标记“待教师补充”，不伪造教材页码或原文；示例病例为虚构内容。
- AI 生成内容需教师审核。所有内容仅供教学辅助，不替代临床决策。上传前请删除姓名、证件号、联系方式等身份信息。
- 本地学习状态和后端内存进度用于演示；服务重启后后端进度清空，尚未接入数据库或账号权限。
- 自定义 API 表单暂不连接提供商。要向外部模型发送案例，需自行配置服务端代理并对案例脱敏。
