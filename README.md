# Top 3 Fortnite Shorts

Kasdien 07:00 (Europe/Vilnius) suranda 3 populiariausius per parą pasirodžiusius
Fortnite Shorts ir atsiunčia jų nuorodas į Telegram. Tie patys video nesikartoja —
paskutinių 30 dienų ID saugomi `seen.json`.

## Paleidimas lokaliai

```
npm install          # tik tipų tikrinimui, veikimui nebūtina
cp .env.example .env # ir įrašyk savo raktus
npm run find
```

Runtime priklausomybių nėra: Node 24 pats vykdo TypeScript ir pats skaito `.env`.

## Nustatymai

Viskas `config.json`:

| Laukas | Reikšmė |
|---|---|
| `queries` | paieškos frazės (kiekviena = 100 kvotos vienetų per dieną) |
| `lookbackHours` | kiek valandų atgal ieškom |
| `minAgeHours` | jaunesnių video neimam — jie dar nespėjo surinkti peržiūrų |
| `maxDurationSeconds` | ilgesni video atmetami |
| `topN` | kiek video siųsti |
| `seenRetentionDays` | kiek dienų video laikomas „jau matytu" |
| `sortBy` | `viewsPerHour` (greičiausiai augantys) arba `viewCount` (daugiausia peržiūrų) |
| `language` | `"en"` — angliška paieška ir ne angliškų video atmetimas; `null` išjungia |

## Kaip veikia

```
Cloudflare Worker  ──►  GitHub Actions  ──►  Telegram
   (paleidiklis)         (src/find.ts)
```

Cloudflare Worker (`worker/`) yra patikimas laikrodis ir Telegram webhook:

- **07:00 Vilniaus laiku** — pasiunčia GitHub'ui `daily` signalą
- **Parašius `/dar`** — pasiunčia `dar` signalą ir atsiunčia 3 kitus video

Nemokami GitHub tvarkaraščiai šiam darbui netiko: `*/5` cron realiai vykdomas
kartą per valandą, o kasdienis vėluodavo iki 3 val. Todėl laiką valdo Cloudflare,
o GitHub tik atlieka darbą.

## Paleidimas

- `.github/workflows/run.yml` — vienintelis workflow, reaguoja į abu signalus
- GitHub Secrets: `YOUTUBE_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- Worker secrets: `GITHUB_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `WEBHOOK_SECRET`
