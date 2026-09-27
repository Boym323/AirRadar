# AirRadar – dokumentace česky

Tato složka obsahuje českou lokalizaci autoritativní dokumentace projektu.
Anglické soubory v nadřazené složce `docs/` zůstávají technickým zdrojem
pravdy; při změně kontraktu se musí ve stejném commitu aktualizovat také
odpovídající česká stránka.

Lokalizační kontrakt pokrývá osm autoritativních dokumentů uvedených níže a
šest praktických stránek v `docs/wiki/cs/`. Specializované návrhové,
výzkumné, auditní a historické dokumenty mimo tuto sadu zůstávají anglicky,
dokud nejsou výslovně zařazeny mezi autoritativní dokumentaci.

Rozsah a paritu překladu kontroluje `npm run docs:check`. Kontrola ověřuje
existenci českého protějšku, shodnou Markdown strukturu (nadpisy, bloky kódu,
tabulky a číslované seznamy), přiměřený rozsah překladu, stejné cíle Markdown
odkazů, známé chybové markery po neúspěšném překladu a paritu české/anglické
wiki. Při změně anglického dokumentu spusťte tuto kontrolu před dokončením
změny.

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
