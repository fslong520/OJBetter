# TODO：多模态支持 —— 用户可选择图片

> 为 OJBetter 增加图片上传/粘贴/预览能力，使 AI 教练能"看"到题目截图、手绘图、代码截图等。

---

## 1. 调研分析（已完）

关键改造链路已梳理：

```
用户选择图片 → FileReader → base64
    ↓
sidepanel.js: 暂存 attachments[]，合并 text → content 数组
    ↓  chrome.runtime.sendMessage
background.js: startStreaming → 透传
    ↓
providers.js: _streamRequest → messages.content 为数组 → fetch API
    ↓
流式回写 → 侧边栏渲染
```

受影响的模块：
- `sidepanel/sidepanel.html`    — UI 组件
- `sidepanel/sidepanel.js`      — 图片收集、预览、发送
- `sidepanel/sidepanel.css`     — 图片样式
- `src/ai/providers.js`         — 支持 content 数组格式
- `src/background.js`           — 透传 attachments
- `src/storage/history.js`      — 图片存储策略
- `src/coach/personas.js`       — 提示词说明
- `settings/settings.html`      — 多模态开关
- `src/content.js`              — 截屏功能（可选）

---

## 2. UI：图片上传与粘贴

- [ ] 聊天输入区增加 **📎 附件按钮**，触发 `<input type="file" accept="image/*">`
- [ ] 支持 **Ctrl+V 粘贴**图片（clipboard API → File → base64）
- [ ] 输入区上方显示 **图片预览条**（缩略图 + 删除按钮）
- [ ] 输入框高度随图片自动调整
- [ ] 限制单次最多 5 张图片

## 3. UI：图片渲染与查看

- [ ] 聊天气泡支持渲染 `image_url` 内容（行内缩略图，max-width: 240px）
- [ ] 点击缩略图弹出 **大图查看**（全屏遮罩层 / lightbox）
- [ ] 大图查看时支持左右切换（多图场景）
- [ ] 图片旁显示文字内容

## 4. 消息模型

- [ ] 定义 `Attachment` 类型：`{ id, name, type, data(base64), preview(dataURL缩略图) }`
- [ ] `state.attachments` 暂存当前输入区的图片
- [ ] `sendCoachMessage` 将 text + attachments 合并为 content 数组
- [ ] `chatHistory` 中的 message.content 支持 string | array 两种格式
- [ ] 历史加载时兼容旧格式（纯 string）

## 5. AI Provider（providers.js）

- [ ] `_streamRequest` 检测 messages 中 content 是否为数组，若是则原样发送
- [ ] `coachChat` 接收 attachments 参数，拼接为 content 数组
- [ ] `translateStream` 同样支持（截图翻译场景）
- [ ] 注意：system prompt 的 content 仍为 string，不需要改

## 6. 背景层（background.js）

- [ ] `startStreaming` 的 message 中增加 `attachments` 字段
- [ ] 透传给 `hintGenerator.coachChat(problemText, chatHistory, attachments, ...)`
- [ ] 同样处理 `startPlanStreaming`（学习计划不涉及图片，可忽略）

## 7. 图片压缩

- [ ] 上传前自动压缩：Canvas 重绘 → 最长边 ≤ 1200px，quality ≤ 0.8
- [ ] 超过 4MB 的原始图片给出提示
- [ ] 压缩后仍 > 20MB 的拒绝上传（API 限制）
- [ ] 压缩逻辑封装为 `compressImage(file): Promise<base64>`

## 8. 历史存储

- [ ] `addHistory` 记录中增加 `attachments` 字段
- [ ] 存储时图片自动缩略（最长边 ≤ 400px），减少存储占用
- [ ] 历史回显时 `loadHistoryConversation` 渲染图片
- [ ] 设置页增加「历史记录保存图片」开关（默认开）
- [ ] 导出 JSON 时包含图片数据（可选带图/不带图）

## 9. 设置页

- [ ] 「AI 参数」标签下增加「多模态（图片识别）」说明
- [ ] 免费模型 `big-pickle` 若支持 vision 则自动启用
- [ ] 自定义模型增加「支持图片识别」勾选（手动标注）
- [ ] 测试接口时增加图片测试选项

## 10. Content Script（可选）

- [ ] 页面截屏能力：点击浮标时截取当前可视区域
- [ ] 区域截图：用户拖选页面某区域截图
- [ ] 截图自动附加到侧边栏输入区

## 11. Persona 提示词

- [ ] `COACH_STRATEGY` 中更新安全限制：「学生发送图片时，分析其中的题目内容或代码截图进行指导」
- [ ] 各风格 persona 中加入「可以接收图片」的说明
- [ ] 翻译 prompt 中加入「如果包含图片中的文字，一并提取翻译」

## 12. 测试验证

- [ ] **上传测试**：jpg/png/webp 格式，大小边界（1KB ~ 20MB）
- [ ] **粘贴测试**：截屏工具截图(Ctrl+V)、网页图片复制
- [ ] **多图测试**：同时发送 3~5 张图片
- [ ] **历史回显**：保存后重新加载，图片正常显示
- [ ] **大图超限**：超过 20MB 或超宽超高时友好提示
- [ ] **压缩测试**：原图 10MB，压缩后 ≤ 1MB
- [ ] **兼容测试**：免费模型 / 自定义模型 / 不支持 vision 的模型降级
- [ ] **存储限额**：chrome.storage.local 限额 10MB，图片多时提示

---

## 优先级标记

| 标记 | 含义 |
|------|------|
| 🔴 P0 | 阻塞，必须先做 |
| 🟡 P1 | 核心功能，必须完成 |
| 🟢 P2 | 体验优化，可延后 |
| ⚪ P3 | 锦上添花，有空再做 |

### 执行顺序建议

```
Phase 1 (P0-P1):  4→5→6→2  (消息模型 → Provider → Background → UI上传)
Phase 2 (P1):     7→3→8    (压缩 → 预览 → 历史)
Phase 3 (P2-P3):  9→10→11→12 (设置 → 截屏 → 提示词 → 测试)
```
