Weather Bot V12.1

🌤️ 基于 Cloudflare Workers 开发的 Telegram 天气机器人，支持双天气 API 容灾、逐小时预报、降雨预警推送、智能中文翻译

✨ 功能特性
双天气接口容灾：WeatherAPI（主）+ Pirate Weather（备用），自动故障切换
精准地理定位：支持城市 / 区县 / 乡镇级地址解析
完整天气数据：实时天气、明日预报、逐小时深度预报（1-72 小时）
智能翻译：非中文数据自动转为简洁中文气象描述
定时降雨推送：未来 12 小时降雨预警，KV 去重防重复推送
美观排版：Telegram 消息对齐、标准化数值展示
HTTP 查询接口：支持浏览器直接访问查询天气

🚀 部署环境
本项目运行于 Cloudflare Workers，无需服务器，一键部署

🔧 环境变量配置
表格
变量名	说明	是否必填
WEATHERAPI_KEY	WeatherAPI 密钥	✅ 是
PIRATE_WEATHER_KEY	Pirate Weather 备用密钥	✅ 是
TG_BOT_TOKEN	Telegram 机器人 Token	✅ 是
TG_CHAT_ID	接收降雨推送的聊天 ID	✅ 是
WEATHER_KV	Cloudflare KV 绑定（去重用）	✅ 是

📦 wrangler.toml 配置
toml
name = "weather-bot"
main = "index.js"
compatibility_date = "2026-01-01"

[
vars
]
WEATHERAPI_KEY = ""
PIRATE_WEATHER_KEY = ""
TG_BOT_TOKEN = ""
TG_CHAT_ID = ""

[[
kv_namespaces
]]
binding = "WEATHER_KV"
id = ""
preview_id = ""
📌 使用说明
Telegram 指令
plaintext
/weather              # 查询默认地区天气
/weather 城市名       # 查询指定城市天气
/weather 城市名 小时数 # 查询未来 N 小时逐小时预报（最大72）
示例：
plaintext
/weather
/weather 北京市
/weather 杭州 24
HTTP 接口
plaintext
GET /status           # 服务状态检查
GET /城市名           # 直接查询天气
📂 项目结构
plaintext
weather-bot/
├── index.js          # 主程序代码
├── wrangler.toml     # Cloudflare 配置文件
└── README.md         # 说明文档
🛠 部署命令
bash
运行
# 安装 wrangler
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 部署
wrangler deploy
📝 版本信息
版本：V12.1
运行环境：Cloudflare Workers
语言：JavaScript (ES6+)
⚠️ 注意事项
免费版天气 API 有调用次数限制，高频使用请升级
Telegram 消息长度限制 4096 字符，长预报会自动截断
降雨推送依赖 Cloudflare 定时触发器，需手动配置执行周期
默认定位：温州市鹿城区，可在代码中修改
📄 许可证
MIT License
