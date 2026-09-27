# Recovery runbook

Tento runbook pokrývá aplikaci AirRadar, její PostgreSQL data a runtime stav
spravovaný systemd. Záměrně explicitně rozlišuje, co je známé z tohoto
checkoutu a co vyžaduje ověření infrastruktury.

## Inventář záloh

Zálohujte tyto nezávislé položky:

1. PostgreSQL databázi nakonfigurovanou přes `DATABASE_URL`, včetně všech
   tabulek `public` a migračních metadat používaných runtime Prisma kontraktem.
2. `/var/lib/airradar/alerts.json`, který obsahuje produkční watchlist a
   alert pravidla.
3. `/var/lib/airradar/alert-events.jsonl`, omezený append-only ledger alertů
   a notifikací. Je to užitečná provozní historie, nikoli zdroj pravdy o živých letadlech.
4. `/var/www/airradar/.env` nebo ekvivalentní záznam v secret manageru,
   včetně `DATABASE_URL`, `WATCHLIST_ADMIN_TOKEN`, nastavení přijímače,
   provider klíčů a notifikačních credentials. Považujte jej za tajný materiál;
   nevkládejte jej do Gitu ani browser proměnné.
5. Git repozitář aplikace, včetně přesného commitu/tagu,
   `prisma/contract.prisma` a všech verzovaných adresářů pod
   `migrations/app/`. `.next/` a `generated/` jsou znovuvytvořitelné artefakty.

Service unit je verzována v `deploy/airradar.service`; nainstalovanou unit
uchovejte jako důkaz nasazení, ale obnovujte ji z vybraného Git checkoutu,
nikoli jako primární zálohu aplikace.

## Pořadí obnovy

Obnovujte v tomto pořadí, aby kód a data zůstaly kompatibilní:

1. Identifikujte incident, zaznamenejte aktuální Git commit a stav migrací a
   před změnou stavu uchovejte service/journal diagnostiku.
2. Obnovte PostgreSQL do izolované databáze nebo řízeného maintenance window.
   Produkční databázi neresetujte, znovu nevytvářejte ani destruktivně nemigrujte.
3. Obnovte checkout aplikace na vybraný known-good commit/tag.
4. Obnovte `/var/lib/airradar` s vlastníkem `airradar:airradar`, režimem
   `0750` pro adresář a restriktivními file modes (běžně `0600`). Před
   startem služby obnovte `alerts.json`; ledger obnovte, pokud je požadována
   jeho auditní historie.
5. Obnovte server-only `.env` ze secret backup a před zveřejněním watchlist
   mutací ověřte přítomnost `WATCHLIST_ADMIN_TOKEN`.
6. Nainstalujte závislosti přes `npm ci`, emitujte Prisma contract a ověřte
   verzovaný migrační chain. Aplikujte pouze forward migrace explicitně
   schválené pro obnovenou databázi; tento runbook sám žádnou produkční migraci
   neopravňuje.
7. Sestavte vybraný checkout, ověřte systemd unit a build/start lock a poté
   spusťte AirRadar pod systemd.
8. Ověřte local health, public health endpoint, SSE delivery, databázový stav,
   konfiguraci alertů a runtime diagnostiku system status.

## Obnova PostgreSQL

Databáze je trvalým zdrojem vzorkované historie, referenčních/katalogových dat
a denních statistik. Live radar state se znovu sestavuje z readsb a z
PostgreSQL se neobnovuje.

Použijte zdokumentovaný restore postup poskytovatele PostgreSQL pro vytvoření
konzistentní databáze a poté ji validujte se stejnými connection settings,
jaké používá AirRadar. Po výběru application checkoutu:

```bash
cd /var/www/airradar
npm run prisma:generate
npx prisma migration status
npm run prisma:verify
```

Pokud je obnovená databáze za vybraným kontraktem, projděte pending forward
migrace a běžný release/deployment postup spusťte až po schválení operátorem.
Nikdy nepoužívejte `prisma db push`, reset, migration squash ani ad-hoc
`DROP` jen proto, aby stav vypadal aktuálně.

## Runtime stav a konfigurace

Systemd unit poskytuje `StateDirectory=airradar`, což mapuje produkční state
adresář na `/var/lib/airradar`. Obnovte soubory atomicky ze zálohy, ponechte
adresář privátní a ověřte, že alert engine umí číst obnovená pravidla. Alert
ledger se fyzicky rotuje při 8 MiB a drží omezený recent tail; chybějící ledger
nebrání živému radaru.

Soubor `.env` je mimo Git a obsahuje credentials. Obnovujte jej přes
secret-management proces, ne kopírováním do shell transcriptu. Před startupem
ověřte receiver URL, database URL, `PUBLIC_RECEIVER_POSITION_MODE`, provider
flags, `WATCHLIST_ADMIN_TOKEN` a notification settings.

