# 多模态图片上传/粘贴/预览 UI — 实现记录

## 日期
2026-06-03

## 改动文件
- `sidepanel/sidepanel.html` — 新增 attach-btn、file-input、preview-bar
- `sidepanel/sidepanel.css` — 新增 attach-btn / preview-bar / preview-item / lightbox / chat-attachment-img 样式
- `sidepanel/sidepanel.js` — 新增 attachments 状态管理、handleFiles、handlePaste、renderPreviews、showLightbox

## 数据流
- `state.attachments` 存储当前输入区附件 `[{ id, name, type, data(base64) }]`
- `sendCoachMessage` → `startStream` → `sendMessageSafe({ type: 'startStream', ..., attachments })` → background.js destructures `attachments = []`
- providers.js 的 `coachChat` 和 `translateStream` 已接收 attachments，转为 `content: [{ type: 'text', text }, { type: 'image_url', image_url: { url } }]`
- 聊天气泡渲染后，点击图片 → `showLightbox(src)` → 全屏遮罩

## 约束
- 单次最多 5 张
- 仅接受 `image/*` 类型
- FileReader 异步转 base64
- Ctrl+V 粘贴仅拦截图片，文字粘贴不受影响

## 注意事项
- `.attach-btn` 样式与 `.stt-btn` 一致（34x34, 圆形, Morandi 色系）
- `renderPreviews()` 在 attachment 增减后均调用
- 删除按钮使用 `data-idx` 索引定位，重新 render
- `resetToWelcome()` 清空 attachments
