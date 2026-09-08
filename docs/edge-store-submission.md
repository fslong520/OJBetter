# OJBetter — Microsoft Edge Add-ons 上架物料卡

> 生成日期：2026-09-08 · 版本：v1.8.0 · 配合 `docs/chrome-web-store-submission.md` 使用（详细描述直接复用其第二节）

---

## 一、前置须知（务必先读）

1. **首次上架必须人工操作**。Edge Add-ons REST API（v1.1）只能「更新已上架产品」，不能创建新产品。
2. Edge 开发者账号在 **Microsoft Partner Center** 注册：
   https://partner.microsoft.com/dashboard/microsoftedge/overview
   需 Microsoft 账号；个人开发者免费（无需公司 D-U-N-S）。
3. 包文件：项目根 `OJBetter-v1.8.0.zip`（约 468 KB，60 文件，MV3，Edge Chromium 原生兼容）。
4. 兼容性已核：MV3 ✓ · `chrome.sidePanel` Edge 114+ ✓ · 无 Chrome 专属 API · `host_permissions: <all_urls>` 需在审核备注中说明用途（自动捕获 OJ 页面题目）。

## 二、Partner Center 表单字段对照

| Partner Center 字段 | 填写内容 |
|---|---|
| 显示名称 | OJBetter |
| 简短描述（≤200 字符） | 渐进式 AI 编程助教 - 引导孩子独立思考，用流程图和伪代码启发编程思维，帮孩子更好的使用 OJ |
| 详细描述 | 复制 `docs/chrome-web-store-submission.md` 第二节全文（"OJBetter - 渐进式 AI 编程助教"起至文末） |
| 类别 | Developer Tools |
| 语言 | 中文（简体）zh-CN |
| 网站 URL | https://github.com/fslong520/OJBetter |
| 隐私政策 URL | GitHub 仓库 `PRIVACY.md` 渲染页（见下「三、隐私政策」） |
| 术语与行为准则 | 勾选同意 |
| 提交者/联系人 | 哥哥本人邮箱 |

## 三、隐私政策（缺 `PRIVACY.md`，需先补）

Edge 要求可公开访问的隐私政策页。建议在仓库根添加 `PRIVACY.md`（要点照抄上面「隐私与安全」四条：数据仅存本地、不收集个人信息、无第三方分析、MIT 开源），提交后用其 GitHub 页面 URL 填表。

## 四、商店素材（待备）

- **Logo**：`icons/icon128.png`（128×128，Partner Center 要求 ≥128）✓ 现成
- **截图**：Partner Center 要求 **1–9 张，推荐 1280×800**。现缺，按 chrome 文档「三、截图建议」的五张单截：欢迎页+题目输入 / AI 教练对话（含 ASCII 流程图）/ 语音输入 / 图片附件 / 学习报告

## 五、审核备注（提交时贴给审核员）

> 本扩展为开源教育工具（MIT），面向 8-16 岁信奥赛学生。`host_permissions: <all_urls>` 仅用于在用户主动访问的编程题库页面（洛谷/Codeforces/AtCoder 等）自动捕获题目文本供 AI 引导使用，不做任何背景数据收集。所有用户对话仅存本地浏览器（chrome.storage.local）。AI 功能调用用户自配或免费公共 API（opencode.ai），不传输个人信息。

## 六、上架后：后续版本自动化（API v1.1）

产品上架后，在 Partner Center 该产品页开启「Update REST API」拿到 **ApiKey + ClientID + productID**，此后新版发布可全自动：

```
POST /v1/products/$productID/submissions/draft/package   Authorization: ApiKey $ApiKey; X-ClientID: $ClientID   body: zip
POST /v1/products/$productID/submissions/draft/publish
```

凭据给到后可接入发版脚本，与 GitHub tag 同步。
