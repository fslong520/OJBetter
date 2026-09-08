Edge / Chrome 扩展商店认证说明。每次提交审核时，将下文粘贴到 Notes for Certification 栏。

----- 认证说明 -----
名称：OJBetter（渐进式 AI 编程助教） 版本：1.8.0
说明：面向 8-16 岁信奥赛学生的 AI 编程教练。不直接给答案，四种人格可选（老周/小满/老梗/阿锐），AI 根据学生回复动态调整教学。

附带功能：一键翻译（英/日题目转中文 Markdown）、朋友式头脑风暴（抬杠/联想/变着玩）、学习报告导出（PDF/Markdown）、语音播报、图片上传、历史记录与学习计划。支持 70+ OJ 平台（洛谷、Codeforces、AtCoder 等）。

----- v1.8.0 变更 -----
1. 修复 OpenCode Zen 网关新增会话头校验导致的 400 错误（"free tier can only be used in OpenCode"）：全部 5 处请求点自动携带 x-opencode-session 会话标识头
2. 新增 src/config/zen-session.js 统一会话标识生成
3. 设置页模型列表拉取与逐模型探针同样补头，免费模型可用性探测恢复正常

----- 测试步骤 -----
测试一（核心教学）：
1. 加载扩展，固定图标到工具栏。打开 https://atcoder.jp/contests/abc233/tasks/abc233_a（无需登录）。
2. 点击"灵光一下"。预期：右侧侧栏打开，AI 流式输出引导对话（标题仅显示题目预览，无阶段标签）。
3. 在输入框回答，按 Enter。预期：AI 根据回复动态调整（理解偏了纠偏，思路对了推进）。
4. 发送一段含 #include 或 int main() 的代码。预期：AI 自动切换至调试模式，指向具体代码行引导加 cout。

测试二（头脑风暴）：
1. 在题目页面点击"✨ 灵光一闪"。
2. 预期：AI 以朋友式风格展开讨论，动态切换思考角度。
3. 输入"先到这儿"结束。预期：AI 生成总结卡片。

测试三（翻译 + 设置）：
1. 同一题目页点击扩展图标→"翻译成中文"。预期：题目转为中文 Markdown。
2. 进入设置页。预期：可配置免费/自定义模型、教练风格（4种）、AI 参数（温度/maxTokens/TopP）、语音播报。
3. 免费模型下点击"测试连接"。预期：返回模型回复内容。


其他测试站（均免登录）：https://codeforces.com/problemset/problem/4/A  https://www.luogu.com.cn/problem/P1001

----- 测试用 API 说明 -----
默认使用 OpenCode Zen 免费模型，无需 API Key，安装即用。
模型列表从 https://opencode.ai/zen/v1/models 实时拉取并逐个实测，仅展示可用模型。

若免费模型不可用，请在设置中配置测试 API：
  API: https://api.deepseek.com  模型: deepseek-v4-flash  Key：（见本地密钥库，勿入库）

核心功能无需登录注册，AI 请求从浏览器直发。对话记录存在 chrome.storage.local，不上传任何服务器（除 AI API 地址外）。无统计追踪、无广告、无第三方服务。

----- 权限说明 -----
- sidePanel：侧边栏对话界面
- storage：存储设置和历史记录
- alarms：Service Worker 保活，防止长思考流式连接中断
- contextMenus：右键菜单"灵光一下"
- scripting + activeTab + all_urls：自动捕获 OJ 题目页面内容

----- 联系方式 -----
GitHub: https://github.com/fslong520/OJBetter

----- 提交 Checklist -----
1. manifest.json 版本号已更新，且与上方一致
2. 功能有增删时测试步骤已同步更新
3. 开发者模式加载后自测通过，核心对话 + 灵光一闪 + 翻译 + 设置页均正常
