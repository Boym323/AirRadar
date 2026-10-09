# Postup vydání

Toto je autoritativní postup vydání. Nespouštějte jej, pokud uživatel výslovně
nepožádá o produkční vydání. Tento dokumentační úkol jej nespustil.

## Běžný příkaz

Spusťte z kanonického produkčního checkoutu jako uživatel s požadovaným
passwordless sudo/systemd přístupem:

```bash
cd /var/www/airradar
sudo ./deploy/release.sh
```

Výchozí release kanál je stable. Release candidate používá stejné brány,
locky, migrační workflow, systemd nasazení, restart a health kontroly, ale
explicitně se volí pomocí:

```bash
sudo ./deploy/release.sh --channel rc
```

RC dostane tag `vMAJOR.MINOR.PATCH-rc.N` a hlásí kanál
`release-candidate`. RC tagy nespotřebovávají stabilní verzi: po
`v1.0.0-rc.1` a `v1.0.0-rc.2` zůstává prvním stabilním vydáním `v1.0.0`.
Neúspěšné RC nespotřebuje své číslo, protože tag se vytvoří až po úspěšném
nasazení a health kontrolách. Stabilní vydání zůstávají výchozí; stabilní
release se má provést až po dokončení validace RC.

Výchozí větev je `main`. Pro záměrné vydání jiné pojmenované větve je nutný
`--branch BRANCH`. `--allow-dirty` zachová aktuální dirty checkout,
přeskočí aktualizaci z originu a je určen jen pro výjimečné řízené použití.
`--offline` přeskočí stažení větve i tagů a vydá právě checkoutovaný commit bez
čtení z GitHubu:

```bash
sudo ./deploy/release.sh --branch release/local --offline
```

Skript nikdy nespouští `git push`; release commity a tagy zůstávají lokálně,
dokud je operátor výslovně nezveřejní.
`--dry-run` provede preflight, vypíše plán a vyřešeného kandidáta; neaktualizuje
Git, neinstaluje závislosti, nemigruje, nebuildí, nerestartuje ani neprovádí
health check. RC kandidáta bez mutací zkontrolujete pomocí:

```bash
sudo ./deploy/release.sh --channel rc --dry-run
```

## Průběžné nasazování

`.github/workflows/ci.yml` spouští úplnou validační bránu pro každý pull
request a push. Push do `main` automaticky spustí produkční smoke kontroly,
včetně desktopové/mobilní browser brány, a poté job `deploy` na self-hosted
Linux x64 runneru. Runner spouští:

```bash
sudo -n /var/www/airradar/deploy/release.sh --branch main --automated --commit COMMIT_SHA
```

Jde o rychlou produkční cestu nasazení: CI už provedlo lint, typecheck, úplnou
sadu Vitest a desktopovou/mobilní browser bránu, takže release skript tuto
duplicitní quality suite přeskakuje. Stále však provádí instalaci závislostí,
izolovaný produkční build, Prisma migrace, validaci systemd, restart a lokální
i veřejné health kontroly. Explicitní pin commitu zabraňuje nasazení jiného
nebo neověřeného commitu.

Runner potřebuje pouze odchozí HTTPS přístup na GitHub. Nainstalujte jej přes
GitHub **Settings → Actions → Runners → New self-hosted runner**, nastavte
výchozí labely `self-hosted`, `linux` a `x64` a spusťte jej pod vyhrazeným
non-root uživatelem. Tento uživatel potřebuje passwordless sudo pro release
skript. Nedovolujte workflow z nedůvěryhodných pull requestů běžet na tomto
runneru. Pokud je požadován schvalovací krok, nastavte required reviewers na
GitHub prostředí `production`.

Automatizovaný režim nasazuje přesně otestovaný commit, nevytváří lokální
changelog commit ani release tag a udržuje produkční checkout
fast-forwardovatelný z `origin/main`. Během privilegované aktualizace
repozitáře release skript synchronizuje vzdálené release tagy do produkčního
checkoutu, aby post-deploy rozlišení verze vidělo předchozí automatická
vydání. Po úspěchu produkčních health kontrol workflow vytvoří GitHub Release
s vygenerovanými release notes cílený přesně na otestovaný commit. Po úspěchu
celého main CI workflow `.github/workflows/repository-metadata.yml` doplní
`CHANGELOG.md` z publikovaných tagů, obnoví vygenerované metriky codebase,
otevře jeden audit PR z `automation/repository-metadata` a tento metadata PR
automaticky sloučí. Metadata-only merge je explicitně vyřazen z produkčního
nasazení. Publikování release je idempotentní: už existující GitHub Release pro
vyřešený tag se považuje za úspěch, včetně případů rerun/race. Verzované
stable/RC releasy nadále používají běžný příkaz výše.

