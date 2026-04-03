/**
 * Weather Bot V12.2 - 最终修正生产版
 * 处理了 .default 重复定义错误，集成了动态雷达与 2小时降雨预警
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let cityName = decodeURIComponent(url.pathname.split('/')[1] || "").trim();
    
    if (!cityName || cityName === "status") cityName = "温州市鹿城区";

    if (url.pathname === "/status") {
      return new Response("Weather Bot V12.2 Online", { headers: { "Content-Type": "text/plain;charset=UTF-8" } });
    }

    if (request.method === "GET") {
      try {
        const geo = await getGeoLocation(cityName);
        const data = await getAllData(geo.lat, geo.lon, geo.name, env);
        const report = await generateFullReport(data, env, geo.lat, geo.lon, true); 
        
        const htmlOutput = `
          <!DOCTYPE html>
          <html lang="zh-CN">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>⛅ ${data.name} 天气预报</title>
            <style>
              body { font-family: -apple-system, sans-serif, monospace; line-height: 1.6; padding: 20px; background: #f4f7f6; color: #333; }
              pre { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); white-space: pre-wrap; font-size: 15px; }
              a { color: #007bff; text-decoration: none; font-weight: bold; }
            </style>
          </head>
          <body><pre>${report}</pre></body>
          </html>
        `;
        return new Response(htmlOutput, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
      } catch (e) {
        return new Response(`❌ 系统异常: ${e.message}`, { status: 500 });
      }
    }

    if (request.method === "POST") {
      try {
        const update = await request.json();
        if (update.message?.text) await handleTelegramMessage(update.message, env);
      } catch (e) {}
      return new Response("OK");
    }
  },

  async scheduled(event, env) {
    // 自动推送默认地点
    const defaultLoc = { lat: "28.0188", lon: "120.6507", name: "温州市鹿城区" };
    await checkRainPush(defaultLoc, env);
  }
};

/**
 * 辅助函数部分
 */
async function getGeoLocation(cityName) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=1&addressdetails=1`, { 
    headers: { "User-Agent": "WeatherBot/1.2" } 
  });
  const data = await res.json();
  if (!data?.length) throw new Error(`找不到地点: ${cityName}`);
  const addr = data[0].address;
  const displayName = addr.city || addr.town || addr.district || addr.county || data[0].display_name.split(',')[0];
  return { lat: data[0].lat, lon: data[0].lon, name: displayName };
}

async function getAllData(lat, lon, name, env) {
  try {
    return await fetchWeatherAPI(lat, lon, name, env);
  } catch (e) {
    return await fetchPirateWeather(lat, lon, name, env);
  }
}

async function fetchWeatherAPI(lat, lon, name, env) {
  const wUrl = `https://api.weatherapi.com/v1/forecast.json?key=${env.WEATHERAPI_KEY}&q=${lat},${lon}&days=3&aqi=yes&lang=zh`;
  const res = await fetch(wUrl);
  if (!res.ok) throw new Error("WeatherAPI Fail");
  const d = await res.json();
  return {
    source: "WeatherAPI.com", isNativeZh: true, name: name,
    currently: {
      temperature: d.current.temp_c,
      apparentTemperature: d.current.feelslike_c,
      summary: d.current.condition.text,
      humidity: d.current.humidity / 100,
      windSpeed: (d.current.wind_kph / 3.6).toFixed(1),
      precipIntensity: d.current.precip_mm,
      precipProbability: d.current.precip_mm > 0 ? 0.5 : 0
    },
    daily: {
      data: d.forecast.forecastday.map(day => ({
        time: day.date_epoch, temperatureLow: day.day.mintemp_c, temperatureHigh: day.day.maxtemp_c, summary: day.day.condition.text
      }))
    },
    hourly: {
      data: d.forecast.forecastday.flatMap(day => day.hour.map(h => ({
        time: h.time_epoch, summary: h.condition.text, temperature: h.temp_c, precipIntensity: h.precip_mm, precipProbability: h.chance_of_rain / 100
      })))
    },
    air: { current: { european_aqi: d.current.air_quality["gb-defra-index"] * 10 } }
  };
}

async function fetchPirateWeather(lat, lon, name, env) {
  const wUrl = `https://api.pirateweather.net/forecast/${env.PIRATE_WEATHER_KEY}/${lat},${lon}?units=si`;
  const aUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=european_aqi&timezone=auto`;
  const [wRes, aRes] = await Promise.all([fetch(wUrl), fetch(aUrl)]);
  if (!wRes.ok) throw new Error("Pirate API Fail");
  return { name, ...(await wRes.json()), air: await aRes.json(), source: "Pirate Weather", isNativeZh: false };
}

async function checkRainPush(loc, env) {
  try {
    const data = await getAllData(loc.lat, loc.lon, loc.name, env);
    const nowEpoch = Math.floor(Date.now() / 1000);
    const target = (data.hourly?.data || []).find(h => {
      const diffMinutes = (h.time - nowEpoch) / 60;
      return diffMinutes > 45 && diffMinutes < 150 && h.precipProbability > 0.45;
    });
    
    if (target) {
      const timeStr = new Date(target.time * 1000).toLocaleTimeString('zh-CN', {
        timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false
      });
      const radarUrl = `https://www.windy.com/-Rain-thunder-rain?radar,${loc.lat},${loc.lon},9`;
      const msg = `🌧️ 降雨预警：预计在 ${timeStr} 左右开始下雨。\n📡 实时雷达：${radarUrl}`;
      const kvKey = `push_v12.2_${loc.name}_${target.time}`;
      if (!(await env.WEATHER_KV.get(kvKey))) {
        await sendToTelegram(env.TG_CHAT_ID, `📍 ${loc.name}\n${msg}`, env);
        await env.WEATHER_KV.put(kvKey, "true", { expirationTtl: 10800 });
      }
    }
  } catch (e) {}
}

