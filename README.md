# ☁️ Cloudflare Weather Bot (V11.0)

基于 Cloudflare Workers + Workers AI + Pirate Weather API 构建的高级天气机器人。支持 Telegram 交互与 Web 路由查询。

## ✨ 主要功能
- **智能指令解析**：自动识别城市名与小时数，避免数字被识别为地名。
- **Web 路由支持**：直接访问 `your-domain.com/上海` 即可获取该城市天气。
- **深度预报**：支持 `/weather 24` 或 `/weather 杭州 48` 等指令，提供每 3 小时一次的详细趋势。
- **降雨预警**：定时检测未来 2 小时降水概率，自动推送 Telegram 提醒。
- **AI 智能翻译**：使用 `Llama-3-8b` 对天气描述进行地道中文翻译。
- **精美对齐**：针对手机端优化，使用全角空格确保数据列完美对齐。

## 🛠️ 环境变配置 (Variables)
在 Workers 设置中添加以下环境变量：

| 变量名 | 说明 |
| :--- | :--- |
| `PIRATE_WEATHER_KEY` | Pirate Weather API Key (免费) |
| `TG_BOT_TOKEN` | Telegram Bot API Token |
| `TG_CHAT_ID` | 降雨推送的目标频道或个人 ID |
| `AI` | 绑定 Cloudflare Workers AI 目录 |
| `WEATHER_KV` | 绑定 Cloudflare KV 空间 (用于推送防抖) |

## 📡 触发器配置 (Triggers)
- **HTTP 路由**：设置你的自定义域名 (如 `weather.kont.us.ci/*`)。
- **Cron Triggers**：设置 `*/30 * * * *` (每 30 分钟检查一次降雨预警)。

## ⌨️ Telegram 指令
- `/weather` - 默认显示温州实况预报。
- `/weather 杭州` - 显示杭州实况预报。
- `/weather 24` - 显示温州未来 24 小时深度趋势。
- `/weather 杭州 36` - 显示杭州未来 36 小时深度趋势。

## 🌐 网页访问
- `https://your-domain.com/` - 默认城市实况。
- `https://your-domain.com/城市名` - 指定城市实况。
