/**
 * Weather Bot V12.1 - 稳定旗舰版
 * 策略：WeatherAPI (主) + Pirate Weather (备)
 * 特点：原生中文、精准定位、无感容灾、排版对齐
 * 修复：逐小时预报从当前时间起算，确保 /weather N 返回真正未来 N 小时
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let cityName = decodeURIComponent(url.pathname.split('/')[1] || "").trim();
    if (!cityName || cityName === "status") cityName = "温州市鹿城区";

    if (url.pathname === "/status") {
      const s = `☁️ Weather Bot V12.1\n------------------\nPrimary: WeatherAPI\nBackup: Pirate\nStatus: Online`;
      return new Response(s, { headers: { "Content-Type": "text/plain;charset=UTF-8" } });
    }

    if (request.method === "GET") {
      try {
        const geo = await getGeoLocation(cityName);
        const data = await getAllData(geo.lat, geo.lon, geo.name, env);
        const report = await generateFullReport(data, env);
        return new Response(report, { headers: { "Content-Type": "text/plain;charset=UTF-8" } });
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
    const defaultLoc = { lat: "28.0001", lon: "120.6552", name: "温州市鹿城区" };
    await checkRainPush(defaultLoc, env);
  }
};

// ─────────────────────────────────────────────
// 核心：双引擎切换逻辑 (WeatherAPI 优先)
// ─────────────────────────────────────────────

async function getAllData(lat, lon, name, env) {
  try {
    return await fetchWeatherAPI(lat, lon, name, env);
  } catch (e) {
    console.log("⚠️ WeatherAPI 故障，尝试切换 Pirate Weather...");
    return await fetchPirateWeather(lat, lon, name, env);
  }
}

async function fetchWeatherAPI(lat, lon, name, env) {
  const wUrl = `https://api.weatherapi.com/v1/forecast.json?key=${env.WEATHERAPI_KEY}&q=${lat},${lon}&days=3&aqi=yes&lang=zh`;
  const res = await fetch(wUrl);
  if (!res.ok) throw new Error("WeatherAPI Fail");
  const d = await res.json();
  return {
    source: "WeatherAPI.com",
    isNativeZh: true,
    name: name,
    currently: {
      temperature: d.current.temp_c,
      apparentTemperature: d.current.feelslike_c,
      summary: d.current.condition.text,
      humidity: d.current.humidity / 100,
      windSpeed: (d.current.wind_kph / 3.6).toFixed(1),
      precipIntensity: d.current.precip_mm,
      precipProbability: d.current.precip_mm > 0 ? 0.5 : 0,
      minutelySummary: d.current.condition.text
    },
    daily: {
      data: d.forecast.forecastday.map(day => ({
        time: day.date_epoch,
        temperatureLow: day.day.mintemp_c,
        temperatureHigh: day.day.maxtemp_c,
        summary: day.day.condition.text
      }))
    },
    hourly: {
      data: d.forecast.forecastday.flatMap(day =>
        day.hour.map(h => ({
          time: h.time_epoch,
          summary: h.condition.text,
          temperature: h.temp_c,
          precipIntensity: h.precip_mm,
          precipProbability: h.chance_of_rain / 100
        }))
      )
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

// ─────────────────────────────────────────────
// 翻译：仅在非原生中文时触发
// ─────────────────────────────────────────────

async function smartTranslate(text, env, isNativeZh, type = "general") {
  if (!text || isNativeZh) return text;
  const prompt = type === "trend"
    ? "你是一个气象助手。将输入翻译成3-4个中文字词。严禁任何解释或英文，只给结果。"
    : "你是一个气象助手。将天气描述翻译成简洁中文。严禁对话，只给结果。";
  try {
    const res = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
      messages: [{ role: "system", content: prompt }, { role: "user", content: text }],
      temperature: 0.1
    });
    let result = res.response.trim().replace(/^["']|["']$/g, '');
    return result.length > 15 ? text : result;
  } catch (e) { return text; }
}

// ─────────────────────────────────────────────
// 地理定位
// ─────────────────────────────────────────────

async function getGeoLocation(cityName) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=1&addressdetails=1`,
    { headers: { "User-Agent": "WeatherBot/1.2" } }
  );
  const data = await res.json();
  if (!data?.length) throw new Error(`找不到地点: ${cityName}`);
  const addr = data[0].address;
  const displayName = addr.city || addr.town || addr.district || addr.county || data[0].display_name.split(',')[0];
  return { lat: data[0].lat, lon: data[0].lon, name: displayName };
}

// ─────────────────────────────────────────────
// 排版工具
// ─────────────────────────────────────────────

function alignText(text, len = 4) {
  let str = String(text).slice(0, len);
  while (str.length < len) str += "　";
  return str;
}

function formatPrecip(intensity) {
  if (!intensity || intensity <= 0) return " 0.0mm";
  return `${intensity.toFixed(1).padStart(4, ' ')}mm`;
}

// ─────────────────────────────────────────────
// 逐小时深度预报（修复：从当前时刻起算）
// ─────────────────────────────────────────────

async function generateHourlyDeepReport(data, hours, env) {
  const nowEpoch = Math.floor(Date.now() / 1000);

  // 只保留当前时间之后的小时数据，再取 hours 条
  const hourly = (data.hourly?.data || [])
    .filter(h => h.time >= nowEpoch)
    .slice(0, hours);

  if (hourly.length === 0) {
    return `📅 未来 ${hours} 小时深度预报\n📍 ${data.name}\n\n⚠️ 暂无足够的逐小时数据（当前 API 套餐可能仅支持 48 小时内预报）`;
  }

  // 每 3 小时采样一次，避免信息过密
  const sampled = hourly.filter((_, i) => i % 3 === 0);

  const trends = data.isNativeZh
    ? sampled.map(h => h.summary.slice(0, 4))
    : await Promise.all(sampled.map(h => smartTranslate(h.summary, env, false, "trend")));

  const actualHours = hourly.length;
  const shortage = hours - actualHours;
  let report = `📅 未来 ${hours} 小时深度预报\n📍 ${data.name}\n`;
  if (shortage > 0) {
    report += `⚠️ 数据仅覆盖未来 ${actualHours} 小时（API 限制）\n`;
  }
  report += `----------------------------\n`;

  let lastDate = "";
  sampled.forEach((h, i) => {
    const date = new Date(h.time * 1000);
    const dateStr = date.toLocaleDateString('zh-CN', {
      timeZone: 'Asia/Shanghai', month: 'short', day: 'numeric'
    });
    const timeStr = date.toLocaleTimeString('zh-CN', {
      timeZone: 'Asia/Shanghai', hour: '2-digit', hour12: false
    });
    if (dateStr !== lastDate) {
      report += `\n📅 ${dateStr}\n`;
      lastDate = dateStr;
    }
    const rainTag = h.precipProbability > 0.1
      ? ` | 💧${h.precipIntensity.toFixed(1)}mm`
      : "";
    report += `  ${timeStr}:00 | ${alignText(trends[i])} | ${h.temperature.toFixed(0).padStart(2, ' ')}°C${rainTag}\n`;
  });

  report += `\n📊 数据来源: ${data.source}`;
  return report;
}

// ─────────────────────────────────────────────
// 标准天气报告（当天 + 明日 + 明日逐小时）
// ─────────────────────────────────────────────

async function generateFullReport(data, env) {
  const cur = data.currently;
  const tomorrow = data.daily?.data?.[1];

  const [curStatus, tomSummary] = await Promise.all([
    smartTranslate(cur.summary, env, data.isNativeZh),
    smartTranslate(tomorrow?.summary || "", env, data.isNativeZh)
  ]);

  const aqi = data.air?.current?.european_aqi ?? "--";
  const aqiText = aqi === "--" ? "--"
    : aqi <= 20 ? "优"
    : aqi <= 40 ? "良"
    : aqi <= 60 ? "轻污"
    : "重污";

  // 明日逐小时（06-22时，每隔2小时）
  const bjTomorrow = tomorrow
    ? new Date(tomorrow.time * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
    : null;

  let hourlyTrend = "";
  if (bjTomorrow) {
    const selectedHours = (data.hourly?.data || [])
      .filter(h => new Date(h.time * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }) === bjTomorrow)
      .filter((_, i) => i >= 6 && i <= 22 && i % 2 === 0);

    if (selectedHours.length > 0) {
      const trends = data.isNativeZh
        ? selectedHours.map(h => h.summary.slice(0, 4))
        : await Promise.all(selectedHours.map(h => smartTranslate(h.summary, env, false, "trend")));

      selectedHours.forEach((h, i) => {
        const time = new Date(h.time * 1000).toLocaleTimeString('zh-CN', {
          timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false
        });
        const rainTag = h.precipProbability > 0.1
          ? ` | 💧${formatPrecip(h.precipIntensity).trim()}`
          : "";
        hourlyTrend += `  ${time} | ${alignText(trends[i])} | ${h.temperature.toFixed(0).padStart(2, ' ')}°C${rainTag}\n`;
      });
    }
  }

  // 短时降水提示
  const shortTermRain = data.isNativeZh
    ? cur.summary
    : await smartTranslate(data.minutely?.summary || "无明显变化", env, false);

  const rainTrend = cur.precipProbability > 0.4 ? "⚠️ 建议带伞" : "🍀 暂无明显降水趋势";

  return `
📍 ${data.name} 天气实况
----------------------------
🌡 温度：${cur.temperature.toFixed(1)}°C（体感 ${cur.apparentTemperature.toFixed(1)}°C）
☁️ 状态：${curStatus} | 💧 湿度：${(cur.humidity * 100).toFixed(0)}%
💨 风速：${cur.windSpeed} m/s | 🍃 空气：${aqiText} (${aqi})

📅 明日预报（${tomorrow ? new Date(tomorrow.time * 1000).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) : "N/A"}）
----------------------------
🌡 范围：${tomorrow ? `${tomorrow.temperatureLow.toFixed(1)}°C ~ ${tomorrow.temperatureHigh.toFixed(1)}°C` : "N/A"}
📝 总结：${tomSummary}

⌛ 明日逐小时趋势（06-22时）
${hourlyTrend || "  (暂无数据)"}
⚠️ 降雨提醒
----------------------------
🕒 短时：${shortTermRain}
🔮 趋势：${rainTrend}

📊 数据来源: ${data.source}
  `.trim();
}

// ─────────────────────────────────────────────
// Telegram 消息处理
// ─────────────────────────────────────────────

async function handleTelegramMessage(message, env) {
  const text = message.text.trim();
  if (!text.startsWith("/weather")) return;

  const parts = text.split(/\s+/);
  let cityName = "温州市鹿城区";
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
    const maxHours = Math.min(hours ?? 0, 72); // 最多支持 72 小时
    const report = hours
      ? await generateHourlyDeepReport(data, maxHours, env)
      : await generateFullReport(data, env);
    await sendToTelegram(message.chat.id, report, env);
  } catch (e) {
    await sendToTelegram(message.chat.id, `❌ 查询失败: ${e.message}`, env);
  }
}

// ─────────────────────────────────────────────
// 定时降雨推送
// ─────────────────────────────────────────────

async function checkRainPush(loc, env) {
  try {
    const data = await getAllData(loc.lat, loc.lon, loc.name, env);
    const nowEpoch = Math.floor(Date.now() / 1000);

    // 未来 12 小时内概率最高的降雨点
    const target = (data.hourly?.data || [])
      .filter(h => h.time >= nowEpoch)
      .slice(0, 12)
      .find(h => h.precipProbability > 0.45);

    if (target) {
      const timeStr = new Date(target.time * 1000).toLocaleTimeString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      const msg = `🌧️ 预警：预计 ${timeStr} 左右有雨\n(来自 ${data.source})`;
      const kvKey = `push_${loc.name}_${target.time}`;

      if (!(await env.WEATHER_KV.get(kvKey))) {
        await sendToTelegram(env.TG_CHAT_ID, `📍 ${loc.name}\n${msg}`, env);
        await env.WEATHER_KV.put(kvKey, "true", { expirationTtl: 10800 });
      }
    }
  } catch (e) {
    console.log("Push Error:", e.message);
  }
}

// ─────────────────────────────────────────────
// Telegram 发送
// ─────────────────────────────────────────────

async function sendToTelegram(chatId, text, env) {
  await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text })
  });
}
