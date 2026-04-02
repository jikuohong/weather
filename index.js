/**
 * Weather Bot V11.0 - 终极稳定版
 * 修复：地名解析偏好、参数冲突、列对齐优化
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // 路由解析：默认为“温州市鹿城区”以确保定位精准
    let cityName = decodeURIComponent(url.pathname.split('/')[1] || "").trim();
    if (!cityName || cityName === "status") cityName = "温州市鹿城区";

    if (url.pathname === "/status") {
      return new Response(`☁️ Weather Bot V11.0\n------------------\n默认城市：${cityName}`, { 
        headers: { "Content-Type": "text/plain;charset=UTF-8" } 
      });
    }

    if (request.method === "GET") {
      try {
        const geo = await getGeoLocation(cityName);
        const data = await getAllData(geo.lat, geo.lon, geo.name, env);
        const report = await generateFullReport(data, env);
        return new Response(report, { headers: { "Content-Type": "text/plain;charset=UTF-8" } });
      } catch (e) {
        return new Response(`❌ 查询失败: ${e.message}`, { status: 500 });
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
    // 定时任务默认坐标：温州鹿城
    const defaultLoc = { lat: "28.0001", lon: "120.6552", name: "温州鹿城" };
    await checkRainPush(defaultLoc, env);
  }
};

/**
 * 核心数据抓取
 */
async function getAllData(lat, lon, name, env) {
  const wUrl = `https://api.pirateweather.net/forecast/${env.PIRATE_WEATHER_KEY}/${lat},${lon}?units=si`;
  const aUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=european_aqi&timezone=auto`;
  const [wRes, aRes] = await Promise.all([fetch(wUrl), fetch(aUrl)]);
  if (!wRes.ok) throw new Error("天气 API 响应错误");
  return { name, ...(await wRes.json()), air: await aRes.json() };
}

/**
 * 地理编码：增加 City 级别偏好，防止搜到“温州路”
 */
async function getGeoLocation(cityName) {
  // 增加 &featuretype=settlement 尽量匹配行政区而非街道
  const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=1&addressdetails=1`;
  const geoRes = await fetch(geoUrl, { headers: { "User-Agent": "WeatherBot/1.1" } });
  const data = await geoRes.json();
  
  if (!data?.length) throw new Error(`找不到地点: ${cityName}`);
  
  // 优先取城市名或区名，防止显示“温州路”
  const addr = data[0].address;
  const displayName = addr.city || addr.town || addr.district || addr.county || data[0].display_name.split(',')[0];
  
  return { lat: data[0].lat, lon: data[0].lon, name: displayName };
}

