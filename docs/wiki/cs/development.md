# Vývoj a testování

Pro úzké změny používejte cílené testy nebo testy ovlivněné změnou. Změny pouze
v dokumentaci nevyžadují celý build ani testovací sadu; spusťte `git diff --check`
a relevantní kontroly dokumentace. Nespouštějte produkční build v živém checkoutu,
pokud `airradar.service` obsluhuje provoz.

Viz úplné pokyny v [DEVELOPMENT.md](../../DEVELOPMENT.md).
