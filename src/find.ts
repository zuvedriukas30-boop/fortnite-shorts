/**
 * Suranda 3 populiariausius per pastarąją parą pasirodžiusius Fortnite Shorts
 * ir atsiunčia jų nuorodas į Telegram. Paleidžiama kasdien per GitHub Actions.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const CONFIG_PATH = join(ROOT, "config.json");
const SEEN_PATH = join(ROOT, "seen.json");
const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";

type Config = {
  queries: string[];
  lookbackHours: number;
  maxResultsPerQuery: number;
  maxDurationSeconds: number;
  topN: number;
  seenRetentionDays: number;
  sortBy: "viewsPerHour" | "viewCount";
  language: string | null;
  shortsCheck: { batchSize: number; delayMs: number };
};

type SeenEntry = { id: string; date: string };

type Video = {
  id: string;
  title: string;
  channel: string;
  views: number;
  seconds: number;
  license: string;
  language: string | null;
  viewsPerHour: number;
};

const config: Config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Trūksta aplinkos kintamojo ${name}`);
  return value;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// --- Telegram ---------------------------------------------------------------

/** Siunčiam grynu tekstu — taip pavadinimuose esantys simboliai nieko nesugadina. */
async function telegram(text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: env("TELEGRAM_CHAT_ID"), text }),
  });
  if (!res.ok) {
    throw new Error(`Telegram atmetė žinutę: ${res.status} ${await res.text()}`);
  }
}

// --- YouTube Data API -------------------------------------------------------

async function youtube(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${YOUTUBE_API}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("key", env("YOUTUBE_API_KEY"));

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 403 && body.includes("quotaExceeded")) {
      throw new Error(
        "Išnaudota YouTube API dienos kvota (10 000 vienetų). Kvota atsinaujina apie 10:00 Vilniaus laiku — šiandien sąrašo nebus.",
      );
    }
    throw new Error(`YouTube API klaida (${path}): ${res.status} ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function searchIds(query: string, publishedAfter: string): Promise<string[]> {
  const params: Record<string, string> = {
    part: "snippet",
    type: "video",
    videoDuration: "short",
    order: "viewCount",
    publishedAfter,
    maxResults: String(config.maxResultsPerQuery),
    q: query,
  };
  if (config.language) params.relevanceLanguage = config.language;

  const data = await youtube("search", params);
  return (data.items ?? []).map((item: any) => item?.id?.videoId).filter(Boolean);
}

/** ISO 8601 trukmė („PT1M47S") į sekundes. Transliacijos grąžina „P0D" — jas atmetam. */
function parseDuration(iso: string): number {
  if (!iso.includes("T")) return Number.POSITIVE_INFINITY;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return Number.POSITIVE_INFINITY;
  const [, h, m, s] = match;
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
}

async function fetchDetails(ids: string[]): Promise<Video[]> {
  const videos: Video[] = [];
  for (const batch of chunks(ids, 50)) {
    const data = await youtube("videos", {
      part: "snippet,statistics,contentDetails,status",
      id: batch.join(","),
    });
    for (const item of data.items ?? []) {
      const views = Number(item.statistics?.viewCount ?? 0);
      const published = new Date(item.snippet?.publishedAt ?? 0).getTime();
      const hours = Math.max((Date.now() - published) / 3_600_000, 1);
      videos.push({
        id: item.id,
        title: item.snippet?.title ?? "(be pavadinimo)",
        channel: item.snippet?.channelTitle ?? "(nežinomas kanalas)",
        views,
        seconds: parseDuration(item.contentDetails?.duration ?? ""),
        license: item.status?.license ?? "youtube",
        language: item.snippet?.defaultAudioLanguage ?? item.snippet?.defaultLanguage ?? null,
        viewsPerHour: views / hours,
      });
    }
  }
  return videos;
}

// --- Shorts patikra ---------------------------------------------------------

/**
 * Tikras Short atsako 200; įprastas video permeta į /watch.
 *
 * SOCS slapukas būtinas: be jo YouTube iš ES visus be išimties permeta į
 * consent.youtube.com ir atskirti Short nuo ne Short nebeįmanoma.
 * Jei atsakymas vis tiek netikėtas ar tinklas neveikia — nesprendžiam ir video
 * paliekam, kad dėl vienos strigusios užklausos negautume tuščio sąrašo.
 */
async function isShort(id: string): Promise<boolean> {
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${id}`, {
      method: "HEAD",
      redirect: "manual",
      headers: { cookie: "SOCS=CAI", "accept-language": "en-US,en;q=0.9" },
    });
    if (res.status === 200) return true;
    return !(res.headers.get("location") ?? "").includes("/watch");
  } catch {
    return true;
  }
}

async function filterShorts(videos: Video[]): Promise<Video[]> {
  const kept: Video[] = [];
  for (const batch of chunks(videos, config.shortsCheck.batchSize)) {
    const flags = await Promise.all(batch.map((video) => isShort(video.id)));
    batch.forEach((video, i) => {
      if (flags[i]) kept.push(video);
    });
    await sleep(config.shortsCheck.delayMs);
  }
  return kept;
}

