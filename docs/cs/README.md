# AirRadar – dokumentace česky

Tato složka obsahuje českou lokalizaci dokumentace projektu. Anglické soubory
v nadřazené složce `docs/` jsou technickým zdrojem pravdy; při změně kontraktu
se musí aktualizovat také příslušná česká stránka.

Rozsah a základní strukturu překladu kontroluje `npm run docs:check`. Při
změně anglického dokumentu aktualizujte ve stejném commitu jeho český protějšek
a spusťte tuto kontrolu; ta ověřuje i nadpisy, bloky kódu, tabulky a číslované
seznamy.

## Přehled

- [Architektura](ARCHITECTURE.md)
- [Datové toky](DATA-FLOWS.md)
- [Runtime invarianty](RUNTIME-INVARIANTS.md)
- [Vývoj](DEVELOPMENT.md)
- [Vydání a nasazení](RELEASE.md)
- [Zdroje dat](DATA-SOURCES.md)
- [Funkce a routy](FEATURES.md)
- [Vizuální systém](VISUAL-SYSTEM.md)

Praktický úvod je také v [české části GitHub Wiki](https://github.com/Boym323/AirRadar/wiki/%C4%8Ce%C5%A1tina).
