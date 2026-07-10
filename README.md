# OJBetter - 渐进式 AI 编程助教

<div align="center">

**引导孩子独立思考，用流程图和伪代码启发编程思维**

[![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-v1.4.1-green?style=flat-square)](https://github.com/fslong520/OJBetter)
[![Edge Extension](https://img.shields.io/badge/Edge%20Extension-v1.4.1-blue?style=flat-square)](https://github.com/fslong520/OJBetter)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)]()

</div>

---

## 📖 什么是 OJBetter？

OJBetter 是一款 Chrome 扩展，作为渐进式 AI 编程助教，专为信奥赛学生（8-16岁）设计。不同于直接给答案的 AI 工具，OJBetter 通过自适应引导，培养学生的独立思考能力：

| 图标 | 功能 | 说明 |
|------|------|------|
| 🧭 | **多风格教练** | 4种鲜明人格（老周/小满/老梗/阿锐），自适应引导而非僵化分阶段 |
| ✨ | **灵光一闪** | 朋友式头脑风暴，动态选择思考角度，节奏快有来有回 |
| 🌐 | **一键翻译** | 英文题目转中文 Markdown，保留公式与样例 |
| 🎯 | **代码调试引导** | 自动检测代码提交，引导自主发现 bug |

---

## ✨ 功能特性

### 🎯 自适应教练系统
- **不一次性给答案**：AI 像真人教练一样，从学生的每句话里读懂他在哪里，然后给最需要的东西
- **多轮对话**：没有固定阶段，对话如流水，根据学生实际进度自然调整引导深度
- **4种教练人格**：沉稳学长"老周"、元气好友"小满"、脱口秀"老梗"、竞赛大佬"阿锐"，可切换风格
- **代码调试模式**：自动检测代码提交，引导自主发现 bug，每轮附带可运行的测试数据
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

### ✨ 朋友式头脑风暴
- AI 按需切换抬杠/联想/变着玩三种自然状态，节奏快有来有回
- 动态选择思考角度，深度拓展算法思维
- 不是角色扮演，而是自然状态切换

### 📚 学习辅助
- **历史记录**：保存所有提示记录，方便复习
- **明日推荐**：根据学习情况推荐明日练习方向
- **多模型支持**：OpenCode Zen 免费模型 / 自定义 OpenAI 兼容 API

---

## 🧭 教练人格系统

4 种鲜明人格，可自由切换，每种风格有独立的教学信条和说话方式：

| 人格 | 教学信条 | 风格特点 |
|------|----------|----------|
| **老周**（默认） | 想明白比说出来重要，但说出来才能证明你想明白了 | 沉稳学长，话少句句在点，口语化不卖萌 |
| **小满** | 每个 Bug 都是通关路上的小怪，打掉就升级 | 元气好友，炸裂热情，把编程课变成闯关游戏 |
| **老梗** | 能让学生笑出来还自己想通，才算真会教 | 脱口秀型，幽默提问+自黑+玩梗，用好问题引导 |
| **阿锐** | 废话是时间的敌人，代码是问题的解药 | 竞赛大佬，极简准冷幽默，不浪费一个字 |

教练系统没有固定阶段，采用自适应引导：从学生的每句话里读懂他在哪里，给出他最需要的东西。

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

**示例对话流程**（自适应引导，没有固定阶段）：
```
🦉 老周：先说说看，这道题在问什么？
🧑 学生：判断三个数是否满足条件...
🦉 老周：对。想想条件判断的关系，你打算从哪入手？
🧑 学生：需要先读入 A B C，然后判断...
🦉 老周：方向没错。排序后的元素之间有什么关系？
🧑 学生：明白了！
🦉 老周：试着写写核心逻辑？
🧑 学生：[开始写代码...]
🦉 老周：[引导思考] 试试这个样例，你觉得输出应该是什么？
🧑 学生：[贴出代码]
🦉 老周：[引导调试] 看看处理边界的地方，有没有漏掉什么？
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
│   ├── content.js         # 页面注入（题目捕获）
│   ├── ai/
│   │   └── providers.js  # AI 调用核心（COACH_PROMPT、流式生成）
│   ├── lib/
│   │   └── stream-fetcher.js  # 统一 SSE 流式获取器（从 3 处重复提取）
│   ├── coach/
│   │   └── personas.js        # 教练人格系统（4种风格 + 自适应策略）
│   ├── brainstorm/            # 头脑风暴引擎（抬杠/联想/变着玩）
│   ├── export/
│   │   └── report-export.js   # 学习报告导出（Markdown）
│   ├── config/
│   │   └── models.js          # API 配置
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
- [x] 移除页面悬浮球 UI，清理相关描述
- [ ] 上架 Chrome 网上应用店（ZIP 已打包，需开发者账号 → 联系我）
- [x] 支持更多题库网站的题目识别（新增 26 个 OJ 域名 + 18 个选择器）
- [x] 增加语音播报与语音输入功能（Web Speech API）
- [x] 多模态支持：图片上传/粘贴/预览/发送
- [x] 导出学习报告（Markdown）

---

## 📮 联系方式

- GitHub Issues：[fslong520/OJBetter/issues](https://github.com/fslong520/OJBetter/issues)
- 反馈邮箱：[待添加]

---

<div align="center">
  <sub>由 🦉 小智 和 OpenCode AI 提供支持</sub>
</div>
