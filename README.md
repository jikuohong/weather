# Weather Bot V12.1
🌤️ 基于 Cloudflare Workers 开发的 Telegram 天气机器人，支持双 API 容灾、智能中文翻译、降雨预警推送

## ✨ 核心特性
- **双引擎容灾**：WeatherAPI（主）+ Pirate Weather（备），故障自动切换
- **精准定位**：支持城市/区县/乡镇级地址解析（基于 Nominatim）
- **完整预报**：实时天气、明日预报、1-72小时逐小时深度预报
- **本地化体验**：非中文数据自动转为简洁气象中文描述
- **降雨预警**：未来12小时降雨推送，KV 去重避免重复提醒
- **多端适配**：Telegram 指令 + HTTP 接口双查询方式
- **美观排版**：Telegram 消息字段对齐、数值标准化展示

## 🚀 部署环境
- 运行载体：Cloudflare Workers（无服务器，免运维）
- 开发语言：JavaScript (ES6+)
- 依赖服务：Cloudflare KV（用于推送去重）

## 🔧 环境配置
### 1. 必要环境变量
| 变量名                | 说明                          | 是否必填 |
|-----------------------|-------------------------------|----------|
| `WEATHERAPI_KEY`      | WeatherAPI 主接口密钥         | ✅ 是    |
| `PIRATE_WEATHER_KEY`  | Pirate Weather 备用接口密钥   | ✅ 是    |
| `TG_BOT_TOKEN`        | Telegram 机器人 Token         | ✅ 是    |
| `TG_CHAT_ID`          | 接收降雨推送的 Telegram 聊天ID | ✅ 是    |
| `WEATHER_KV`          | Cloudflare KV 命名空间绑定    | ✅ 是    |

### 2. wrangler.toml 配置
```toml
name = "weather-bot"
main = "index.js"
compatibility_date = "2026-01-01"

[vars]
WEATHERAPI_KEY = ""        # 填写你的 WeatherAPI 密钥
PIRATE_WEATHER_KEY = ""    # 填写你的 Pirate Weather 密钥
TG_BOT_TOKEN = ""          # 填写 Telegram 机器人 Token
TG_CHAT_ID = ""            # 填写接收推送的聊天 ID

[[kv_namespaces]]
binding = "WEATHER_KV"     # 与代码中 KV 绑定名一致
id = ""                    # Cloudflare KV 命名空间 ID
preview_id = ""            # 预览环境 KV ID（与 id 一致即可）

```



📌 使用说明
1. Telegram 指令
指令格式	示例	说明
/weather	/weather	查询默认地址（温州市鹿城区）天气
/weather [城市名]	/weather 北京市	查询指定城市完整天气
/weather [城市名] [小时数]	/weather 杭州 24	查询未来 N 小时逐小时预报（最大 72）
2. HTTP 接口
# 检查服务状态
GET https://your-worker-domain/status

# 查询指定城市天气
GET https://your-worker-domain/杭州市
📂 项目结构
weather-bot/
├── index.js          # 主程序代码（核心逻辑）
├── wrangler.toml     # Cloudflare 部署配置
└── README.md         # 项目说明文档
🛠 部署步骤
# 1. 安装 Cloudflare Wrangler 工具
npm install -g wrangler

# 2. 登录 Cloudflare 账号（浏览器授权）
wrangler login

# 3. 部署到 Workers
wrangler deploy

⚠️ 注意事项
WeatherAPI 免费版每月限 1000 次调用，高频使用建议升级套餐
Telegram 单条消息最大长度 4096 字符，72 小时预报可能自动截断
降雨推送需配置 Cloudflare 定时触发器（建议每小时执行一次）
默认定位为「温州市鹿城区」，可在代码中修改 defaultLoc 变量
📄 许可证
MIT License