## Application checkout a migrace

Použijte známý Git commit nebo release tag, jehož source a migration contract
jsou kompatibilní s obnovenou databází. Release tag vzniká až po úspěchu všech
release gates; neotagovaný commit lze přesto obnovit podle úplného SHA.

Aktuální checkout obsahuje dvě forward aditivní migrace:
`20260909T0830_recap_query_indexes` přidává dva `Flight` indexy používané
recap a airport-traffic dotazy a `20260910T0535_airport_data_v2` přidává
tabulky airport infrastruktury spolu se souvisejícími poli a indexy katalogu
letišť. Tvoří migration chain a musí být zkontrolovány a aplikovány v pořadí
během explicitně autorizovaného deploymentu; tento runbook netvrdí, že je
některá z nich již aplikována do produkce nebo obnovené databáze. Code rollback
přes schema change není automaticky bezpečný: nejprve ověřte, že starší kód
rozumí již aplikovanému kontraktu. Indexy jsou běžně kompatibilní se starším
kódem, ale i to je nutné ověřit proti vybranému migration state.

## Validační checklist

Z vybraného checkoutu spusťte následující, přičemž production endpointy a
credentials řešte běžným operator procesem:

```bash
npm ci
npm run prisma:generate
npm run lint
npm run typecheck
npm test
# Build pouze v izolovaném/non-serving checkoutu. Nikdy nepřepisujte .next v
# live checkoutu; pro produkční deployment použijte deploy/release.sh.
npm run build
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:3000/api/system/status
```

Poté bez zveřejnění tajných payloadů ověřte:

- `/api/health` je `2xx` a hlásí očekávaný stav receiver/database;
- `/api/system/status` hlásí omezené RSS/heap, SSE count a cache counts;
- `/api/stream` doručí událost `snapshot` a při disconnectu se čistě uzavře;
- `/api/version` hlásí vybraný build commit a channel;
- watchlist `GET` funguje, zatímco mutace vyžaduje obnovenou admin session;
- public proxy zachovává SSE HTTP/1.1, no buffering a dlouhý read timeout
  zdokumentovaný v `deploy/README.md`.

## Omezení rollbacku

Rollback aplikace nevrací PostgreSQL zpět. Neobnovujte starší checkout nad
databázovým kontraktem, který neumí číst. Pokud už byla forward migrace
aplikována, preferujte nasazení kompatibilního kódu nebo novou forward migraci.
Database point-in-time recovery musí být samostatná explicitně schválená
incident action.

Live aircraft RAM, in-flight SSE spojení, provider cache a neuložená recent
pozorování se po restartu záměrně znovu vytvoří. Alert ledger je omezená
historie a po retenční rotaci může obsahovat méně starých událostí.

## RPO a RTO

Repozitář stanovuje datové třídy a pořadí obnovy, ale nedokazuje externí backup
schedule. Provozní cíle musí potvrdit vlastník infrastruktury:

- PostgreSQL: cílové RPO nejvýše 24 hodin a cílové RTO do 60 minut;
- `/var/lib/airradar`: cílové RPO nejvýše 24 hodin; pravidla se mají obnovit
  před startem služby;
- Git/source: přesné commit SHA je obnovitelné ze vzdáleného repozitáře;
- live RAM/SSE stav: žádné restore RPO; po startupu se znovu sestaví z readsb.

## Restore drill

Tento drill provádějte proti izolované PostgreSQL/databázi a service fixture,
nikdy proti produkci:

1. Zaznamenejte vybraný commit, contract hash, migration status a backup identifikátory.
2. Obnovte PostgreSQL a runtime state do izolované fixture.
3. Checkoutněte vybraný commit, nainstalujte závislosti, emitujte contract a
   spusťte migration verification.
4. Spusťte sestavenou službu s fixture readsb/demo providerem a obnoveným
   state adresářem.
5. Proveďte health, system-status, version, SSE lifecycle, alert-read a
   watchlist-auth kontroly.
6. Ověřte, že restart zrekonstruuje live state bez změny obnovených pravidel
   nebo úniku credentials.
7. Zaznamenejte uplynulý čas obnovy, pozorované okno ztráty dat, selhání a
   přesné backup/migration inputs. Tento runbook aktualizujte pouze na základě
   změřených důkazů.

## Stav externího ověření

**VYŽADUJE SE OVĚŘENÍ EXTERNÍ INFRASTRUKTURY**

Tento checkout neposkytuje důkaz o PBS/Proxmox snapshotech, harmonogramu
PostgreSQL záloh, off-host retenci, šifrování záloh ani úspěšné obnově z
externího backup hostu. Vlastník infrastruktury musí tyto položky ověřit a
dokončit izolovaný restore drill, než budou výše uvedené RPO/RTO cíle považovány
za závazné produkční cíle.