## Přesné pořadí vydání

`deploy/release.sh` provádí následující brány a mutace v tomto pořadí:

1. Preflight ověří cestu aplikace, požadované soubory/příkazy, Node engine,
   pojmenovanou větev, origin, `.env`, oprávnění, systemd nástroje a čistý
   stav, pokud nebyl explicitně zvolen `--allow-dirty`. Pouze v automatizovaném
   režimu se před touto kontrolou obnoví přesně ty nestageované změny
   `next-env.d.ts` a `tsconfig.json`, které generuje Next.js release; všechny
   ostatní tracked, staged nebo untracked změny stále fail-close.
2. Získá `/var/lock/airradar-release.lock`. Pokud není použito `--offline`,
   čistý checkout se fetchne a aktualizuje pouze fast-forwardem; divergentní
   historie je odmítnuta. Offline release ponechá aktuální checkout a přeskočí
   stažení větve i tagů. Dirty checkout povolený výjimkou zůstane beze změny.
3. `scripts/version.mjs` vyřeší buď stabilního kandidáta
   `vMAJOR.MINOR.PATCH`, nebo pouze s `--channel rc` kanonického kandidáta
   `vMAJOR.MINOR.PATCH-rc.N`. Stable rozlišení ignoruje RC tagy; číslování RC
   bere v úvahu pouze RC tagy pro přesnou základní verzi. Shodný release tag
   již na `HEAD` se znovu použije. Skript exportuje release metadata pro build;
   nespouští `npm version` ani nemění package manifesty.
4. Pro ruční releasy `scripts/changelog.mjs` vygeneruje novou sekci
   `CHANGELOG.md` z Git commitů od předchozího release tagu. Nové záznamy jsou
   seskupené do sekcí Added/Changed/Fixed/Performance/Documentation/
   Maintenance, v bloku technických detailů zachovávají kompletní seznam
   commitů a vypisují registrované funkce dotčené přes conventional-commit
   scopes z `docs/features.registry.json`. Pokud se changelog změní, release
   jej před pokračováním automaticky commitne. Automatizované releasy tuto
   mutaci repozitáře přeskakují; post-CI workflow Repository Metadata doplní
   tagovaný release společně s vygenerovanými metrikami codebase, zatímco
   GitHub Release dál používá poznámky generované GitHubem.
5. Spustí `npm ci` s lokální cache a bez síťových npm audit/fund kontrol,
   vygeneruje Prisma kontrakt a poté paralelně spustí lint, typecheck a úplnou
   sadu Vitest. Release test používá Vitest `--pool=threads`; všechny testy se
   přesto spustí.
6. Získá `/var/lib/airradar/build.lock`, zapíše ignorovaný
   `generated/build-version.json` a spustí `npm run build` s Next.js outputem
   směrovaným do izolovaného adresáře `.next-release-*`. Aktivní adresář
   `.next` se během obsluhy provozu nemění. Build lock se po buildu uvolní.
7. Spustí `npm run prisma:deploy` proti nakonfigurované databázi. Migrace jsou
   dopředné; produkční databázi nikdy neresetujte ani znovu nevytvářejte.
8. Ověří systemd unit z repozitáře, porovná/nainstaluje ji atomicky do načteného
   persistentního FragmentPath, provede daemon-reload jen při změně a ověří
   kontrakt načtené unity: přímý produkční entrypoint, očekávaný working
   directory/environment, SIGTERM, `control-group`, `StateDirectory=airradar`,
   `StateDirectoryMode=0750` a `ProtectSystem=strict`. Poté v případě potřeby
   provede nedestruktivní migraci legacy alert konfigurace. Migrace nikdy
   nepřepisuje `/var/lib/airradar/alerts.json`; starý alert-event ledger se
   nikdy nekopíruje.
9. Krátce zastaví `airradar.service`, atomicky aktivuje dokončený build,
   spustí službu, vyžaduje její aktivní stav, s retry zkontroluje lokální health
   URL a s retry zkontroluje veřejné health URL. Starý build zůstává zachovaný,
   dokud neprojdou obě health kontroly.
10. Teprve po úspěchu všech povinných kontrol vytvoří vyřešený Git tag.

Neúspěšný release po restartu vypíše diagnostiku systemd/journal a
automaticky nevrací zpět Git kód ani databázové migrace. Obnova musí zohlednit
kompatibilitu migrací a kódu. Neúspěšného kandidáta lze použít znovu, protože
tag vzniká až jako poslední krok.

## Konzistence buildu a vizuální změny

