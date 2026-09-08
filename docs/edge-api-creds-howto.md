# Edge API 凭据获取步骤（给哥哥的操作卡）

产品页直达：https://partner.microsoft.com/dashboard/microsoftedge/overview
→ 点开 OJBetter 产品 → 左侧「Package / Update REST API」（更新 REST API）

## 拿三样东西

1. **ClientID**（客户端 ID）——页面上直接显示，一串 GUID
2. **ApiKey**（API 密钥）——点「Create / 新建 API key」：
   - 有效期选最长（如 2 年）
   - **只勾「Upload package / 上传包」和「Publish / 发布」权限**
   - 创建后**立即复制保存**——关掉弹窗后只显示一次
3. **productID**（产品 ID）——产品概览页 URL 或详情里的一串 GUID

## 发我的时候

直接三个字符串一起贴过来即可：

```
ApiKey:     DXXXXXXXXXXXXXXXXXXXXXXXXXXX...
ClientID:   xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
productID:  xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

⚠️ 提示：ApiKey 等同密码，只发在本地对话里，勿贴公开场合。收到后我即传 `OJBetter-v1.8.0.zip` → 触发发布 → 轮询状态到「In review」。
