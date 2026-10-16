# T58 – diagnostika dlouhých blokací event-loop (volitelná)

Hodinový T58 #38887158312 naměřil maximální prodlevu 4,94 s, přestože
běžné CPU a p99 jsou výrazně lepší. Minutové součty překrývajících se
operací neurčují konkrétní příčinu. Rust ani SQL se proto nepřepisují naslepo.

## Bezpečnost a aktivace

Výchozí stav: VYPNUTO. `AIRRADAR_STALL_EVIDENCE_ENABLED=1` aktivuj až pro
schválenou, časově omezenou diagnostiku standardním release postupem.
Přibude jediný časovač s intervalem 1 s (`unref`) a omezená evidence
synchronních operací delších než 25 ms s bezpečně omezenými názvy.
Při zpoždění časovače alespoň o 1000 ms vznikne záznam obsahující čas,
délku zpoždění, přibližné využití CPU za interval a maximálně jednu časově
překrývající se operaci. Uchovává se nejvýše 24 událostí a 64 operací.

Nesbírají se souřadnice, identifikátory letadel, zprávy, SQL dotazy, stack
traces ani heap snapshoty. Výsledky jsou pouze na autentizovaném
`/api/system/runtime-performance` jako `stallEvidence`; veřejné API se
nemění. Časový překryv **není důkaz příčiny**. GC, plánovač OS, nativní
volání nebo nepokrytý kód mohou zůstat bez přiřazené operace.

## Ověření

Spusť `npx vitest run tests/runtime-stall-evidence.test.ts tests/runtime-health-observation.test.ts`
a následně typecheck, lint a CI. Při regresi flag vypni a proveď standardní
restart/rollback. Pro zkoumání růstu paměti je stále nutné delší sledování;
samotné hodnoty RSS ani old-space růst nedokazují únik paměti.

[English version](../../performance/t58-long-stall-evidence.md)
