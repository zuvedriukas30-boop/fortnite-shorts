/**
 * Tikrina, ar Telegrame laukia komanda /dar. Jei taip — praneša workflow'ui,
 * kad reikia paleisti naują paiešką. Paleidžiama kas kelias minutes.
 *
 * Būsenos niekur nesaugom: getUpdates su offset priverčia Telegram ištrinti
 * jau perskaitytas žinutes, tad kitą kartą jos nebeateis.
 */
import { appendFileSync } from "node:fs";

const COMMAND = /^\/dar\b/i;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Trūksta aplinkos kintamojo ${name}`);
  return value;
}

const TOKEN = env("TELEGRAM_BOT_TOKEN");
const CHAT_ID = env("TELEGRAM_CHAT_ID");

async function api(method: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`https://api.telegram.org/bot${TOKEN}/${method}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Telegram ${method} klaida: ${res.status} ${await res.text()}`);
  return res.json();
}

/** GitHub Actions žingsniai susikalba per šį failą; lokaliai jo tiesiog nėra. */
function report(run: boolean): void {
  console.log(run ? "Gauta komanda /dar — paleidžiam paiešką" : "Naujų komandų nėra");
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `run=${run}\n`);
  }
}

async function main(): Promise<void> {
  const updates: any[] = (await api("getUpdates", { timeout: "0" })).result ?? [];
  if (updates.length === 0) {
    report(false);
    return;
  }

  const mine = updates.filter((u) => String(u.message?.chat?.id) === CHAT_ID);
  const asked = mine.some((u) => COMMAND.test((u.message?.text ?? "").trim()));

  // Patvirtinam visas žinutes, kad kitą kartą jos nebesikartotų.
  const lastId = Math.max(...updates.map((u) => u.update_id));
  await api("getUpdates", { offset: String(lastId + 1), timeout: "0" });

  if (asked) {
    await api("sendMessage", {
      chat_id: CHAT_ID,
      text: "🔍 Ieškau kitų — palauk apie minutę.",
    });
  } else if (mine.length > 0) {
    await api("sendMessage", {
      chat_id: CHAT_ID,
      text: "Žinau tik vieną komandą: /dar — atsiųsiu 3 kitus video.",
    });
  }

  report(asked);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
