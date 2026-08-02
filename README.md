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

## Komanda /dar

Telegrame parašius `/dar`, atsiunčiami 3 kiti video (tie, kurie jau buvo, nebekartojami).

Veikia per `.github/workflows/listen.yml` — kas 5 min. patikrinama, ar laukia komanda.
Todėl atsakymas ateina ne akimirksniu, o per kelias minutes.

## Automatinis paleidimas

- `.github/workflows/daily.yml` — kasdienis sąrašas
- `.github/workflows/listen.yml` — `/dar` komandos klausymas

Reikia trijų GitHub Secrets: `YOUTUBE_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
Repo turi būti viešas — privačiam neužtenka nemokamų GitHub Actions minučių dažnam tikrinimui.
