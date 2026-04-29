# OJBetter - 渐进式 AI 编程助教

<div align="center">

**引导孩子独立思考，用流程图和伪代码启发编程思维**

[![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-v1.0.0-green?style=flat-square)](https://github.com/fslong520/OJBetter)
[![Edge Extension](https://img.shields.io/badge/Edge%20Extension-v1.0.0-blue?style=flat-square)](https://github.com/fslong520/OJBetter)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)]()

</div>

---

## 📖 什么是 OJBetter？

OJBetter 是一款 Chrome 扩展，作为渐进式 AI 编程助教，专为信奥赛学生（8-16岁）设计。不同于直接给答案的 AI 工具，OJBetter 通过四阶段引导，培养学生的独立思考能力：

| 阶段 | 图标 | 内容 | 目标 |
|------|------|------|------|
| **理解题意** | 🧠 | AI 引导学生用自己的话复述题目 | 确保理解正确 |
| **灵光乍现** | 🔍 | 给出方向性提示（一句话） | 启发解题思路 |
| **画出思路** | 📋 | ASCII 流程图 + 关键步骤 | 明确算法流程 |
| **落笔成文** | 📝 | 中文伪代码 + 易错点 | 最终代码实现 |

---

## ✨ 功能特性

### 🎯 渐进式引导
- **不一次性给答案**：AI 像教练一样，每次只给一点点方向
- **多轮对话**：根据学生对题意的理解程度，动态调整提示深度
- **禁止自由聊天**：只回答与当前题目相关的问题，防止学生破限

### 🛠️ 核心技术
- **Chrome Side Panel**：侧边栏界面，不打断浏览体验
- **流式输出**：AI 思考过程和回答实时显示
- **Storage 流式传输**：告别 `chrome.runtime.connect` 端口断开问题（已彻底解决）
- **自动题目捕获**：自动提取页面题目 HTML，AI 自行处理 LaTeX/KaTeX

### 🌐 翻译功能
- 一键将英文题目翻译为中文 Markdown
- 保留所有数学公式、输入输出格式、样例数据
- 只翻译不解释，纯粹的题目转换工具

### 📚 学习辅助
- **历史记录**：保存所有提示记录，方便复习
- **学习计划**：自动生成个性化学习路径
- **多模型支持**：OpenCode Zen 免费模型 / 自定义 OpenAI 兼容 API

---

## 🚀 安装方法

### 方式一：从 Chrome 网上应用店安装（待上架）
> 上架审核中，敬请期待...

### 方式二：开发者模式加载（Chrome / Edge 通用）
1. 克隆仓库：
   ```bash
   git clone git@github.com:fslong520/OJBetter.git
   cd OJBetter
   ```

2. 打开浏览器扩展页：
   - **Chrome**：`chrome://extensions/`
   - **Edge**：`edge://extensions/`

3. 开启右上角**开发者模式**

4. 点击**加载已解压的扩展程序**，选择 `OJBetter` 文件夹

5. 扩展安装完成！（Edge 浏览器完全兼容）

---

## 📝 使用方法

### 1. 灵光一下（核心功能）
1. 打开任意编程题库网站（LeetCode、洛谷、AcWing 等）
2. 点击页面上的 **✨ 灵光一下** 按钮，或点击扩展图标
3. AI 会自动捕获题目，开始引导对话
4. 在对话框中输入你的想法，AI 会根据你的理解程度逐步深入

**示例对话流程**：
```
🦉 小智：先说说看，这道题在问什么？
🧑 学生：判断三个数是否满足条件...
🦉 小智：对的！想想条件判断的关系 🔍灵光乍现
🧑 学生：需要先读入 A B C，然后判断...
🦉 小智：[给出 ASCII 流程图] 📋画出思路
🧑 学生：[贴出代码]
🦉 小智：[给出伪代码 + 易错点] 📝落笔成文
```

### 2. 翻译题目
1. 在题目页面点击 **🌐 翻译成中文**
2. AI 自动提取题目 HTML，转换为中文 Markdown
3. 翻译结果会自动填入输入框

### 3. 右键菜单
- 选中题目文字 → 右键 → **✨ 灵光一下，小智帮你**

### 4. 历史记录
- 点击侧边栏右上角 **📜** 按钮查看历史提示记录
- 点击任意记录可重新加载该题目的提示

---

## ⚙️ 配置说明

点击侧边栏右上角 **⚙️** 进入设置页面：

### 免费模型（默认）
- **API 地址**：`https://opencode.ai/zen/v1`
- **模型**：`big-pickle`（自动从 `/models` 拉取最新列表）
- **无需 API Key**，零门槛使用

### 自定义 API
- 支持任何 OpenAI 兼容的 API（如 OpenRouter、本地 Ollama 等）
- 填写自定义 Base URL、模型名称、API Key
- 点击 **测试连接** 验证可用性

---

## 🏗️ 技术架构

```
OJBetter/
├── manifest.json           # 扩展配置（Manifest V3）
├── sidepanel/             # 侧边栏界面
│   ├── sidepanel.html     # 聊天界面布局
│   ├── sidepanel.js       # 多轮对话逻辑 + Storage 流式传输
│   └── sidepanel.css     # 聊天气泡样式
├── src/
│   ├── background.js      # 后台服务（消息路由、Storage 流管理）
│   ├── content.js         # 页面注入（题目捕获、按钮注入）
│   ├── ai/
│   │   └── providers.js  # AI 调用核心（COACH_PROMPT、流式生成）
│   ├── storage/
│   │   ├── settings.js   # 设置持久化
│   │   └── history.js    # 提示历史记录
│   └── learning-plan/
│       └── generator.js  # 学习计划生成
├── settings/              # 设置页面
│   ├── settings.html
│   ├── settings.js
│   └── settings.css
├── popup/                # 弹窗入口
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
└── icons/                # 扩展图标
```

### 流式传输架构（已优化）
- **旧方案**：`chrome.runtime.connect` 端口 → 长思考会断开 ❌
- **新方案**：`chrome.storage.local` + `onChanged` 监听 → 永不中断 ✅
- 增量写入（800ms 间隔）+ 翻译模式跳过思考存储 → 远低于 120次/分钟限额

---

## 🛠️ 开发说明

### 前置要求
- Chrome 浏览器（Manifest V3 支持）
- Node.js（可选，用于语法检查）

### 本地开发
1. 修改代码后，在 `chrome://extensions/` 点击扩展的**重新加载**按钮
2. 打开侧边栏测试功能
3. 按 F12 打开开发者工具查看日志

### 常见 Bug 修复记录
- ✅ **[object Object] 问题**：强制类型转换 + 对象提取，确保题目文本为字符串
- ✅ **端口断开问题**：从 port 架构迁移到 chrome.storage 流式传输
- ✅ **翻译中断问题**：降低存储频率 + 增量写入 + 跳过思考过程
- ✅ **页面捕获时机**：修复 storage.set 回调，确保数据写入后再打开面板

---

## 📄 许可证

MIT License - 自由使用、修改和分发。

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

**开发计划**：
- [ ] 上架 Chrome 网上应用店
- [ ] 支持更多题库网站的题目识别
- [ ] 增加语音播报功能（面向低龄学生）
- [ ] 导出学习报告 PDF

---

## 📮 联系方式

- GitHub Issues：[fslong520/OJBetter/issues](https://github.com/fslong520/OJBetter/issues)
- 反馈邮箱：[待添加]

---

<div align="center">
  <sub>由 🦉 小智 和 OpenCode AI 提供支持</sub>
</div>
