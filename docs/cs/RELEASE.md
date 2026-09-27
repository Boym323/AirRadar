# Vydání a nasazení

Produkční vydání je explicitní provozní akce a řídí se vydávacím postupem.
Nevydávejte z vývojového worktree, neresetujte produkční databázi a nepřepisujte
sdílené `.next` soubory za běžící službou. Produkční build a restart provádí
`deploy/release.sh` podle kontrol uvedených v anglické dokumentaci.

Před vydáním se ověřuje build, migrace, health endpoint, veřejné API, SSE a
podle typu změny také desktopové a mobilní UI.

Autoritativní postup: [anglická verze](../RELEASE.md).
