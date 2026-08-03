/**
 * Cloudflare Worker — patikimas paleidiklis.
 *
 * Nieko neieško ir nieko nesiunčia pats: tik priima Telegram komandą arba
 * tikslų laikrodžio signalą ir pastumia GitHub Actions, kur guli visa logika.
 *
 * fetch()     — Telegram webhook, komanda /dar
 * scheduled() — kasdienis signalas 07:00 Vilniaus laiku
 */

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("ok");

    // Worker adresas viešas, tad Telegram prisistato slaptažodžiu.
    if (request.headers.get("x-telegram-bot-api-secret-token") !== env.WEBHOOK_SECRET) {
      return new Response("forbidden", { status: 403 });
    }

    const message = (await request.json()).message;
    if (!message || String(message.chat?.id) !== env.TELEGRAM_CHAT_ID) {
      return new Response("ok");
    }

    if (/^\/dar\b/i.test((message.text ?? "").trim())) {
      await dispatch(env, "dar");
      await telegram(env, "🔍 Ieškau kitų — palauk apie minutę.");
    } else {
      await telegram(env, "Žinau tik vieną komandą: /dar — atsiųsiu 3 kitus video.");
    }
    return new Response("ok");
  },

  /**
   * Cron paleidžia 04:00 ir 05:00 UTC. Vasarą 07:00 Vilniuje atitinka pirmąjį,
   * žiemą antrąjį, tad tikrinam vietinę valandą ir dirbam tik tada, kai ji 7.
   */
  async scheduled(event, env, ctx) {
    const hour = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Vilnius",
      hour: "numeric",
      hour12: false,
    }).format(new Date(event.scheduledTime));

    if (Number(hour) !== 7) return;
    ctx.waitUntil(dispatch(env, "daily"));
  },
};

async function dispatch(env, type) {
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "user-agent": "fortnite-shorts-worker",
    },
    body: JSON.stringify({ event_type: type }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.log(`GitHub dispatch klaida ${res.status}: ${body}`);
    await telegram(env, `❌ Nepavyko paleisti paieškos (GitHub ${res.status})`);
  }
}

async function telegram(env, text) {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
  });
}
