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
