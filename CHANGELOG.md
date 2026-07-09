# 更新日志

## v1.3.0 (2026-07-09)

### ✨ 新功能

- **AI自适应教学**：去除硬编码四阶段轮换（理解题意→启发引导→画流程图→伪代码调优），AI根据学生回答动态选择教学路径——理解偏了纠偏，思路对了推进，写了代码引导调试
- **头脑风暴AI按需选角**：去除固定质疑者/联想者/出题人三角色轮换，AI根据解题阶段和讨论内容自主选择切入角度
- **反作弊保护强化**：检测完整C++代码并加入混淆标记，防止直接复制粘贴；反复索要也绝不妥协
- **Service Worker 保活修复**：alarm周期改1分钟 + session心跳 + 活跃流检查，解决意外休眠

### 🐛 Bug 修复

- **DOMPurify 消毒**：renderMarkdown 输出经 DOMPurify 过滤，防止 XSS 注入
- **帮助文字更新**：去除四阶段硬编码描述，改为自适应教学描述

## v1.2.0 (2026-07-08)

### ✨ 新功能

- **启发式引导阶段管理器**：新增 stage 追踪（0-3），AI 按阶段只注入对应策略 prompt，减少无关信息干扰
- **阶段可视化**：聊天标题头实时显示当前阶段（🧠理解题意 → 🔍启发引导 → 📋画出思路 → 📝伪代码与调优）
- **阶段控制按钮**：支持手动 ◀▶ 进退阶段，不触发 API 调用
- **教练人格系统重构**：四种风格（专业温和/热情鼓励/幽默风趣/直截了当）现在真正可区分，每条风格含 6 条命令式硬规则
- **错误信息友好化**：7 处技术性错误替换为青少年友好语言（如"小智想太久了，点一下重新试试吧"）
- **enableThinking 设置修复**：设置页"显示思考过程"开关现在实际生效

### 🐛 Bug 修复

- **灵光一闪发送无效**：BrainstormEngine._streamRequest 未将 status 切回 student_turn，导致发送按钮被挡
- **思考过程闪烁**：showThinking 在 onThinking 回调中每次清空内容，导致思考过程仅显示 2-3 字即灭
- **思考过程截断太快**：截断阈值 150 → 3000
- **sb 变量重复声明**：bindEvents 内两次 `const sb`
- **页面数据采集破坏 KaTeX**：innerText 在 KaTeX 的 <msub>/<msup> 间插入换行符，改用 textContent
- **personas.js 模板字面量嵌套反引号**：导致扩展加载失败、service worker 注册失败
- **教练人格 key 不匹配**：settings value="sarcastic" 但代码中定义 key="direct"，第四种风格永远回退为默认
- **调试模式绕过人格**：DEBUG_COACH_PROMPT 硬编码，无视用户选择的教练风格
- **帮助说明滞后 UI**：已移除的浮标按钮仍出现在帮助面板中
- **showError 拼写错误**：`'assitant'` → `'assistant'`

### 🎨 优化

- **调试引导升级**：AI 现在指向具体代码行号 + 建议 cout 输出位置 + 提供完整可运行测试数据
- **灵光一闪提示词重写**：质疑者/联想者/出题人三种角色更活跃接地气
- **COACH_STRATEGY 按阶段裁剪**：prompt 长度缩减 60%+，降低 token 消耗
- **教练人格前置改为后置**：利用近因效应提升风格遵从业
- **灵光一闪思考过程流式输出修复**：不再每块清空内容，累积显示
- **思考区域默认高度 120px → 150px**，显示更多思考内容

### 📦 打包

- 更新版本号至 1.2.0
- 打包文件：`OJBetter-v1.2.0-store.zip`

### 🔧 代码优化

- **抽取公共流式模块**：新增 `src/lib/stream-fetcher.js`，消除 providers.js / BrainstormEngine.js / generator.js 三处重复的 SSE 流式解析代码（约 260 行）
- **修复预览删除索引错位**：附件删除改用 `att.id` 精确匹配，避免 splice 后误删
- **修复导出 loadingText 竞态**：移除 handleExport 中对加载文字的覆写/恢复冲突
- **renderMarkdown 增强**：支持 Markdown 表格（`<table>`）与链接（`<a>`）渲染
- **coachChat HTML 实体修正**：先解码 HTML 实体（如 `&lt;` → `<`）再清理标签，避免信息丢失
- **background.js keepalive 泄漏修复**：`startStreamKeepalive` 移入 try 块，异常路径正确回收 `_activeStreams`
- **文档同步**：README 架构树补充新模块、导出格式更正为 Markdown；CERTIFICATION_NOTES 版本号更新至 1.2.0