Nespouštějte `npm run build` přímo v živém checkoutu `/var/www/airradar`,
pokud běží `airradar.service`. Next.js drží build manifest v běžícím procesu,
zatímco build přepisuje sdílený adresář `.next`. Pokud nový build nahradí
`.next` před restartem starého procesu, HTML ze starého buildu může odkazovat
na chybějící statické CSS/JavaScript soubory; domovská stránka může vracet
`200`, ale být bez stylů a neinteraktivní. Build/start lock brání spuštění
služby během aktivního release buildu, ale nečiní nezávisle spuštěný build
bezpečným pro již běžící proces.

Pro produkční buildy používejte `deploy/release.sh`. Buildí do izolovaného
adresáře `.next-release-*` a aktivní `.next` mění pouze během krátkého
stop/start předání služby. Pokud build selže, aktivní služba i build zůstanou
nedotčené. Při selhání aktivace myslete před ručním obnovením starého buildu
na obnovu služby a kompatibilitu databázových migrací.

Jakákoli změna v `app/`, `components/`, stylech, obrázcích, fontech nebo
jiném vizuálním UI kódu vyžaduje před releasem browser bránu:

```bash
npm run test:production:browser
```

Po restartu ověřte veřejnou URL ve skutečném prohlížeči nebo ekvivalentním
smoke testu. Kontrola musí potvrdit, že všechny zdroje `/_next/static/*`
vracejí úspěšné odpovědi s očekávanými MIME typy a že stránka nemá chyby v
browser console. Samotné `/api/health` k validaci vizuálního UI nestačí.

## Build/start lock a systemd

Produkční release build a startovací cesta sdílejí
`/var/lib/airradar/build.lock`. `deploy/release.sh` drží tento lock během
izolovaného `npm run build`; `scripts/start-production.mjs`
lock sonduje a čeká až do nakonfigurovaného timeoutu 120 sekund, poté před
načtením Next vyžaduje `.next/BUILD_ID`. Tím se zabrání systemd ve spuštění
neúplného buildu.

`deploy/airradar.service` běží pod neprivilegovaným uživatelem `airradar`,
s `WorkingDirectory=/var/www/airradar`,
`EnvironmentFile=/var/www/airradar/.env` a přímým
`node scripts/start-production.mjs start --hostname ... --port ...`.
Wrapper registruje shutdown coordinator v Next procesu a nastavuje
`NEXT_MANUAL_SIG_HANDLE=1`, takže systemd sleduje skutečný Node proces jako
`MainPID` a cleanup vlastní aplikace. Služba používá
`KillMode=control-group`, `KillSignal=SIGTERM` a omezený stop timeout.
`StateDirectory=airradar` dává uživateli služby trvalé úložiště
`/var/lib/airradar`, zatímco `ProtectSystem=strict` udržuje zdrojový
checkout jen pro čtení.

## Reverse proxy a health

Produkční proxy cílí na LAN listener nakonfigurovaný v systemd unitě.
AirRadar používá SSE, nikoli WebSocket. Proxy musí zachovat HTTP/1.1, vypnout
buffering/cache pro `/api/stream`, ponechat dlouhý read timeout a zachovat
`X-Accel-Buffering: no`; kompletní konfigurace Nginx Proxy Manageru je v
[`deploy/README.md`](../../deploy/README.md).

Health kontroly release skriptu vyžadují, aby `/api/health` vracelo HTTP 2xx,
top-level `status=ok` a `application.status=ok`. Health odpovědi jsou
sanitizované a nesmí obsahovat tajné údaje, databázová URL, surové chyby
providerů ani přechodné provozní hodnoty v dokumentaci.

## Obnova předchozího runtime (pouze ručně a při kompatibilním schématu)

Úspěšné nasazení nyní ponechává právě jeden předchozí sestavený runtime v
`/var/www/airradar/.next-previous`. Nejde o zálohu databáze. Při dalším
nasazení se záloha runtime přepíše; je proto nutná kapacita pro dva buildy.

Po neúspěšném release vždy nejprve zkontrolujte logy služby, změny v
`migrations/` a kompatibilitu schématu PostgreSQL. Samotný starší build může
být nekompatibilní s novější migrací. Automatický rollback není povolen.

```bash
cd /var/www/airradar
sudo bash deploy/recover-previous-build.sh
sudo bash deploy/recover-previous-build.sh --apply \\
  --acknowledge-schema-compatible \\
  --expected-active 'AKTUALNI_BUILD_ID' --expected-previous 'PREDCHOZI_BUILD_ID'
```

Skript ověřuje obě BUILD_ID, zamyká release a build, požaduje výslovné
potvrzení kompatibility a kontroluje lokální health endpoint. Při selhání
obnovy zkusí vrátit původně aktivní runtime. Nemění Git, migrace ani data.
Po obnovení proveďte také kontrolu veřejných JS/CSS souborů a aplikace.
