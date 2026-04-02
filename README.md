# ☁️ Weather Bot V12.0 (Dual Engine)

基于 Cloudflare Workers 的高可用天气机器人，采用 WeatherAPI + Pirate Weather 双引擎架构。

## 🌟 核心改进
- **优先 WeatherAPI**：利用其对国内行政区划（如鹿城区）的精准支持，杜绝定位偏航。
- **原生中文支持**：主引擎自带中文，跳过 AI 翻译环节，彻底解决 AI 乱码/废话问题。
- **容灾备份**：若主引擎故障，自动无感切换至 Pirate Weather。
- **UI 优化**：针对 Telegram 手机端，使用全角空格实现多列数据完美对齐。

## 🛠️ 环境变量 (Settings > Variables)
| 变量名 | 必填 | 说明 |
| :--- | :--- | :--- |
| `WEATHERAPI_KEY` | 是 | WeatherAPI.com 的 API KEY |
| `PIRATE_WEATHER_KEY` | 否 | Pirate Weather 的 API KEY (作为备用) |
| `TG_BOT_TOKEN` | 是 | Telegram 机器人 Token |
| `TG_CHAT_ID` | 是 | 降雨提醒推送的目标 ID |
| `AI` | 是 | 绑定 Workers AI |
| `WEATHER_KV` | 是 | 绑定名为 `WEATHER_KV` 的 KV 空间 |

## ⌨️ 常用指令
- `/weather` - 鹿城区当前天气
- `/weather 杭州` - 指定城市天气
- `/weather 24` - 鹿城区未来 24 小时深度预报 (3h/段)
- `/weather 上海 48` - 指定城市 48 小时预报

## 📡 触发器配置
- **HTTP**: `weather.yourdomain.com/*`
- **Cron**: `*/30 * * * *` (每30分钟执行一次降雨检测)
