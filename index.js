export default {
  async scheduled(event, env, ctx) {
    const TOKEN = env.CAIYUN_TOKEN;
    const LOCATION = "120.65,28.01";
    const TG_TOKEN = env.TG_BOT_TOKEN;
    const TG_CHAT_ID = env.TG_CHAT_ID;

    // 获取未来几小时的预报
    const url = `https://api.caiyunapp.com/v2.6/${TOKEN}/${LOCATION}/hourly?hourlysteps=5`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === "ok") {
      // 索引 2 代表 2 小时后
      const targetHour = data.result.hourly.precipitation[2];
      const pcpValue = targetHour.value;

      if (pcpValue > 0.05) {
        const message = `☔️ 温州鹿城预警：预计 2 小时后有雨 (强度: ${pcpValue} mm/h)，记得收衣服拿伞！`;
        await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: TG_CHAT_ID, text: message })
        });
      }
    }
  },
};
