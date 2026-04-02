export default {
  async fetch(request, env) {
    if (request.method === "GET") {
      // 网页访问回显，用于排查环境变量
      return new Response(`
☁️ Weather Bot 运行中
--------------------
TG Token: ${env.TG_BOT_TOKEN ? "已配置 ✅" : "未配置 ❌"}
和风 Key: ${env.QWEATHER_KEY ? "已配置 ✅" : "未配置 ❌"}
彩云 Token: ${env.CAIYUN_TOKEN ? "已配置 ✅" : "未配置 ❌"}
KV 绑定: ${env.WEATHER_KV ? "已配置 ✅" : "未配置 ❌"}
      `, { headers: { "Content-Type": "text/plain;charset=UTF-8" } });
    }

    if (request.method === "POST") {
      try {
        const update = await request.json();
        if (update.message && update.message.text) {
          await handleMessage(update.message, env);
        }
      } catch (e) {
        return new Response(e.message);
      }
    }
    return new Response("OK");
  },

  // 定时触发器 (用于降雨预警推送)
  async scheduled(event, env) {
    await checkRainAndNotify(env);
  }
};

// 处理 Telegram 消息
async function handleMessage(message, env) {
  const text = message.text;
  const chatId = message.chat.id;

  if (text.startsWith("/weather")) {
    const cityName = text.split(" ")[1] || "温州"; // 默认城市
    
    // 1. 获取经纬度 (和风 GeoAPI)
    const geoData = await fetch(`https://geoapi.qweather.com/v2/city/lookup?location=${cityName}&key=${env.QWEATHER_KEY}`).then(res => res.json());
    
    if (!geoData.location || geoData.location.length === 0) {
      await sendToTelegram(chatId, `❌ 找不到地点：${cityName}`, env);
      return;
    }

    const { lat, lon, name } = geoData.location[0];

    // 2. 并行获取天气数据
    const [qNow, qAir, qSun, cRain] = await Promise.all([
      fetch(`https://devapi.qweather.com/v7/weather/now?location=${lon},${lat}&key=${env.QWEATHER_KEY}`).then(res => res.json()),
      fetch(`https://devapi.qweather.com/v7/indices/1d?type=8&location=${lon},${lat}&key=${env.QWEATHER_KEY}`).then(res => res.json()),
      fetch(`https://devapi.qweather.com/v7/astronomy/sun?location=${lon},${lat}&date=${getToday()}&key=${env.QWEATHER_KEY}`).then(res => res.json()),
      fetch(`https://api.cyannew.com/v2.6/${env.CAIYUN_TOKEN}/${lon},${lat}/minutely.json`).then(res => res.json())
    ]);

    // 3. 格式化并发送消息
    const msg = formatMessage(name, qNow.now, qAir.daily[0], qSun, cRain.result);
    await sendToTelegram(chatId, msg, env);
  }
}

// 格式化天气信息
function formatMessage(name, now, air, sun, rain) {
  return `
📍 *${name} 天气实况*
----------------------------
🌡 温度：${now.temp}°C (体感 ${now.feelsLike}°C)
☁️ 状态：${now.text} | 💧 湿度：${now.humidity}%
💨 风速：${now.windDir} ${now.windScale}级
🍃 空气质量：${air.category}

🌅 日出：${sun.sunrise} | 🌇 日落：${sun.sunset}

⚠️ *降雨预警 (2h内)*
${rain.forecast_keypoint || "目前暂无降雨计划"}
  `.trim();
}

// 发送 TG 消息
async function sendToTelegram(chatId, text, env) {
  const url = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: "Markdown" })
  });
}

// 获取今天日期 (YYYYMMDD)
function getToday() {
  const d = new Date();
  return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2);
}