// --- seen.json --------------------------------------------------------------

function loadSeen(): SeenEntry[] {
  try {
    const raw = JSON.parse(readFileSync(SEEN_PATH, "utf8"));
    return Array.isArray(raw) ? raw.filter((e) => e && typeof e.id === "string") : [];
  } catch {
    return [];
  }
}

function saveSeen(previous: SeenEntry[], picked: Video[], today: string): void {
  const cutoff = Date.now() - config.seenRetentionDays * 86_400_000;
  const recent = previous.filter((entry) => new Date(entry.date).getTime() >= cutoff);
  const merged = [...recent, ...picked.map((video) => ({ id: video.id, date: today }))];
  writeFileSync(SEEN_PATH, `${JSON.stringify(merged, null, 2)}\n`);
}

// --- Žinutės formatavimas ---------------------------------------------------

function compact(n: number): string {
  if (n >= 1_000_000) return `${round(n / 1_000_000)}M`;
  if (n >= 1_000) return `${round(n / 1_000)}k`;
  return String(Math.round(n));
}

function round(n: number): string {
  return n >= 100 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, "");
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Autorius kalbos lauko užpildyti neprivalo, todėl atmetam tik tada, kai jis
 * užpildytas ir nurodo kitą kalbą. Tuščias laukas nieko nesako — paliekam.
 */
function languageAllowed(video: Video): boolean {
  if (!config.language) return true;
  if (!video.language) return true;
  return video.language.toLowerCase().startsWith(config.language.toLowerCase());
}

function licenseLabel(license: string): string {
  return license === "creativeCommon" ? "CC (galima remiksuoti)" : "standartinė";
}

function buildMessage(videos: Video[], today: string, note?: string): string {
  const lines = [`🎮 Top ${videos.length} Fortnite Shorts — ${today}`, ""];
  videos.forEach((video, i) => {
    lines.push(`${i + 1}. ${video.title}`);
    lines.push(
      `   ${video.channel} · ${compact(video.views)} peržiūrų · ${compact(video.viewsPerHour)}/val · ${clock(video.seconds)}`,
    );
    lines.push(`   Licencija: ${licenseLabel(video.license)}`);
    lines.push(`   https://youtube.com/shorts/${video.id}`);
    lines.push("");
  });
  if (note) lines.push(note);
  return lines.join("\n").trim();
}

// --- Eiga -------------------------------------------------------------------

async function main(): Promise<void> {
  // en-CA duoda YYYY-MM-DD; laiko juosta — Vilnius, nes tokia ir cron'o prasmė.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Vilnius",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const publishedAfter = new Date(Date.now() - config.lookbackHours * 3_600_000).toISOString();

  const ids = new Set<string>();
  for (const query of config.queries) {
    for (const id of await searchIds(query, publishedAfter)) ids.add(id);
  }
  console.log(`Paieška grąžino ${ids.size} unikalių video`);

  const seen = loadSeen();
  const seenIds = new Set(seen.map((entry) => entry.id));

  let videos = await fetchDetails([...ids]);
  videos = videos.filter((v) => v.seconds > 0 && v.seconds <= config.maxDurationSeconds);
  videos = videos.filter((v) => !seenIds.has(v.id));
  console.log(`Po trukmės ir seen.json filtrų liko ${videos.length}`);

  videos = videos.filter(languageAllowed);
  console.log(`Po kalbos filtro (${config.language ?? "be filtro"}) liko ${videos.length}`);

  videos = await filterShorts(videos);
  console.log(`Po Shorts patikros liko ${videos.length}`);

  const score = config.sortBy === "viewCount" ? (v: Video) => v.views : (v: Video) => v.viewsPerHour;
  videos.sort((a, b) => score(b) - score(a));
  const picked = videos.slice(0, config.topN);

  if (picked.length === 0) {
    await telegram(
      `🎮 Fortnite Shorts — ${today}\n\nŠiandien nė vienas video nepraėjo filtrų. Galimos priežastys: per mažai naujų Shorts per pastarąsias ${config.lookbackHours} val., arba visi rasti jau buvo siųsti anksčiau (seen.json).`,
    );
    return;
  }

  const note =
    picked.length < config.topN
      ? `⚠️ Rasti tik ${picked.length} iš ${config.topN} — po filtrų daugiau tinkamų video neliko.`
      : undefined;

  await telegram(buildMessage(picked, today, note));
  saveSeen(seen, picked, today);
  console.log(`Išsiųsta ${picked.length} nuorod(os).`);
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  try {
    await telegram(`❌ Fortnite Shorts skriptas nesuveikė:\n\n${message}`);
  } catch (telegramError) {
    console.error("Nepavyko pranešti net per Telegram:", telegramError);
  }
  process.exit(1);
});
