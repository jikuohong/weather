# ⛅️ Cloudflare Weather Bot (Dual-Engine Edition)

基于 **Cloudflare Workers** 部署的 Telegram 天气预报机器人。采用 **和风天气 (QWeather)** 作为地理编码与基础气象主力，**彩云天气 (Caiyun)** 作为高精度降雨预警增强。
 
---


## 🌟 核心功能

* **全地域查询**：发送 `/weather [地名]`（如：`/weather 杭州`）自动获取目标位置预报。
* **默认地守望**：直接发送 `/weather` 获取默认设置地点（温州鹿城）的详细天气。
* **双引擎驱动**：
    * **和风天气**：负责地名转坐标、实时温度、体感、湿度及风力等级。
    * **彩云天气**：负责 24 小时逐小时降雨深度分析，计算精准的起止时间。
* **自动降雨预警**：支持 Cron Triggers 定时巡检，一旦预测有雨，自动推送到 Telegram（带 KV 去重，避免重复骚扰）。
* **可视化预览**：支持通过浏览器直接访问 Worker 域名查看纯文本预报。

---

## 🛠 环境变量配置 (Environment Variables)

请在 Cloudflare Workers 控制台的 **Settings -> Variables** 中添加以下变量：

| 变量名 | 必填 | 描述 | 来源 |
| :--- | :--- | :--- | :--- |
| `TG_BOT_TOKEN` | 是 | Telegram 机器人 Token | [@BotFather](https://t.me/BotFather) |
| `TG_CHAT_ID` | 是 | 接收通知的数字 ID | [@userinfobot](https://t.me/userinfobot) |
| `CAIYUN_TOKEN` | 是 | 彩云天气 API 令牌 | [彩云科技开放平台](https://dashboard.caiyunapp.com/) |
| `QWEATHER_KEY` | 是 | 和风天气 API Key | [和风天气控制台](https://console.qweather.com/) |

> **注意**：和风天气 Key 必须开通 **“GeoAPI”** 和 **“天气预报”** 权限。

---

## 🚀 部署指南

### 1. 代码部署
* 创建一个新的 Cloudflare Worker。
* 将 `index.js` 的内容完整粘贴并保存。

### 2. 绑定 KV 存储
* 在 Cloudflare 控制台创建一个名为 `WEATHER_KV` 的 KV 命名空间。
* 在 Worker 的设置中将其绑定，变量名设置为 `WEATHER_KV`。

### 3. 设置 Telegram Webhook
在浏览器访问以下链接进行激活（替换为你自己的 Token 和域名）：
`https://api.telegram.org/bot[你的TOKEN]/setWebhook?url=https://[你的域名]/`

### 4. 配置定时任务 (Cron Triggers)
* 在 **Triggers** 选项卡添加 `Cron Trigger`。
* 推荐设置为 `0 * * * *`（每小时整点运行一次）。

---

## 📖 使用指令

* `/weather` - 查询默认位置天气。
* `/weather [地名]` - 查询指定城市天气。

---

## 📄 开源协议
MIT License.