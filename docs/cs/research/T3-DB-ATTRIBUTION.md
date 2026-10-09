# T3.2 – databázové vyhodnocení bez zásahu do produkce

Použij existující anonymizovaný report #648:

```bash
node scripts/analyze-db-performance.mjs artifacts/performance/2026-10-09/database-metrics.json
```

Volitelný JSON výstup lze uložit druhým argumentem (pouze vytvoření nového souboru).
Nástroj se nepřipojuje do PostgreSQL, neprovádí SQL ani nemění ukládání historie.

Výstup seřadí tabulky podle aktualizací za minutu a vypočítá podíl rollbacků.
Podíl rollbacků **není** mírou aplikačních chyb a update rate **neprokazuje** zbytečné zápisy.
K určení kořenové příčiny doplň per-lane atribuci DB operací a bezpečné diagnostiky autovacua; teprve následně optimalizuj.
