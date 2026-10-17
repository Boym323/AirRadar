# T58 – jednorázový produkční canary pro dlouhé blokace

Navazuje na hodinový T58 #38887158312 s maximální prodlevou event-loop 4,94 s.

- Spustí se jen po **úspěšném nasazení výslovně označeného commitu** do main.
- Ověří commit skutečně běžící produkce, aktivní Rust parser a CRC a dosud vypnutou diagnostiku.
- Pokud byla diagnostika zapnutá již před začátkem, běh skončí **chybou**; cizí konfiguraci nevypíná ani neslibuje rollback.
- Dočasně přidá systemd override `AIRRADAR_STALL_EVIDENCE_ENABLED=1`, restartuje službu a 15 minut sbírá pouze read-only agregované metriky každých 15 sekund.
- Po měření se pokusí odebrat dočasné nastavení a obnovit službu. Úspěšný návrat `systemctl` sám o sobě nestačí: poté musí read-only API potvrdit vypnutou diagnostiku, očekávaný commit a zdravý Rust backend. Pokud ověření selže, selže i workflow. Při ztrátě runneru zůstává nezávislý 23minutový `systemd-run` watchdog.
- Výsledkem je pouze sanitizovaný artefakt s CPU, RSS, event-loop a povolenými názvy operací. Bez identifikátorů letadel, souřadnic, přihlašovacích údajů či heap snapshotů.
- Časový souběh operací **není důkazem kauzality**.

Canary vyžaduje **dva řízené restarty služby**, jinak nemění databázi,
historii letů ani Rust nastavení. Nezasahuje do souboru `.env`.

Ruční nouzový rollback:
`sudo bash /var/www/airradar/deploy/rollback-stall-canary.sh`.

## Oprava oprávnění self-hosted runneru

Běh #38904102249 skončil před aktivací na chybě
`sudo: a password is required`. Runner úmyslně nemá obecné právo spouštět
`sudo systemctl`. Nová verze používá výhradně existující schválený vstup
`/var/www/airradar/deploy/release.sh` s pevnými volbami
`--t58-canary-probe`, `--t58-canary-start` a `--t58-canary-stop`.
Nezadává se žádný externí příkaz, cesta ani shell skript.

Před změnou konfigurace vznikne kopie rollbacku vlastněná rootem pod
`/run/airradar-t58-stall-canary` a nezávislý 23minutový systemd timer.
Při neúspěšném preflightu se systemd nemění. Standardní release odmítne
nové nasazení během aktivního canary.

Není nutné přidávat obecné `sudo`, heslo ani nové oprávnění do sudoers.
Neškodná kontrola oprávnění:
`sudo -n /var/www/airradar/deploy/release.sh --t58-canary-probe`.

**Omezení výsledků a bezpečné dokončení**

Nejde o příkaz umožňující libovolně ovládat systemd ani o vzdálený shell.
Povolené jsou pouze tři pevně definované operace bez parametrů. Pomocný
privilegovaný skript ověřuje identitu produkční jednotky, stav aplikace,
neexistenci předchozí diagnostické konfigurace a také shodu nastavení.
Během zapnutého canary je blokováno nové standardní nasazení, aby změna
verze nepřerušila porovnání a aby rollback obnovil správnou konfiguraci.

Pozorování zaznamenává jen časové překryvy pojmenovaných synchronních
operací. Ani shoda s dlouhou prodlevou sama o sobě neprokazuje příčinu:
příčinou může být také garbage collection, plánování procesů, nativní
kód nebo další neměřená část aplikace. Výsledky je nutné porovnávat
s metrikami CPU, RSS, event-loop a se skutečným počtem letadel.
Pokud diagnostika nenajde žádné blokace, neznamená to automaticky
odstranění historických problémů. O výsledku rozhodují naměřená data.

## Kontext GC a event-loop pro jednotlivé prodlevy (navázání na v1.0.483)

Při **výslovně zapnuté** diagnostice se nyní u každé zachycené dlouhé
prodlevy ukládají také omezené číselné delty GC (doba pauz, počet GC a major
GC) a doby aktivního/neaktivního event-loopu (ELU). Jde o kontext stejného
monotónního intervalu heartbeat; součástí zůstává CPU a bezpečně omezený název
synchronní operace. Uchovává se maximálně 24 událostí, v reportu pouze 20.
Nedostupné hodnoty mají `null`, nikoliv nulu.

Žádný stack trace, identifikátor letadla, PID, citlivý payload, cesta cgroup,
obsah paměti ani konfigurace se neukládají. Čítače GC jsou pozorovány
asynchronně; ani vysoké ELU či souběh s GC **nedokazuje příčinu** konkrétní
blokace. Celoprocesové CPU navíc zahrnuje případná další vlákna. Pokud
chybějí data cgroup throttlingu, nelze z toho odvodit nulový throttling.

Změna je **ve výchozím stavu vypnutá**. Sama nespouští canary ani nemění
produkci. Aktivace dále vyžaduje samostatně schválený jednorázový release,
dva řízené restarty a povinný nezávislý rollback.

## Vyhodnocení běhu #39005740397 (17. 10. 2026)

Tento historický běh vstoupil do větve, v níž byla diagnostika aktivní už
před startem. Ačkoli bylo odebráno 61 vzorků, **neproběhlo řízené zapnutí,
restartování ani rollback**. Stav `success` tedy nedokládá obnovení konfigurace.
Oprava kódu zpětně nemění stav produkce; nejdříve je nutné samostatné
read-only ověření konfigurace služby a watchdogu.

Nový canary v takové situaci skončí chybou bez zásahu do služby. Jen běh,
který sám vytvořil dočasné nastavení, může spustit vlastní cleanup.
Úspěch je podmíněn odstraněním override, neaktivním watchdogem a potvrzením
vypnuté diagnostiky v běžící aplikaci se správným commitem i Rust backendem.
Samotný soubor s naměřenými daty **není důkazem rollbacku**.

## Jednorázové vzorkování CPU pomocí V8 během canary

Stejný dočasný systemd override zapíná také `AIRRADAR_T58_CPU_PROFILE_ENABLED=1`.
Vestavěný `node:inspector` spustí vzorkování hlavního vlákna před zahájením
sběru letadel, po 20 ms. Skončí po 120 sekundách nebo při RSS nad 1 750 MiB;
neotevírá síťový port inspectoru. Profil se zahodí při překročení 10 000
vzorků či uzlů nebo 32 KiB očištěného souhrnu. Stávající 23minutový watchdog
odstraní oba přepínače a při ztrátě runneru restartuje službu. Po rollbacku
musí read-only API potvrdit vypnutí obou diagnostik.

Plný V8 profil, URL, cesty, zdrojový kód, data požadavků a argumenty se
neukládají ani nenahrávají. Autentizovaný endpoint poskytuje pouze omezené
názvy funkcí, hrubé kategorie JS/nativní/GC/idle, počty vzorků a delty CPU,
GC a plánování hlavního vlákna pro jednotlivé blokace. Patnáctiminutový
canary report obsahuje tento očištěný souhrn. Vzorek CPU uvnitř blokace je
silnější důkaz než minutová korelace, ale je nutné jej posoudit spolu s CPU,
GC a čekáním plánovače.

U minifikovaných názvů funkcí obsahuje souhrn pouze povolený název chunku
`.next/server/chunks` a pozici koncového frame (řádek/sloupec číslovaný od
nuly). Operátor ji může převést pomocí soukromé source mapy přesného
nasazeného buildu. Report neobsahuje absolutní cestu, libovolnou URL, obsah
source mapy ani plný profil.
