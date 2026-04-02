export default {
  // 核心入口：处理 Telegram Webhook 和浏览器访问
  async fetch(request, env, ctx) {
    // 逻辑 A：处理来自 Telegram 的 POST 请求
    if (request.method === "POST") {
      try {
        // 安全检查：如果请求体为空或不是 JSON，直接返回，防止 SyntaxError
        const contentType = request.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          return new Response("Not a JSON request", { status: 400 });
        }

        const update = await request.json();
        
        // 确保收到的是有效的 Telegram 消息
        if (update && update.message && update.message.text) {
          const text = update.message.text.trim();
          
          if (text.startsWith("/weather")) {
            const chatId = update.message.chat.id;
            
            // 身份校验：只回复你自己的账号 (请确保环境变量 TG_CHAT_ID 正确)
            if (chatId.toString() !== env.TG_CHAT_ID.toString()) {
              console.log("Unauthorized Access from:", chatId);
              return new Response("Unauthorized", { status: 403 });
            }

            let location = "120.65,28.01"; // 默认：温州鹿城
            let locationName = "温州鹿城";

            // 解析地名参数 (例如: /weather 杭州)
            const args = text.split(/\s+/);
            if (args.length > 1) {
              const searchName = args.slice(1).join(" ");
              const geo = await this.getGeo(searchName, env.QWEATHER_KEY);
              if (geo) {
                location = `${geo.lon},${geo.lat}`;
                locationName = geo.name;
              } else {
                await this.sendToTG(env, chatId, `❌ 找不到地点：${searchName}\n建议输入省/市/区县全称。`);
                return new Response("OK");
              }
            }

            // 获取综合天气报告 (和风 + 彩云)
            const report = await this.getFullWeather(env, location, false);
            await this.sendToTG(env, chatId, `📍 ${locationName} 实时预报\n${report}`);
          }
        }
      } catch (e) {
        // 捕获所有运行错误，防止 Worker 彻底宕机
        console.error("Worker Execution Error:", e.message);
      }
      return new Response("OK"); // 始终给 TG 返回 200，防止其不断重试
    }

    // 逻辑 B：处理浏览器直接访问 (GET)
    const status = await this.getFullWeather(env, "120.65,28.01", false);
    return new Response(status, { 
      headers: { "content-type": "text/plain;charset=UTF-8" } 
    });
  },

  // 逻辑 C：定时任务 (每小时自动检查降雨)
  async scheduled(event, env, ctx) {
    await this.getFullWeather(env, "120.65,28.01", true);
  },

  // 辅助函数 1：地名转经纬度 (使用和风 GeoAPI)
  async getGeo(name, key) {
    const url = `https://geoapi.qweather.com/v2/city/lookup?location=${encodeURIComponent(name)}&key=${key}&range=cn`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.code === "200" && data.location?.length > 0) {
        const city = data.location[0];
        // 返回格式化后的经纬度
        return { 
          lon: parseFloat(city.lon).toFixed(2), 
          lat: parseFloat(city.lat).toFixed(2), 
          name: city.name 
        };
      }
    } catch (e) {
      console.error("GeoAPI Error:", e.message);
    }
    return null;
  },

  // 辅助函数 2：整合两大 API 数据
  async getFullWeather(env, location, isAutoAlert) {
    const qUrl = `https://devapi.qweather.com/v7/weather/now?location=${location}&key=${env.QWEATHER_KEY}`;
    const cUrl = `https://api.caiyunapp.com/v2.6/${env.CAIYUN_TOKEN}/${location}/hourly?hourlysteps=24`;

    try {
      const [qRes, cRes] = await Promise.all([fetch(qUrl), fetch(cUrl)]);
      const qData = await qRes.json();
      const cData = await cRes.json();

      let report = [];

      // --- 1. 和风天气数据 (实时概况) ---
      if (qData.code === "200") {
        const now = qData.now;
        report.push(`🌡 温度：${now.temp}°C (体感 ${now.feelsLike}°C)`);
        report.push(`💧 湿度：${now.humidity}%  🌬 风力：${now.windScale} 级`);
        report.push(`☁️ 天气：${now.text}`);
      }

      // --- 2. 彩云天气数据 (精准降雨预测) ---
      if (cData.status === "ok") {
        const hourly = cData.result.hourly;
        const targetHourPcp = hourly.precipitation[2].value; // 2小时后的预测

        // 自动提醒模式：如果没有降雨则静默
        if (isAutoAlert && targetHourPcp <= 0.05) return "No Rain";

        let startTimeRaw = "", duration = 0, maxPcp = 0, foundStart = false;
        for (let i = 0; i < hourly.precipitation.length; i++) {
          const pcp = hourly.precipitation[i].value;
          if (pcp > 0.05) {
            if (!foundStart) { startTimeRaw = hourly.precipitation[i].datetime; foundStart = true; }