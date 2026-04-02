export default {
  async fetch(request, env, ctx) {
    if (request.method === "POST") {
      try {
        const update = await request.json();
        if (update.message && update.message.text && update.message.text.startsWith("/weather")) {
          const chatId = update.message.chat.id;
          
          // 身份安全校验
          if (chatId.toString() !== env.TG_CHAT_ID.toString()) return new Response("Unauthorized", { status: 403 });

          const text = update.message.text.trim();
          let location = "120.65,28.01"; // 默认：温州鹿城经纬度
          let locationName = "温州鹿城";

          // 1. 解析指令是否带地名
          const args = text.split(/\s+/);
          if (args.length > 1) {
            const searchName = args.slice(1).join(" ");
            const geo = await this.getGeo(searchName, env.QWEATHER_KEY);
            if (geo) {
              location = `${geo.lon},${geo.lat}`;
              locationName = geo.name;
            } else {
              await this.sendToTG(env, chatId, `❌ 找不到地点：${searchName}\n请确认地名输入正确。`);
              return new Response("OK");
            }
          }

          // 2. 获取天气报告
          const report = await this.getFullWeather(env, location, false);
          await this.sendToTG(env, chatId, `📍 ${locationName} 实时预报\n${report}`);
        }
      } catch (e) {
        console.error("Fetch Error:", e.message);
      }
      return new Response("OK");
    }

    // 网页访问预览（默认查温州）
    const status = await this.getFullWeather(env, "120.65,28.01", false);
    return new Response(status, { headers: { "content-type": "text/plain;charset=UTF-8" } });
  },

  // 定时任务：仅用于降雨自动预警（主要靠彩云）
  async scheduled(event, env, ctx) {
    await this.getFullWeather(env, "120.65,28.01", true);
  },

  // 核心：地名转经纬度 (和风 GeoAPI)
  async getGeo(name, key) {
    const url = `https://geoapi.qweather.com/v2/city/lookup?location=${encodeURIComponent(name)}&key=${key}&range=cn`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code === "200" && data.location?.length > 0) {
      const city = data.location[0];
      return { lon: parseFloat(city.lon).toFixed(2), lat: parseFloat(city.lat).toFixed(2), name: city.name };
    }
    return null;
  },

  // 核心：整合天气查询
  async getFullWeather(env, location, isAutoAlert) {
    // 同时也支持和风实时天气（作为主力）
    const qUrl = `https://devapi.qweather.com/v7/weather/now?location=${location}&key=${env.QWEATHER_KEY}`;
    const cUrl = `https://api.caiyunapp.com/v2.6/${env.CAIYUN_TOKEN}/${location}/hourly?hourlysteps=24`;

    try {
      // 并发请求两个 API
      const [qRes, cRes] = await Promise.all([fetch(qUrl), fetch(cUrl)]);
      const qData = await qRes.json();
      const cData = await cRes.json();

      // --- 处理和风数据 (主力查询内容) ---
      let report = [];
      if (qData.code === "200") {
        const now = qData.now;
        report.push(`🌡 温度：${now.temp}°C (体感 ${now.feelsLike}°C)`);
        report.push(`💧 湿度：${now.humidity}%  🌬 风力：${now.windScale} 级 (${now.windDir})`);
        report.push(`☁️ 天气：${now.text}`);
      }

      // --- 处理彩云数据 (降雨深度预测) ---
      if (cData.status === "ok") {
        const hourly = cData.result.hourly;
        const targetHourPcp = hourly.precipitation[2].value;

        // 定时预警逻辑：如果2小时后没雨则不打扰
        if (isAutoAlert && targetHourPcp <= 0.05) return "无雨";

        let startTimeRaw = "", duration = 0, maxPcp = 0, foundStart = false;
        for (let i = 0; i < hourly.precipitation.length; i++) {
          const pcp = hourly.precipitation[i].value;
          if (pcp > 0.05) {
            if (!foundStart) { startTimeRaw = hourly.precipitation[i].datetime; foundStart = true; }
            duration++;
            if (pcp > maxPcp) maxPcp = pcp;
          } else if (foundStart) break;
        }

        report.push(`------------------`);
        if (foundStart) {
          const startObj = new Date(startTimeRaw);
          const endObj = new Date(startObj.getTime() + duration * 60 * 60 * 1000);
          const formatTime = (d) => d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour: '2-digit', minute: '2-digit', hour12: false });
          report.push(`☔️ 降雨提醒：${formatTime(startObj)} 开始`);
          report.push(`⏱ 持续时长：约 ${duration} 小时 (至 ${formatTime(endObj)})`);
          report.push(`📊 最大雨量：${maxPcp.toFixed(2)} mm/h`);
        } else {
          report.push(`☀️ 未来 24 小时暂无明显降雨。`);
        }

        // 定时任务下的 TG 发送
        if (isAutoAlert && foundStart) {
          const last = await env.WEATHER_KV.get("last_rain_start");
          if (last === startTimeRaw) return "已预警";
          await this.sendToTG(env, env.TG_CHAT_ID, `⚠️ 自动降雨预警：\n📍 温州鹿城\n${report.join('\n')}`);
          await env.WEATHER_KV.put("last_rain_start", startTimeRaw);
          return "预警已发";
        }
      }

      return report.join('\n');
    } catch (e) {
      return `查询出错: ${e.message}`;
    }
  },

  async sendToTG(env, chatId, text) {
    await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text })
    });
  }
};
