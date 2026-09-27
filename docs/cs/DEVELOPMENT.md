# Vývoj

Požadavky jsou Node.js `>=22.18.0` a npm `>=10`. Pro lokální práci použijte
`.env.example`; přihlašovací údaje a API klíče se necommitují. Prázdné
`READSB_BASE_URL` aktivuje demo režim.

Pro úzkou změnu používejte cílené testy, pro smíšenou změnu `npm run test:changed`.
Dokumentační změny nevyžadují celý build, ale vždy spusťte `git diff --check`.
Produkční build nespouštějte v živém checkoutu, pokud běží `airradar.service`.

Podrobné příkazy a pravidla práce s worktree jsou v
[anglické verzi](../DEVELOPMENT.md).
