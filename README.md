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
| `maxDurationSeconds` | ilgesni video atmetami |
| `topN` | kiek video siųsti |
| `seenRetentionDays` | kiek dienų video laikomas „jau matytu" |
| `sortBy` | `viewsPerHour` (greičiausiai augantys) arba `viewCount` (daugiausia peržiūrų) |
| `language` | `"en"` — angliška paieška ir ne angliškų video atmetimas; `null` išjungia |

## Automatinis paleidimas

`.github/workflows/daily.yml`. Reikia trijų GitHub Secrets: `YOUTUBE_API_KEY`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
