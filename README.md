# Weather Bot V12.1
🌤️ 

> 基于 **Cloudflare Workers** 的中文天气机器人，支持 Telegram 推送与 HTTP 查询。
> 双引擎容灾设计，WeatherAPI 为主力数据源，Pirate Weather 自动兜底。

---

## 目录

- [功能特性](#功能特性)
- [架构概览](#架构概览)
- [准备工作](#准备工作)
- [部署步骤](#部署步骤)
- [环境变量配置](#环境变量配置)
- [Telegram Bot 配置](#telegram-bot-配置)
- [定时任务配置](#定时任务配置)
- [使用方法](#使用方法)
- [输出示例](#输出示例)
- [降雨预警机制](#降雨预警机制)
- [常见问题](#常见问题)
- [版本记录](#版本记录)

---

## 功能特性

| 功能 | 说明 |
|------|------|
| 🌦 实时天气 | 温度、体感温度、湿度、风速、AQI 空气质量 |
| 📅 明日详细预报 | 温度区间、均温、降水量/概率、最大风速、能见度、UV 指数、日出日落 |
| ⌛ 逐小时趋势 | 明日 06-22 时每两小时一条，或指定未来 N 小时深度预报 |
| 🌧️ 降雨智能预警 | 提前 1.5~3 小时推送，含强度/雨量/概率/持续时长，KV 去重防重推 |
| 🌍 任意城市查询 | 基于 OpenStreetMap Nominatim 定位，支持中英文地名 |
| 🔄 双引擎容灾 | WeatherAPI 故障时自动切换 Pirate Weather，全程无感 |
| 🤖 AI 智能翻译 | 备用源返回英文时，调用 Cloudflare Workers AI 自动翻译为中文 |
| 📡 HTTP 接口 | 直接通过浏览器或 curl 访问查询，免 Telegram |

---

## 架构概览

```
┌─────────────────────────────────────────────┐
│           Cloudflare Worker                  │
│                                             │
│  HTTP GET  ──►  getGeoLocation()            │
│  HTTP POST ──►  handleTelegramMessage()     │
│  Scheduled ──►  checkRainPush()             │
│                      │                      │
│              getAllData()                    │
│             ┌─────┴──────┐                  │
│      fetchWeatherAPI()  fetchPirateWeather() │
│      (主，原生中文)      (备，AI 翻译)        │
│                                             │
│  KV Store ──► 推送去重                       │
│  Workers AI ──► 英文→中文翻译                │
└─────────────────────────────────────────────┘
```

---

## 准备工作

在开始之前，你需要注册以下服务并获取对应的密钥：

### 1. WeatherAPI（主数据源）

1. 前往 [weatherapi.com](https://www.weatherapi.com) 注册账号
2. 免费计划支持：3 天预报 + 逐小时数据 + AQI 空气质量 + 中文原生支持
3. 在控制台复制 **API Key**

### 2. Pirate Weather（备用数据源）

1. 前往 [pirateweather.net](https://pirateweather.net) 注册账号
2. 获取 **API Key**（免费计划足够日常使用）

### 3. Telegram Bot

1. 在 Telegram 中搜索 `@BotFather`
2. 发送 `/newbot`，按提示创建机器人
3. 记录返回的 **Bot Token**（格式：`123456789:ABCdef...`）
4. 向机器人发一条消息，然后访问以下地址获取你的 Chat ID：
   ```
   https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
   ```
   在返回的 JSON 中找到 `"chat":{"id":xxxxxxxx}`

### 4. Cloudflare 账号

- 登录 [dash.cloudflare.com](https://dash.cloudflare.com)
- 确保已开启 **Workers & Pages** 和 **Workers KV**

---

## 部署步骤

### 方式一：通过 Wrangler CLI 部署（推荐）

**1. 安装 Wrangler**

```bash
npm install -g wrangler
wrangler login
```

**2. 克隆项目**

```bash
git clone https://github.com/your-username/weather-bot.git
cd weather-bot
```

**3. 创建 KV 命名空间**

```bash
wrangler kv:namespace create WEATHER_KV
```

复制输出中的 `id`，填入 `wrangler.toml`：

```toml
[[kv_namespaces]]
binding = "WEATHER_KV"
id = "你的KV命名空间ID"
```

**4. 配置 `wrangler.toml`**

```toml
name = "weather-bot"
main = "index.js"
compatibility_date = "2024-01-01"

[ai]
binding = "AI"

[[kv_namespaces]]
binding = "WEATHER_KV"
id = "你的KV命名空间ID"

[triggers]
crons = ["0 * * * *"]   # 每小时整点运行，用于降雨预警
```

**5. 配置环境变量（Secret）**

```bash
wrangler secret put WEATHERAPI_KEY
wrangler secret put PIRATE_WEATHER_KEY
wrangler secret put TG_BOT_TOKEN
wrangler secret put TG_CHAT_ID
```

**6. 部署**

```bash
wrangler deploy
```

部署成功后，Wrangler 会输出类似：

```
Published weather-bot (1.23 sec)
  https://weather-bot.your-subdomain.workers.dev
```

### 方式二：通过 Cloudflare Dashboard 手动部署

1. 进入 Cloudflare Dashboard → **Workers & Pages** → **Create Worker**
2. 将 `index.js` 的全部内容粘贴进编辑器
3. 点击 **Save and Deploy**
4. 进入 Worker 设置页，依次添加环境变量（见下方配置表）
5. 在 **KV** 页面创建命名空间，绑定到 Worker，变量名填 `WEATHER_KV`
6. 在 **Triggers → Cron Triggers** 添加 `0 * * * *`

---

## 环境变量配置

| 变量名 | 类型 | 说明 |
|--------|------|------|
| `WEATHERAPI_KEY` | Secret | WeatherAPI 的 API Key |
| `PIRATE_WEATHER_KEY` | Secret | Pirate Weather 的 API Key |
| `TG_BOT_TOKEN` | Secret | Telegram Bot Token |
| `TG_CHAT_ID` | Secret | 接收推送的 Telegram Chat ID |
| `WEATHER_KV` | KV Binding | Cloudflare KV 命名空间，用于推送去重 |
| `AI` | AI Binding | Cloudflare Workers AI，用于英文翻译 |

> **注意**：Secret 类型的变量请通过 `wrangler secret put` 或 Dashboard 的 **Settings → Variables → Encrypt** 方式添加，不要明文写入代码或 `wrangler.toml`。

---

## Telegram Bot 配置

需要将 Telegram Webhook 指向你的 Worker 地址：

```bash
curl "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=https://weather-bot.your-subdomain.workers.dev"
```

成功后返回：

```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

验证 Webhook 状态：

```bash
curl "https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo"
```

---

## 定时任务配置

Worker 每小时整点自动运行一次 `checkRainPush()`，检测默认地点未来 1.5~3 小时是否有降雨。

如需修改默认监控地点，编辑 `index.js` 中的以下内容：

```js
async scheduled(event, env) {
  const defaultLoc = { lat: "28.0001", lon: "120.6552", name: "温州市鹿城区" };
  await checkRainPush(defaultLoc, env);
}
```

将坐标和名称替换为你的城市即可。可在 [latlong.net](https://www.latlong.net) 查询任意地点的经纬度。

---

## 使用方法

### HTTP 接口

| 请求 | 说明 |
|------|------|
| `GET /` | 查询默认城市（温州市鹿城区）天气 |
| `GET /杭州` | 查询杭州天气 |
| `GET /Tokyo` | 查询东京天气（支持英文） |
| `GET /status` | 查看 Bot 运行状态 |

**示例：**

```bash
# 浏览器直接访问
https://weather-bot.your-subdomain.workers.dev/杭州

# curl 查询
curl https://weather-bot.your-subdomain.workers.dev/上海
```

### Telegram 命令

| 命令 | 说明 |
|------|------|
| `/weather` | 查询默认城市（温州鹿城区）标准报告 |
| `/weather 杭州` | 查询杭州标准报告（今日实况 + 明日详细 + 逐小时） |
| `/weather 36` | 查询默认城市未来 36 小时逐小时深度预报 |
| `/weather 杭州 48` | 查询杭州未来 48 小时逐小时深度预报 |

> 小时数最大支持 72 小时（受 WeatherAPI 免费套餐限制）。

---

## 输出示例

### 标准天气报告（`/weather 杭州`）

```
📍 杭州市 天气实况
----------------------------
🌡 温度：16.2°C（体感 16.2°C）
☁️ 状态：小阵雨 | 💧 湿度：94%
💨 风速：1.7 m/s | 🍃 空气：重污 (80)

📅 明日预报（2026/4/5）
----------------------------
🌡 温度：12.8°C ~ 23.0°C（均温 18.2°C）
☁️ 总结：晴天
💧 湿度：55% | 🌂 降水：0.0 mm（概率 5%）
💨 最大风：3.2 m/s | 👁 能见度：10.0 km
🔆 紫外线：6 高
🌅 日出：06:02 AM | 🌇 日落：06:28 PM

⌛ 明日逐小时趋势（06-22时）
  06:00 | 晴天　 | 13°C
  08:00 | 晴天　 | 17°C
  10:00 | 晴天　 | 20°C
  12:00 | 阴天　 | 23°C
  14:00 | 晴天　 | 23°C
  16:00 | 晴天　 | 22°C
  18:00 | 局部多云 | 18°C
  20:00 | 局部多云 | 17°C
  22:00 | 晴朗　 | 15°C

⚠️ 降雨提醒
----------------------------
🕒 短时：小阵雨
🔮 趋势：⚠️ 建议带伞

📊 数据来源: WeatherAPI.com
```

### 逐小时深度预报（`/weather 杭州 24`）

```
📅 未来 24 小时深度预报
📍 杭州市
----------------------------

📅 4月5日
  08:00 | 晴天　 | 14°C
  11:00 | 晴天　 | 21°C
  14:00 | 多云　 | 23°C
  17:00 | 小雨　 | 19°C | 💧1.2mm
  20:00 | 阴天　 | 17°C
  23:00 | 晴天　 | 15°C

📅 4月6日
  02:00 | 晴天　 | 13°C
  05:00 | 晴天　 | 12°C

📊 数据来源: WeatherAPI.com
```

### 降雨预警推送

```
🌧️ 降雨预警
─────────────────
📍 地点：温州市鹿城区
⏰ 预计：17:00 左右开始下雨
🕒 发出：15:02（提前约 2 小时）

☔ 强度：小雨
💧 雨量：1.2 mm/h
📊 概率：68%
⏳ 预计持续：约 3 小时

📡 来源：WeatherAPI.com
```

---

## 降雨预警机制

### 触发逻辑

```
每小时整点运行
     │
     ▼
扫描未来 1.5 ~ 3 小时内的逐小时数据
     │
     ├─ 无降雨概率 > 40% 的时段 → 结束，不推送
     │
     └─ 有符合条件的时段
           │
           ▼
        取概率最高的小时作为预警目标
           │
           ▼
        检查 KV 中是否已有该时段的推送记录
           │
           ├─ 已有记录 → 结束，不重复推送
           │
           └─ 无记录 → 发送 Telegram 预警
                      写入 KV（TTL 4 小时）
```

### 设计说明

- **为什么是 1.5~3 小时窗口？** WeatherAPI 的逐小时数据以整点为单位，每小时调度一次，窗口设为 1.5~3 小时可确保在预报下雨前约 2 小时推送，给出足够准备时间。
- **为什么用 KV 去重？** 同一场雨在连续几次调度中都会被检测到，KV TTL（4 小时）防止同一降雨事件被重复推送打扰。
- **降雨强度划分标准：**

| 强度 | 雨量（mm/h） |
|------|------------|
| 微量 | ≈ 0 |
| 小雨 | < 2.5 |
| 中雨 | 2.5 ~ 8 |
| 大雨 | 8 ~ 16 |
| 暴雨 | ≥ 16 |

---

## 常见问题

**Q：Telegram 没有收到消息怎么排查？**

1. 检查 Webhook 是否正确设置：访问 `getWebhookInfo` 确认 URL 正确
2. 检查 `TG_BOT_TOKEN` 和 `TG_CHAT_ID` 是否填写正确
3. 先向机器人发送一条消息（有些 Bot 在未初始化时无法主动推送）
4. 在 Cloudflare Dashboard → Worker → **Logs** 中查看实时日志

**Q：查询城市名找不到怎么办？**

Nominatim 支持中英文，建议：
- 使用全称，如 `温州市` 而非 `温州`
- 英文城市名也可，如 `Shanghai`、`Tokyo`
- 偏远地区可尝试带省份，如 `丽水市云和县`

**Q：WeatherAPI 免费套餐支持几天预报？**

免费套餐支持最多 3 天（当天 + 未来 2 天），逐小时数据覆盖约 72 小时。`/weather 48` 和 `/weather 72` 都能正常使用，超出范围时会在报告顶部提示数据不足。

**Q：如何同时监控多个城市的降雨？**

在 `scheduled()` 函数中添加多个城市：

```js
async scheduled(event, env) {
  const locations = [
    { lat: "28.0001", lon: "120.6552", name: "温州市鹿城区" },
    { lat: "30.2741", lon: "120.1551", name: "杭州市" },
    { lat: "31.2304", lon: "121.4737", name: "上海市" },
  ];
  await Promise.all(locations.map(loc => checkRainPush(loc, env)));
}
```

**Q：如何自定义降雨触发概率阈值？**

在 `checkRainPush()` 函数中修改：

```js
// 默认 > 40% 触发，可根据需要调整
return diff >= WARN_MIN && diff <= WARN_MAX && h.precipProbability > 0.4;
```

---

## 版本记录

| 版本 | 更新内容 |
|------|----------|
| V12.1 | 修复逐小时预报从当前时刻起算；降雨预警改为提前 1.5~3h 窗口；推送内容增加强度/雨量/概率/持续时长 |
| V12.0 | 双引擎容灾（WeatherAPI 主 + Pirate Weather 备）；明日预报增加均温、湿度、风速、能见度、UV、日出日落 |
| V11.x | 基础天气查询 + Telegram Bot 集成 |

---

## License

MIT License — 自由使用，欢迎 PR。
