⛅ Weather Bot V12.2 旗舰集成版
基于 Cloudflare Workers 驱动的全自动气象服务机器人。集成双引擎容灾、AI 智能润色、2 小时精准降雨预警及交互式雷达图。

🌟 核心特性
双气象引擎自动切换：首选 WeatherAPI.com（国内定位极准，数据丰富），备选 Pirate Weather（全球覆盖，高可用保障）。

2 小时精准降雨预警：系统每 30 分钟扫描一次云图数据，仅在预计 45-150 分钟内有雨时发送 Telegram 推送，拒绝无效提醒。

HTML 交互式看板：浏览器访问时提供精美的 Web 界面，底部雷达链接支持一键跳转。

动态 Windy 雷达集成：雷达链接会随查询城市自动更新经纬度坐标，实现“所查即所得”。

AI 语义润色：调用 Cloudflare 内部 Llama-3 大模型，将枯燥的气象术语转化为简洁易读的中文描述。

🛠️ 环境变量配置 (必看)
请在 Cloudflare Workers 控制台的 Settings -> Variables 中配置以下项：

1. 加密变量 (Secrets)
变量名	来源	作用
WEATHERAPI_KEY	WeatherAPI	主引擎密钥，支持中文及 AQI
TG_BOT_TOKEN	@BotFather	Telegram 机器人的唯一标识符
PIRATE_WEATHER_KEY	Pirate Weather	(可选) 备用引擎密钥
2. 普通变量 (Variables)
变量名	说明	示例
TG_CHAT_ID	接收降雨自动推送的频道/个人 ID	12345678
3. 资源绑定 (Bindings)
KV Namespace: 绑定一个名为 WEATHER_KV 的空间，用于过滤重复推送。

Workers AI: 绑定名为 AI 的资源，用于运行 Llama-3 翻译模型。

🚀 部署流程
环境清理：在 Cloudflare 编辑器中，全选并删除所有旧代码，防止出现 Identifier already declared 错误。

代码部署：粘贴最新的 index.js 代码并点击 Save and Deploy。

设置触发器 (Cron)：

在 Triggers 页面添加 Cron Trigger：*/30 * * * * (每半小时运行一次)。

激活机器人 (Webhook)：

在浏览器访问：https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<DOMAIN>/

⌨️ 交互指南
Telegram 指令
/weather：查看默认设置地点（温州市鹿城区）的天气实况。

/weather 杭州：即时查询杭州天气，并获取杭州坐标的 Windy 雷达链接。

/weather 上海浦东：支持精确到区县级的地理位置检索。

网页端访问
默认访问：https://your-worker.workers.dev/

特定城市：https://your-worker.workers.dev/北京 (直接在 URL 后加城市名即可预览)

📝 维护说明
时区锁定：预警推送强制锁定 Asia/Shanghai，解决凌晨预警时间乱码问题。

故障排查：若网页显示“系统异常”，请检查 WEATHERAPI_KEY 是否有效或 AI 资源是否正确绑定。
