export default {
  // 核心入口：处理 Telegram Webhook 和浏览器访问
  async fetch(request, env, ctx) {
    if (request.method === "POST") {
      try {
        const contentType = request.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          return new Response("Not a JSON request", { status: 400 });
        }

        const update = await request.json();
        
        if (update && update.message && update.message.text) {
          const text = update.message.text.trim();
          
          if (text.startsWith("/weather")) {
            const chatId = update.message.chat.id;
            
            // 身份校验
            if (chatId.toString() !== env.TG_CHAT_ID.toString()) {
              return new Response("Unauthorized", { status: 403 });
            }

            let location = "120.65,28.01"; // 默认：温州鹿城
            let locationName = "温州鹿城";

            const args = text.split(/\s+/);
            if (args.length > 1) {
              const searchName = args.slice(1).join(" ");
              const geo = await this.getGeo(searchName, env.QWEATHER_KEY);
              if (geo) {
                location = `${geo.lon},${geo.lat}`;
                locationName = geo.name;
              } else {
                await this.sendToTG(env, chatId, `❌ 找不到地点：${searchName}`);
                return new Response("OK");
              }
            }

            const report = await this.getFullWeather(env, location, false);
            await this.sendToTG(env, chatId, `📍 ${locationName} 实时预报\n${report}`);
          }
        }
      } catch (e) {
        console.error("Worker Execution Error:", e.message);
      }
      return new Response("OK");
    }

    const status = await this.getFullWeather(env, "120.65,28.01", false);
    return new Response(status, { 
      headers: { "content-type": "text/plain;charset=UTF-8" } 
    });
  },

  async scheduled(event, env, ctx) {
    await this.getFullWeather(env, "120.65,28.01", true);
  },

  async getGeo(name, key) {
    const url = `https://geoapi.qweather.com/v2/city/lookup?location=${encodeURIComponent(name)}&key=${key}&range=cn`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.code === "200" && data.location?.length > 0) {
        const city = data.location[0];
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

  async getFullWeather(env, location, isAutoAlert) {
    const qUrl = `https://devapi.qweather.com/v7/weather/now?location=${location}&key=${env.QWEATHER_KEY}`;
    const cUrl = `https://api.caiyunapp.com/v2.6/${env.CAIYUN_TOKEN}/${location}/hourly?hourlysteps=24`;

    try {
      const [qRes, cRes] = await Promise.all([fetch(qUrl), fetch(cUrl)]);
      const qData = await qRes.json();
      const cData = await cRes.json();

      let report = [];

      if (qData.code === "200") {
        const now = qData.now;
        report.push(`🌡 温度：${now.temp}°C (体感 ${now.feelsLike}°C)`);
        report.push(`💧 湿度：${now.humidity}%  🌬 风力：${now.windScale} 级`);
        report.push(`☁️ 天气：${now.text}`);
      }

      if (cData.status === "ok") {
        const hourly = cData.result.hourly;
        const targetHourPcp = hourly.precipitation[2].value;

        if (isAutoAlert && targetHourPcp <= 0.05) return "No Rain";

        let startTimeRaw = "", duration = 0, maxPcp = 0, foundStart = false;
        for (let i = 0; i < hourly.precipitation.length; i++) {
          const pcp = hourly.precipitation[i].value;
          if (pcp > 0.05) {
            if (!foundStart) { 
              startTimeRaw = hourly.precipitation[i].datetime; 
              foundStart = true; 
            }
            duration++;
            if (pcp > maxPcp) maxPcp = pcp;
          } else if (foundStart) {
            break;
          }
        }

        report.push(`------------------`);
        if (foundStart) {
          const startObj = new Date(startTimeRaw);
          const endObj = new Date(startObj.getTime() + duration * 60 * 60 * 1000);
          const formatTime = (d) => d.toLocaleString("zh-CN", { 
            timeZone: "Asia/Shanghai", hour: '2-digit', minute: '2-digit', hour12: false 
          });
          report.push(`☔️ 降雨预警：${formatTime(startObj)} 开始`);
          report.push(`⏱ 持续：约 ${duration} 小时 (至 ${formatTime(endObj)})`);
          report.push(`📊 强度：${maxPcp.toFixed(2)} mm/h`);
        } else {
          report.push(`☀️ 未来 24 小时无降雨。`);
        }

        if (isAutoAlert && foundStart) {
          const last = await env.WEATHER_KV.get("last_rain_start");
          if (last === startTimeRaw) return "Already Alerted";
          await this.sendToTG(env, env.TG_CHAT_ID, `⚠️ 实时降雨预警：\n📍 温州鹿城\n${report.join('\n')}`);
          await env.WEATHER_KV.put("last_rain_start", startTimeRaw);
          return "Alert Sent";
        }
      }

      return report.join('\n');
    } catch (e) {
      return `请求失败: ${e.message}`;
    }
  },

  async sendToTG(env, chatId, text) {
    const url = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text })
    });
  }
};