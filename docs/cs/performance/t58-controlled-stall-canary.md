# T58 – jednorázový produkční canary pro dlouhé blokace

Navazuje na hodinový T58 #38887158312 s maximální prodlevou event-loop 4,94 s.

- Spustí se jen po **úspěšném nasazení výslovně označeného commitu** do main.
- Ověří commit skutečně běžící produkce, aktivní Rust parser a CRC a dosud vypnutou diagnostiku.
- Dočasně přidá systemd override `AIRRADAR_STALL_EVIDENCE_ENABLED=1`, restartuje službu a 15 minut sbírá pouze read-only agregované metriky každých 15 sekund.
- Po skončení obnoví původní konfiguraci a službu. Při ztrátě GitHub runneru provede nezávislý `systemd-run` watchdog automatický rollback nejpozději po 23 minutách.
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

### Omezení výsledků a bezpečné dokončení

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
