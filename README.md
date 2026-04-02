# ⛅️ Cloudflare Weather Bot (Secure Edition)

基于 Cloudflare Workers 部署的 Telegram 天气预报机器人，集成和风天气与彩云天气。

---

## 🌟 核心功能

* **地理编码**：通过和风天气 GeoAPI 自动将地名转换为坐标。
* **实况天气**：实时温度、体感、湿度及风力数据。
* **精准降雨**：利用彩云天气 API 预报未来 24 小时内的降雨起止时间。
* **安全部署**：通过 GitHub Secrets 管理凭据，防止 API Key 泄露。

---

## 🛠 配置项 (GitHub Secrets)

请在 GitHub 仓库中配置以下机密：

| 变量名 | 说明 |
| :--- | :--- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API 令牌 |
| `TG_BOT_TOKEN` | Telegram Bot Token |
| `TG_CHAT_ID` | 你的个人 Chat ID |
| `QWEATHER_KEY` | 和风天气 API Key |
| `CAIYUN_TOKEN` | 彩云天气 API Token |

---

## 🚀 部署指引

1. **权限设置**：在和风控制台勾选 GeoAPI、天气预报并点击保存。
2. **源码推送**：上传 `index.js` 及正确的 `.github/workflows/deploy.yml`。
3. **Webhook**：访问 Telegram Webhook 激活链接。
4. **定时器**：添加 Cron Trigger 以实现自动推送。

---

## 📄 License
MIT License.
