Weather Bot V12.1
🌤️ 高性能、高可用的 Telegram 天气机器人，支持双 API 容灾、精准地理定位、多维度预报，原生中文适配，专为中文用户优化。
核心特性
双引擎容灾：WeatherAPI（主）+ Pirate Weather（备），主服务故障时无感切换，保障可用性；
精准定位：基于 Nominatim 开源地理接口，支持城市 / 区县 / 乡镇级地址匹配；
多维度预报：
实时实况（温度 / 湿度 / 体感 / 空气质量 / 风速）；
明日完整预报（温湿度 / 降水 / 能见度 / 紫外线 / 日出日落）；
逐小时深度预报（支持自定义 1-72 小时，从当前时间起算）；
本地化体验：WeatherAPI 原生中文，Pirate Weather 自动调用 Llama-3 翻译为简洁中文；
定时降雨推送：自动检测未来 12 小时降雨风险，避免重复推送；
排版优化：字段对齐、降水格式标准化，Telegram 消息可读性拉满。
快速开始
环境准备
需配置以下环境变量（Cloudflare Workers 或其他 Node.js 环境）：
表格
变量名	说明	获取地址
WEATHERAPI_KEY	WeatherAPI 主接口密钥（必填）	WeatherAPI
PIRATE_WEATHER_KEY	Pirate Weather 备用接口密钥（必填）	Pirate Weather
TG_BOT_TOKEN	Telegram 机器人 Token（必填）	@BotFather
TG_CHAT_ID	接收降雨推送的 Telegram 聊天 ID（必填）	@getidsbot
WEATHER_KV	Cloudflare KV 命名空间（用于去重推送）	Cloudflare Dashboard > Workers > KV
部署方式（Cloudflare Workers）
克隆本仓库：
bash
运行
git clone https://github.com/your-username/weather-bot.git
cd weather-bot
安装 Wrangler（Cloudflare 命令行工具）：
bash
运行
npm install -g wrangler
配置 Wrangler（替换为你的 KV ID 和环境变量）：
toml
# wrangler.toml
name = "weather-bot"
main = "index.js"
compatibility_date = "2024-01-01"

[
vars
]
WEATHERAPI_KEY = "your-weatherapi-key"
PIRATE_WEATHER_KEY = "your-pirate-key"
TG_BOT_TOKEN = "your-tg-bot-token"
TG_CHAT_ID = "your-chat-id"

[[
kv_namespaces
]]
binding = "WEATHER_KV"
id = "your-kv-namespace-id"
发布到 Cloudflare Workers：
bash
运行
wrangler deploy
本地调试
bash
运行
# 安装依赖
npm install

# 启动本地服务
wrangler dev index.js
使用说明
Telegram 指令
表格
指令格式	示例	说明
/weather	/weather	查询默认地址（温州市鹿城区）完整天气
/weather [城市名]	/weather 上海市	查询指定城市完整天气
/weather [城市名] [小时数]	/weather 北京 24	查询指定城市未来 N 小时逐小时预报（最大 72）
HTTP 接口
查看机器人状态：GET https://your-worker.domain/status
查询天气：GET https://your-worker.domain/[城市名]（例：https://your-worker.domain/杭州市）
定时降雨推送
机器人会自动检测默认地址（温州市鹿城区）未来 12 小时内降雨概率＞45% 的时段，通过 Telegram 推送预警，且 3 小时内同一时段仅推送一次（基于 KV 去重）。
核心功能解析
1. 双引擎切换逻辑
getAllData 函数优先调用 WeatherAPI，失败时自动切换到 Pirate Weather，全程无感知：
javascript
运行
async function getAllData(lat, lon, name, env) {
  try {
    return await fetchWeatherAPI(lat, lon, name, env);
  } catch (e) {
    console.log("⚠️ WeatherAPI 故障，尝试切换 Pirate Weather...");
    return await fetchPirateWeather(lat, lon, name, env);
  }
}
2. 逐小时预报优化
修复历史版本时间偏差问题，仅保留当前时间之后的小时数据：
javascript
运行
const hourly = (data.hourly?.data || [])
  .filter(h => h.time >= nowEpoch) // 过滤当前时间前的数据
  .slice(0, hours);
3. 智能翻译
非原生中文数据自动调用 Llama-3 翻译，限制 3-4 个中文字词，贴合气象场景：
javascript
运行
async function smartTranslate(text, env, isNativeZh, type = "general") {
  if (!text || isNativeZh) return text;
  const prompt = type === "trend"
    ? "你是一个气象助手。将输入翻译成3-4个中文字词。严禁任何解释或英文，只给结果。"
    : "你是一个气象助手。将天气描述翻译成简洁中文。严禁对话，只给结果。";
  // 调用 Llama-3 翻译逻辑...
}
注意事项
WeatherAPI 免费套餐有调用次数限制（每月 1000 次），高频使用建议升级套餐；
Pirate Weather 基于 Dark Sky 开源项目，数据覆盖范围可能略小于 WeatherAPI；
Telegram 单条消息最大长度为 4096 字符，72 小时逐小时预报可能被截断（建议单次查询≤24 小时）；
地理定位依赖 Nominatim 接口，请勿高频调用（遵守 Nominatim 使用规范）。
版本更新日志
V12.1
修复：逐小时预报从当前时间起算，确保 /weather N 返回真正未来 N 小时数据；
优化：降水格式标准化，排版对齐更美观；
增强：空气质量接口异常兜底，避免数据缺失。
V12.0
新增：双 API 容灾切换逻辑；
新增：Llama-3 智能翻译，适配非中文数据源；
新增：定时降雨推送功能（基于 KV 去重）；
重构：地理定位逻辑，支持多级别地址匹配。
许可证
MIT License - 自由使用、修改和分发，商用需保留版权声明。