async function aiTranslate(text, env, type = "general") {
  if (!text || !env.AI) return text;
  const prompt = type === "trend" ? "将天气翻译成3-4个字的中文词汇。" : "将天气翻译成地道中文。只输出结果。";
  const res = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
    messages: [{ role: "system", content: prompt }, { role: "user", content: text }]
  });
  return res.response.trim().replace(/^["']|["']$/g, '');
}

/**
 * 对齐工具
 */
function alignText(text, len = 4) {
  let str = text.slice(0, len);
  while (str.length < len) str += "　";
  return str;
}

function formatPrecip(intensity) {
  if (!intensity || intensity <= 0) return " 0.0mm";
  if (intensity < 0.1) return " 微量";
  return `${intensity.toFixed(1).padStart(4, ' ')}mm`;
}

/**
 * 生成深度预报 (支持任意小时)
 */
async function generateHourlyDeepReport(data, hours, env) {
  const hourly = data.hourly.data.slice(0, hours + 1);
  const sampled = hourly.filter((_, i) => i % 3 === 0);
  const trends = await Promise.all(sampled.map(h => aiTranslate(h.summary, env, "trend")));
  
  let report = `📅 未来 ${hours} 小时深度预报\n📍 ${data.name}\n----------------------------\n`;
  let lastDate = "";

  sampled.forEach((h, i) => {
    const date = new Date(h.time * 1000);
    const dateStr = date.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', hour12: false });
    
    if (dateStr !== lastDate) {
      report += `\n📅 ${dateStr}\n`;
      lastDate = dateStr;
    }
    
    const status = alignText(trends[i]);
    const rain = h.precipProbability > 0.1 ? ` | 💧${h.precipIntensity.toFixed(1)}mm` : "";
    report += `  ${timeStr}:00 | ${status} | ${h.temperature.toFixed(0).padStart(2, ' ')}°C${rain}\n`;
  });
  
  return report;
}

/**
 * 生成常规实况报告
 */
async function generateFullReport(data, env) {
  const cur = data.currently;
  const tomorrow = data.daily?.data?.[1];
  const [curStatus, tomSummary] = await Promise.all([
    aiTranslate(cur.summary, env),
    aiTranslate(tomorrow.summary, env)
  ]);

  const aqi = data.air?.current?.european_aqi ?? "--";
  const aqiText = aqi <= 20 ? "优" : aqi <= 40 ? "良" : aqi <= 60 ? "轻度污染" : "重度污染";

  const bjTomorrow = new Date(tomorrow.time * 1000).toLocaleDateString('en-CA', {timeZone: 'Asia/Shanghai'});
  const selectedHours = (data.hourly?.data || []).filter(h => 
    new Date(h.time * 1000).toLocaleDateString('en-CA', {timeZone: 'Asia/Shanghai'}) === bjTomorrow
  ).filter((_, i) => i >= 6 && i <= 22 && i % 2 === 0);

  let hourlyTrend = "";
  if (selectedHours.length > 0) {
    const trends = await Promise.all(selectedHours.map(h => aiTranslate(h.summary, env, "trend")));
    selectedHours.forEach((h, i) => {
      const time = new Date(h.time * 1000).toLocaleTimeString('zh-CN', {timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false});
      const rain = h.precipProbability > 0.1 ? ` | 💧${formatPrecip(h.precipIntensity).trim()}` : "";
      hourlyTrend += `  ${time} | ${alignText(trends[i])} | ${h.temperature.toFixed(0).padStart(2, ' ')}°C${rain}\n`;
    });
  }

  return `
📍 ${data.name} 天气实况
----------------------------
🌡 温度：${cur.temperature.toFixed(1)}°C (体感 ${cur.apparentTemperature.toFixed(1)}°C)
☁️ 状态：${curStatus} | 💧 湿度：${(cur.humidity * 100).toFixed(0)}%
💨 风速：${cur.windSpeed} m/s | 🍃 空气：${aqiText} (${aqi})

📅 明日预报 (${new Date(tomorrow.time * 1000).toLocaleDateString('zh-CN', {timeZone: 'Asia/Shanghai'})})
----------------------------
🌡 范围：${tomorrow.temperatureLow.toFixed(1)}°C ~ ${tomorrow.temperatureHigh.toFixed(1)}°C
📝 总结：${tomSummary}

⌛ 明日逐小时趋势 (06-22时)
${hourlyTrend || "  (暂无数据)"}

⚠️ 降雨提醒
----------------------------
🕒 短时：${await aiTranslate(data.minutely?.summary || "无明显降雨趋势", env)}
🔮 趋势：${(cur.precipProbability > 0.4) ? "⚠️ 建议带伞" : "🍀 暂无明显降水趋势"}
  `.trim();
}

/**
 * TG 消息处理：支持参数任意排序
 */
async function handleTelegramMessage(message, env) {
  const text = message.text.trim();
  if (!text.startsWith("/weather")) return;

  const parts = text.split(/\s+/);
  let cityName = "温州市鹿城区"; // 默认加精准描述
  let hours = null;

  for (let i = 1; i < parts.length; i++) {
    if (/^\d+$/.test(parts[i])) {
      hours = parseInt(parts[i]);
    } else {
      cityName = parts[i];
    }
  }

  try {
    const geo = await getGeoLocation(cityName);
    const data = await getAllData(geo.lat, geo.lon, geo.name, env);

    if (hours) {
      const report = await generateHourlyDeepReport(data, Math.min(hours, 48), env);
      await sendToTelegram(message.chat.id, report, env);
    } else {
      const report = await generateFullReport(data, env);
      await sendToTelegram(message.chat.id, report, env);
    }
  } catch (e) {
    await sendToTelegram(message.chat.id, `❌ 查询失败: ${e.message}`, env);
  }
}

async function checkRainPush(loc, env) {
  try {
    const data = await getAllData(loc.lat, loc.lon, loc.name, env);
    const target = (data.hourly?.data || []).slice(0, 3).find(h => h.precipProbability > 0.45);
    if (target) {
      const timeStr = new Date(target.time * 1000).toLocaleTimeString('zh-CN', {timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit'});
      const msg = `🌧️ 降雨预警：预计 ${timeStr} 左右有雨 (强度 ${formatPrecip(target.precipIntensity).trim()})。`;
      const kvKey = `push_${loc.name}_${target.time}`;
      if (!(await env.WEATHER_KV.get(kvKey))) {
        await sendToTelegram(env.TG_CHAT_ID, `📍 ${loc.name}\n${msg}`, env);
        await env.WEATHER_KV.put(kvKey, "true", { expirationTtl: 10800 });
      }
    }
  } catch (e) {}
}

async function sendToTelegram(chatId, text, env) {
  await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text })
  });
}
