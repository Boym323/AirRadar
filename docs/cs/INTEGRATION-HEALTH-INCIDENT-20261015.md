# Integration Health: rozdíl mezi monitoringem a připraveností služby

Datum: 15. 10. 2026. Produkční zjištění:
[Integration Health #38764470285](https://github.com/Boym323/AirRadar/actions/runs/38764470285),
commit `3c730c76` po sloučení PR #912.

## Ověřená zjištění (bez nových dotazů na poskytovatele)

Nově zavedený audit pouze pro čtení úspěšně dokončil sběr dat
a uložil omezené soukromé výstupy JSON a Markdown. Kód 2 vrátil
**kvůli vyhodnocení stavu služby jako DEGRADED**, nikoli kvůli pádu
skriptu, chybně formátovanému JSON, neúspěšnému uploadu nebo výpadku
lokálního přijímače readsb. GitHub Actions proto zobrazil červené
**workflow**, ačkoli pozorovací kontrola proběhla správně.

Konkrétní důkazy ze sanitizovaného logu:

- Lokální readsb = VERIFIED HEALTHY; PostgreSQL přes /api/health
  = VERIFIED HEALTHY.
- ADSB.lol routeset = BLOCKED. Trvalý ochranný cooldown platí
  do `2026-10-15T20:37:09.101Z` (22:37 pražského času).
  **Žádné nové dotazy na poskytovatele se neodesílaly.**
- Route Cache: 108 obejití limitu souběhu od startu procesu;
  24 hodnot `dbError` a 2 085 `dbBypassed` za posledních 24 hodin.
  Kumulativní čítače neprokazují aktuální výpadek PostgreSQL.
  Poslední hodina obsahovala 60 kontrol dostupnosti DB bez chyby.
  Latence SQL v Route Cache P95 činila 29,5 ms z 626 vzorků.
  Jde o čas viděný aplikací, **nikoliv samostatně naměřenou dobu SQL
  na serveru PostgreSQL**.
- Monitoring zaznamenal maximum zpoždění event loopu 5,43 s,
  i když P99 činilo přibližně 60,5 ms. Příčina není určena.

## Oprava významu výsledku CI

Přepínač `integration-audit.mjs --degraded-policy warn` představuje
**výslovný režim pro pozorovací workflow**. Výstup při stavu DEGRADED
nadále obsahuje všechny závažné stavy, sanitizované čítače a důkazy
v soukromém artefaktu GitHub Actions. Skript vypíše jednoznačné
pevně formulované varování `::warning`, ale vrátí kód 0, pokud
sběr a zápis reportu proběhl správně.

**Výchozí chování zůstává přísné:** bez přepínače nebo s volbou
`--degraded-policy fail` vrací stav DEGRADED kód 2, vhodný
pro ruční předprodukční kontrolu. Chyby při čtení či zápisu,
nebezpečné cesty, poškozené vstupní soubory a překročení limitů
stále vedou k nenulovému kódu i v režimu warn. Klasifikace skutečných
problémů se nijak nemění.

Oprava mění pouze vztah mezi výsledkem monitoringu a návratovým kódem.
**Nesmí se chápat jako odstranění blokace poskytovatele nebo Route Cache.**
Nemění `ADSBLOL_ROUTE_ENABLED`, oprávnění API, ochranné intervaly,
dotazy POST, limity současných operací ani produkční proces.

## Externí omezení: ADSB.lol routeset

Dokumentace ADSB.lol na https://api.adsb.lol/docs žádá před produkčním
využitím o kontaktování provozovatele. Je třeba ověřit povolení
pro `POST /api/0/routeset`, případnou autorizaci a očekávané
chování HTTP 403. Hlavička User-Agent není důkazem autorizace ani
samostatně potvrzenou příčinou HTTP 403.

Bez souhlasu provozovatele neobcházet odmítnutí, nevynucovat nové
požadavky a neresetovat šestihodinový cooldown.
Pokud produkční přístup není schválen, lze samostatně a řízeně
posoudit vypnutí této **volitelné** funkce. Tento PR
žádné takové nastavení nemění.

## Další diagnostika Route Cache

Pro 108 historických obejití souběžnosti postupovat podle
`docs/ROUTE-CACHE-V5-DIAGNOSTICS.md`:
porovnávat přírůstky čítačů **v rámci jednoho stabilního procesu**,
odezvy timeoutu a stav přijímání operací ve stejných minutových
oknech jako zpoždění event loopu. Přítomnost bezpečnostního limitu
není důvodem ke zvýšení souběžnosti bez důkazů. Bez dalšího ověření
neprovádět změny indexů, DDL ani dodatečné aktivní sondování
databáze nebo poskytovatele.

## Regresní testy

`tests/integration-audit.test.mjs` ověřuje přísný výchozí návratový
kód 2 při DEGRADED, varovný návratový kód 0 a viditelné hlášení
v pozorovacím režimu, zachování stavů BLOCKED/DEGRADED v
privátních souborech JSON a Markdown s právy `0600`,
a nenulový kód pro poškozený či chybějící vstup také v režimu warn.

Před sloučením vyžadovat úplný Vitest, typecheck, statické kontroly,
produkční build, výkonnostní regresní testy a CodeQL pro stejný commit.
Zelené pozorovací CI samo o sobě **neprokazuje** vyřešení problému
u externího poskytovatele ani v Route Cache.
