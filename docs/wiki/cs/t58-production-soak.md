# T58 — read-only měření výkonu produkce

T58 je **ručně spouštěné 60minutové** diagnostické měření AirRadaru.
Vzniklo v [PR #889](https://github.com/Boym323/AirRadar/pull/889)
po optimalizaci Operational Twinu v
[PR #885](https://github.com/Boym323/AirRadar/pull/885).
Sleduje existující produkční provoz; nic nenasazuje, nerestartuje, nemění
příznaky funkcí, negeneruje provoz ani nezapisuje do databáze.

## Spuštění jedním příkazem

Z libovolného počítače s nainstalovaným [GitHub CLI](https://cli.github.com/)
a přihlášeným účtem s přístupem k repozitáři:

```bash
gh workflow run t58-production-soak.yml --repo Boym323/AirRadar --ref main
```

Případně z aktuálního checkoutu repozitáře:

```bash
bash scripts/run-t58.sh
```

Nebo otevřete **Actions → T58 Production Soak → Run workflow → main**.
Měření trvá hodinu, sbírá vzorky každých 60 sekund a používá desetiminutový
warmup. Současně může běžet jen jedno T58; nové spuštění nezruší probíhající.

## Předpoklady a bezpečnost

- [Workflow T58](../../../.github/workflows/t58-production-soak.yml)
  musí být v `main` a GitHub runner se musí připojit k
  `https://airradar.pomykal.cz` přes HTTPS.
- Nasazený commit musí obsahovat sloučené PR #885; preflight ověří verzi
  služby a uzamkne její commit pro celý průběh měření.
- Diagnostika Operational Twinu musí **už být** zapnutá proměnnou
  `AIRRADAR_OPERATIONAL_TWIN_FORENSICS_ENABLED=true`. T58 ji **nezapíná**
  a nerestartuje produkci; při nedostupnosti bezpečně skončí chybou.
- Pokud jsou administrativní diagnostiky chráněné, vložte token do
  repozitářového GitHub **Actions secretu** `T58_WATCHLIST_ADMIN_TOKEN`.
  Nedávejte jej do příkazu, issue, commitu, parametru workflow ani reportu.
  Při výslovně vypnuté autentizaci není secret potřeba.

## Měření a referenční T57

Stávající sběrač `scripts/t57-production-soak.mjs` a jeho analyzátor
čtou stejné provozní metriky jako při T57. Porovnání vychází z
dokončeného měření T57 `1.0.454 / ca25f52b`:

| Ukazatel | Referenční T57 |
| --- | ---: |
| Úplnost měření | 61/61 platných vzorků; 60 minut |
| CPU procesu P50 / P95 | 41,782 % / 59,258 % |
| Event-loop P99, P95 minutových oken | 396,624 ms |
| Nejdelší blokace event loopu | 5 662,310 ms |
| Event Outcome CPU | 439 837,391 ms / 842 volání |
| Úspěšnost ATC truth cache | 36,5 % |
| RSS P50 | 939,445 MiB |
| Lokální letadla / čekající predikce P50 | 78 / 15 |

T58 navíc zachycuje dostupné údaje o paměti/GC, počtu letadel a predikcí,
ATC cache a CPU Event Outcome na jedno volání. Jde o **pozorovací
porovnání před a po nasazení**: zatížení a stav cache se mohou lišit.
Verdikt `PASS_WITH_LIMITATIONS` znamená dostatek podkladů,
**nikoliv** potvrzené zrychlení nebo odstranění všech historických blokací.

## Výsledky a trvalá historie na GitHubu

- Průběh sledujte v [GitHub Actions](https://github.com/Boym323/AirRadar/actions/workflows/t58-production-soak.yml).
- Dokončený analyzovaný běh vytvoří artefakt `soak.summary.json`,
  `soak.summary.md` a `comparison.md` s uchováním **90 dnů**.
  Syrový soubor `soak.ndjson` neodesílejte.
- Anonymizované reporty se přidají do `reports/t58/YYYY/MM/DD/` ve větvi
  [`audit/t58-history`](https://github.com/Boym323/AirRadar/tree/audit/t58-history/reports/t58).
  Každé měření dostane samostatnou složku a záznam v `INDEX.md`.
  Větev vznikne při prvním reportu; **nemění `main`** a nespouští
  další nasazení. Archivační úloha má právo zápisu do Gitu, ale nemá
  administrátorský token pro diagnostiku.
- Syrové API odpovědi, souřadnice letadel, jejich identita, tajné údaje
  ani syrový NDJSON deník se nezveřejňují. Pokud archivaci blokují
  oprávnění repozitáře, artefakt běhu zůstane dostupný a archivační úloha
  viditelně selže.

## Řešení problémů

- **Preflight odmítne spuštění:** prověřte přístup runneru k produkci,
  nasazený commit, administrátorské přihlášení a povolenou diagnostiku
  Operational Twinu. Nerestartujte produkci pouze kvůli měření.
- **Chybí dokončený report:** zkontrolujte sběr a preflight;
  změna procesu/commitu, nedostupné vzorky nebo chybějící data
  mohou způsobit `INSUFFICIENT_EVIDENCE`.
- **Selže archivace:** prověřte práva zápisu GitHub Actions
  a ochranu větve `audit/t58-history`. Artefakt běhu je uložen
  odděleně; neposílejte reporty do `main`.

Podrobnosti obsahuje [český návod T58](../../cs/T58-PRODUCTION-SOAK.md)
a [postup vydání](../../cs/RELEASE.md).