async function smartTranslate(text, env, isNativeZh, type = "general") {
  if (!text || isNativeZh) return text;
  const prompt = type === "trend" ? "翻译成3-4字气象中文。" : "将天气描述翻译成简洁中文。";
  try {
    const res = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
      messages: [{ role: "system", content: prompt }, { role: "user", content: text }],
      temperature: 0.1
    });
    return res.response.trim().replace(/^["']|["']$/g, '');
  } catch (e) { return text; }
}

function alignText(text, len = 4) {
  let str = text.slice(0, len);
  while (str.length < len) str += "　";
  return str;
}

async function generateFullReport(data, env, lat, lon, isHtml = false) {
  const cur = data.currently;
  const tomorrow = data.daily?.data?.[1];
  const [curStatus, tomSummary] = await Promise.all([
    smartTranslate(cur.summary, env, data.isNativeZh),
    smartTranslate(tomorrow.summary, env, data.isNativeZh)
  ]);

  const aqi = data.air?.current?.european_aqi ?? "--";
  const aqiText = aqi <= 20 ? "优" : aqi <= 40 ? "良" : aqi <= 60 ? "轻污" : "重污";
  const radarUrl = `https://www.windy.com/-Rain-thunder-rain?radar,${lat},${lon},9`;
  const radarLink = isHtml ? `<a href="${radarUrl}" target="_blank">点击查看实时雷达波图</a>` : radarUrl;

  const bjTomorrow = new Date(tomorrow.time * 1000).toLocaleDateString('en-CA', {timeZone: 'Asia/Shanghai'});
  const selectedHours = (data.hourly?.data || []).filter(h => 
    new Date(h.time * 1000).toLocaleDateString('en-CA', {timeZone: 'Asia/Shanghai'}) === bjTomorrow
  ).filter((_, i) => i >= 6 && i <= 22 && i % 2 === 0);

  let hourlyTrend = "";
  if (selectedHours.length > 0) {
    const trends = data.isNativeZh ? selectedHours.map(h => h.summary.slice(0,4)) : await Promise.all(selectedHours.map(h => smartTranslate(h.summary, env, false, "trend")));
    selectedHours.forEach((h, i) => {
      const time = new Date(h.time * 1000).toLocaleTimeString('zh-CN', {timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false});
      hourlyTrend += `  ${time} | ${alignText(trends[i])} | ${h.temperature.toFixed(0).padStart(2, ' ')}°C${h.precipProbability > 0.1 ? ` | 💧${h.precipIntensity.toFixed(1)}mm` : ""}\n`;
    });
  }

  return `
📍 ${data.name} 天气实况
----------------------------
🌡 温度：${cur.temperature.toFixed(1)}°C (体感 ${cur.apparentTemperature.toFixed(1)}°C)
☁️ 状态：${curStatus} | 🍃 空气：${aqiText} (${aqi})
💨 风速：${cur.windSpeed} m/s | 💧 湿度：${(cur.humidity * 100).toFixed(0)}%

📅 明日预报 (${new Date(tomorrow.time * 1000).toLocaleDateString('zh-CN', {timeZone: 'Asia/Shanghai'})})
----------------------------
🌡 范围：${tomorrow.temperatureLow.toFixed(1)}°C ~ ${tomorrow.temperatureHigh.toFixed(1)}°C
📝 总结：${tomSummary}

⌛ 明日逐小时趋势 (06-22时)
${hourlyTrend || "  (暂无数据)"}

⚠️ 降雨提醒
----------------------------
🕒 短时：${data.isNativeZh ? cur.summary : await smartTranslate(data.minutely?.summary || "无明显变化", env, false)}
🔮 趋势：${(cur.precipProbability > 0.4) ? "⚠️ 建议带伞" : "🍀 暂无明显降水趋势"}

📡 实时雷达：${radarLink}
📊 数据来源：${data.source}
  `.trim();
}

async function handleTelegramMessage(message, env) {
  const text = message.text.trim();
  if (!text.startsWith("/weather")) return;
  const parts = text.split(/\s+/);
  const cityName = parts.length > 1 ? parts.slice(1).join(" ") : "温州市鹿城区";

  try {
    const geo = await getGeoLocation(cityName);
    const data = await getAllData(geo.lat, geo.lon, geo.name, env);
    const report = await generateFullReport(data, env, geo.lat, geo.lon, false); 
    await sendToTelegram(message.chat.id, report, env);
  } catch (e) { 
    await sendToTelegram(message.chat.id, `❌ 查询失败: ${e.message}`, env); 
  }
}

async function sendToTelegram(chatId, text, env) {
  await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text })
  });
}
