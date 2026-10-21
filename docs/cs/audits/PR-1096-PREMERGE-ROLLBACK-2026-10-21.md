# PR #1096 — kontrola před sloučením a plán návratu (21. 10. 2026)

**Rozsah:** větev `cleanup/selected-features-ui-phase1-20261019` proti `main`. Jde jen o přípravu a kontrolu; tento dokument **nepovoluje merge ani nasazení**. Sloučení do `main` může spustit automatické produkční nasazení, proto vyžaduje výslovné schválení.

## Výsledky kontroly zdrojového kódu

- Výběr uživatele zahrnuje **88 KEEP a 90 REMOVE ID**. Každé ID má záznam v `docs/audits/SELECTED-FEATURE-KEEP-REMOVE-WITNESSES-2026-10-21.json`.
- U 88 KEEP je zachovaný odpovídající **společný runtime vstup nebo modul**. Toto je skupinový důkaz funkční hranice, nikoli ověření původního významu každého ze 88 individuálních ID.
- Uživatel předal **přesný kompletní inventář 178 položek dne 21. 10. 2026**, nyní uložený v `docs/audits/SELECTED-FEATURE-CANONICAL-INVENTORY-2026-10-21.json`: podle předchozího výběru **88 KEEP / 90 REMOVE**. Dvě drobné nepřesnosti dřívější rekonstrukce názvů P01 a L01 jsou opravené. Samostatně zůstává 8 konkrétních a 82 skupinových důkazů odstranění. Znalost názvů **nedokazuje** odstranění každé implementace.
- Sdílené závislosti se nesmí odstranit: detail a historie pro H03/H07/H14 potřebují části spojené s odmítnutými H01/H02; R11 potřebuje trasový kontext, který sdílí H04; R17 potřebuje polygonovou ATC geometrii, kterou sdílí T01.
- Dosavadní kontrola zahrnuje **50 odstraněných API** a **21 stránek**. Nový `scripts/selected-feature-premerge-audit.mjs` porovnává URL odkazy v živém zdrojovém kódu s **56 aktuálními API**, kontroluje hlavní backendové služby a jejich lifecycle. Vzdálené AWC `/api/data/*` patří poskytovateli počasí, nikoli AirRadaru; výjimka je omezena pouze na příslušné tři moduly.
- TypeScript, Vitest a browser testy kontrolují další vazby. Skládané URL, reálná data a produkční zátěž vyžadují po nasazení vlastní smoke/benchmark.
- Oproti `bc2f5fc17277f7571b90e358bab3177467e93312` se nemění `prisma/migrations/**`, `prisma/schema.prisma`, `deploy/release.sh`, `deploy/recover-previous-build.sh` ani `deploy/airradar.service`.
- Historie ADS-B, AUP archiv, OGN cache, Web Push předplatné, doručovací záznamy Pushover a migrace se nesmí mazat.

## Odstranění P05/P06 ve zdrojovém kódu (čeká na závěrečné CI)

Přesný katalog 178 názvů odhalil stále aktivní vyřazené analytiky P05 (koridor) a P06 (Trajectory Conformance) v zachované mapě R11. Detail je v `docs/cs/audits/SELECTED-FEATURE-P04-P06-SCOPE-GAP-2026-10-21.md`. Samostatný běh P05/P06 byl odstraněn, zobrazení trasy R11 zůstává. **Před merge dokončit poslední CI a ověření R11 v reálném provozu.**

## Podmínky pro merge

1. Ověřit přesné SHA PR #1096 a `main`. Při změně základní větve znovu porovnat a otestovat.
2. Zkontrolovat 178 přesných názvů, zachovaný výběr KEEP/REMOVE, 82 skupinových důkazů a záměrně sdílené závislosti. Neprohlašovat všech 178 individuálních implementací za ověřené bez konkrétního call graphu.
3. Vyžadovat zelené **CI, CodeQL a zátěžové testy 1×/2×/4× na stejném HEAD**. CI musí zahrnovat build, typy, Vitest, browser a výkonovou regresi.
4. Spustit `node scripts/selected-feature-premerge-audit.mjs` a `npm run features:check`. Chybějící interní API kontrakt blokuje merge.
5. Ověřit skutečný readsb/Beast příjem, SSE, mapu, detail letadla, historii, trasu/ATS/ATC, Navigation Integrity, letiště, METAR/SIGMET/ČHMÚ, volitelné OGN a RXW, sanitizovaný systémový stav a doručovací frontu.
6. Před nasazením zaznamenat T58 CPU, RSS, P95/P99/max smyčky, stáří dat readsb/Beast, latenci SSE a DB/cache. Po nasazení měřit s obdobnou zátěží. Syntetické testy nejsou produkční A/B.

## Bezpečná zkušební kontrola (jen oprávněný administrátor)

Následující příkazy jsou **návod**, při tomto auditu nebyly spuštěny na produkci:

```bash
cd /var/www/airradar
git rev-parse HEAD
sudo ./deploy/release.sh --branch main --dry-run
sudo bash deploy/recover-previous-build.sh
```

`--dry-run` nic nenasazuje, nestaví, nemigruje ani nerestartuje. Druhý skript bez dalších argumentů pouze ukáže BUILD_ID aktivního a předchozího sestavení. Nestavět aplikaci v právě běžícím checkoutu.

## Kontrolované nasazení

Až po výslovném schválení merge. Existující CI/CD používá testovaný build, zámky, izolované sestavení, migrace a kontroly lokálního i veřejného zdraví a statických souborů. Postup je v `docs/RELEASE.md`. Po nasazení ověřit `/api/version` podle skutečného release artefaktu, ne pouze podle SHA draft PR.

Při chybě příjmu, SSE, databáze, statických souborů, zdraví služby, dlouhých zásecích smyčky či růstu paměti zastavit další kroky a uložit diagnostiku.

## Rollback celého běhu aplikace

Použít **`deploy/recover-previous-build.sh`**. `deploy/rollback-native.sh` řeší jen vypnutí nativního Beast parseru, nikoli návrat celé aplikace.

1. Nejprve jen přečíst stav pomocí `sudo bash deploy/recover-previous-build.sh` a zaznamenat obě BUILD_ID.
2. Ověřit kompatibilitu starého běhu s aktuální DB. Toto PR migrace nemění, ale jiné nasazení v mezidobí mohlo databázi posunout.
3. Teprve po schválení a s přesně přečtenými ID:

```bash
cd /var/www/airradar
sudo bash deploy/recover-previous-build.sh \
  --apply --acknowledge-schema-compatible \
  --expected-active SKUTECNE_AKTIVNI_BUILD_ID \
  --expected-previous SKUTECNE_PREDCHOZI_BUILD_ID
```

Skript zkontroluje sestavení, zámky, přepne runtime, restartuje systemd a otestuje lokální health. **Nemění Git, schéma, historická data ani tagy.** Nemazat historii, PostgreSQL tabulky ani uložené AUP JSON archivy. Následně ověřit veřejné a lokální health, statické soubory, skutečná ADS-B data, SSE a historii.

## Stav

PR je připraven ke kontrolnímu rozhodnutí, nikoli automaticky k merge: původních 90 názvů REMOVE už je doloženo; zbývá ověření konkrétních implementací 82 ID, individuální KEEP sémantiky a produkční T58 porovnání po schváleném nasazení. Bez merge, migrace či zásahu do produkce.
