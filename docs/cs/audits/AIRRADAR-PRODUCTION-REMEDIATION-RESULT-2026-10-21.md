# AirRadar — výsledek nápravných prací pro produkci

**Rozhodnutí: NO-GO pro produkční nasazení.** Práce proběhla v odděleném vývojovém checkoutu `/tmp/airradar-remediation`, založeném na `main` revize `82de3fa798a7da3934a51d95b047e17c6ae7c6b7`. Automatické nasazení nebylo spuštěno. Produkce zůstává na verzi `1.0.545`, revizi `ede0ec1a11a27778546006722d0e736c958bb979` (stav zjištěn 2026-10-21); produkční soubory, konfigurace, databáze ani služba nebyly změněny.

## Blokátory nasazení

1. Požadovaný výchozí běh T58 [39633253019](https://github.com/Boym323/AirRadar/actions/runs/39633253019) selhal v preflight úloze `119336768265`. Nebyl pořízen žádný vzorek T58, takže neexistuje platné srovnání výkonu produkce před a po změnách. Workflow ve výpisu nezveřejňuje, které pole preflightu selhalo. Existence tajemství T58 sama o sobě úspěšný preflight nedokazuje.
2. Audit mapování Prisma nalezl 31 modelů a jedno explicitní mapování, ale nebyl dostupný produkční katalog pouze pro čtení (`catalogProvided=false`, `compatibilityVerified=false`). Vývojový checkout nemá `DATABASE_URL`; produkční tajemství nebyla čtena. Kompatibilita schématu a připravenost návratu proto zůstávají neprokázané.
3. Výchozí audit revidovaného výběru uvádí 79 KEEP a 99 REMOVE, ale statický audit uvádí, že přesná původní sémantika není doložena u 82 ID; oddělený počet `originalPerIdMappingMissing` činí 80. Statické kotvy nedokazují funkčnost každého scénáře. Viz [matice funkcí](../../audits/AIRRADAR-PRODUCTION-REMEDIATION-FEATURE-MATRIX-2026-10-21.json).

Jde o povinné bezpečnostní brány zadání. Push do `main` může spustit automatické nasazení, proto nebyl proveden push na main ani release. Před prací byly pouze čtením ověřeny verze, health, systémová diagnostika a veřejná stránka; health endpoint hlásil stav `ok`, dostupnou databázi a cestu readsb. Produkční konfigurace nebyla měněna kvůli úspěchu diagnostiky.

## Provedené opravy

- **Odesílání upozornění:** přidáno explicitní směrování podporovaných kanálů; neznámý kanál skončí chybou, ne stavem SENT. Odpověď Pushover 2xx se počítá jako přijetí jen tehdy, když JSON poskytovatele uvádí `status: 1`. Přidány testy neznámého kanálu, chybných či záporných úspěšných odpovědí, 429/503, timeoutu a změn stavu workeru. Stávající databázová cesta claim s advisory lockem a obnova zastaralého claimu byly zkontrolovány, ale kandidát nemá samostatné end-to-end regresní testy souběžných workerů, obnovy zastaralého claimu ani restartu. Před pushem vedoucím k nasazení je nutné tyto testy doplnit; negarantujeme doručení bez duplicit nad rámec stávajícího chování repozitáře.
- **Přístup administrátora:** šest privilegovaných GET rout `/api/admin` nyní vyžaduje striktní administrační relaci i při vypnuté starší volitelné autentizaci. Sanitizované veřejné systémové statusy a SSE zůstávají veřejné. Doplněny regresní testy rout a autentizace.
- **Web Push:** serializované zápisy v procesu, unikátní dočasné soubory vytvořené exkluzivně s omezenými právy, atomická náhrada a úklid; doplněna omezení těla požadavku a validace odběru. Diagnostika nyní uvádí nakonfigurované doručování jako nedostupné, pokud chybí producent událostí; delivery health přejde do degraded. Chybějící producent zůstává funkčním omezením; odstraněný alert engine nebyl obnoven.
- **System status SSE:** společná pollovací služba rozlišuje veřejnou a plnou administrační projekci, zachovává sdílené dotazování a zařadí plné obnovení, pokud se administrátor připojí během veřejného dotazu. Dotazování databáze pro každého klienta nepřibylo.
- **Delivery health:** počty stavů a opakovaných pokusů, počty pokusů, časy a poslední chyba se agregují v databázi místo načítání všech řádků do Node. Velký syntetický fixture porovnává agregaci s předchozí projekcí; produkční latence a paměť změřeny nebyly.
- **Historie Navigation Integrity:** časové hranice databázového dotazu se aplikují před omezením počtu záznamů a řazení je stabilní. API nově vrací metadata zdroje, úplnosti a zkrácení; paměťový fallback je výslovně označen jako neúplný.
- **Drobný úklid:** odstraněn nepoužívaný import `useEffect`, nepoužívaná funkce `diagnosticOptionalNumber` a tři nepoužívané testovací importy/konstanty. Produkční soubory se nemažou; důkazy dosažitelnosti nestačily k bezpečnému odstranění větších modulů, CSS, závislostí ani některého z 36 ručně posuzovaných kandidátů. Závislosti ani schéma databáze se neměnily.

## Ověření

V tomto izolovaném checkoutu již prošly: `npm ci`; audit produkčních závislostí (`npm audit --omit=dev --audit-level=high`, bez nalezených zranitelností); `npm run prisma:generate`; kontrola migrací Prisma; `npm run typecheck`; `npm run lint` (bez chyb, čtyři existující varování); `npm run features:check` (9 stránek, 52 API); `npm run docs:check`; `npm run visual:check`; `npm run icons:audit`; statický audit revidovaného výběru funkcí; cílené regresní testy (30 prošlo); `npm run test:production:all` (27 vizuálních cílů, 14 velikostí); produkční build v izolovaném checkoutu. Kompletní `npm run test:full` prošel: 292 testovacích souborů prošlo, 5 bylo přeskočeno; prošlo 1 919 testů, 15 bylo přeskočeno. Syntetické škálování finálního stromu proběhlo při 1×/2×/4× (100/200/400 letadel; 5/10/20 SSE klientů): P95 snapshotu 5,282/2,304/5,607 ms a CPU SSE 0,195/0,385/0,812 ms. Jde o jediná lokální měření s nemonotónním výsledkem snapshotu, nikoli o produkční důkaz nebo tvrzení o zrychlení. Výkon T58 v produkci nebyl změřen.

Synchronizace MapLibre při buildu lokálně přepsala generované `next-env.d.ts` a veřejné worker assety. Tyto generované změny se nemají zahrnout do zdrojové změny a před commitem se mají vrátit. Zůstávají čtyři existující varování Turbopacku kvůli dynamickému přístupu k souborům.

## Rozsah a zachování funkcí

Výběrové soubory pro 79 KEEP / 99 REMOVE nebyly změněny a žádná KEEP funkce nebyla záměrně odstraněna. Chování každé KEEP funkce nebylo úplně ověřeno, proto matice konzervativně uvádí `PARTIAL`. Před změnami činil kontrolovaný rozsah 86 598 produkčních řádků a 28 000 testovacích řádků; při posledním měření to bylo 86 749 a 28 028. Nárůst LOC je důsledkem regresních testů a metadat, nejde o tvrzení o optimalizaci. Zlepšení výkonu T58 se netvrdí.

## Stav produkce a další brána

Produkce zůstává na výchozí verzi `1.0.545` / revizi `ede0ec1a11a27778546006722d0e736c958bb979`; kontrola po změně není možná, protože nasazení bylo správně zastaveno. Před pushem, který může nasadit změnu, je nutné obnovit autentizovaný T58 preflight a získat reprezentativní vzorky, ověřit read-only kompatibilitu produkčního katalogu a připravený návrat, dokončit ověření chování KEEP, zopakovat všechny brány nad konečným kandidátem, prohlédnout celý diff a klasifikovat jej přes `scripts/release-scope.mjs`. Poté postupovat podle `docs/RELEASE.md` a vyčkat na kontroly přesné odeslané revize.

**Git:** nápravné změny jsou připraveny pouze v izolovaném checkoutu a nebyly odeslány na `main`. Tato zpráva není souhlasem s nasazením.
