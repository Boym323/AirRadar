# Provozní spolehlivost V2 (C1–C5)

## Účel a původ dat

Stávající jednoprocestní cesta readsb → RAM → SSE se nemění.
C1 vyhodnocuje dostupnost lokálního a volitelného síťového zdroje ze
stávajících snapshotů, nikoliv skutečné přepnutí poskytovatele. Neznámý
nebo zastaralý čas není zdravý stav. Demo není potvrzený příjem.

C2 používá omezené čítače odmítnutých SSE spojení podle globálního,
kanálového a klientského limitu a snapshotů sloučených při zpomaleném
odběrateli. Sloučení snapshotu neprokazuje ztrátu paketů. Čítače platí
pro životnost procesu, nikoliv pro jednotku času, a neukládají IP.

C3 rozšiřuje již chráněnou diagnostiku doručování o míru úspěšných
finálních výsledků (bez výsledků je hodnota neznámá) a kódy příčin
pro opakování, trvalé chyby a zastavený worker. Údaj nedokazuje
správnost upozornění ani zobrazení na telefonu. Pravidla se nemění.

C4 zpřístupňuje poradní `operationalHealth` pouze v administrátorské
projekci stávajícího systémového API. Rozlišuje nedostatek podkladů
od doloženého výpadku. Pro detail doručování slouží již existující
zabezpečené API, nikoli nový databázový dotaz systémového monitoringu.

C5 spouští v PR po sestavení izolovaný produkční smoke test jen
pro rizikové změny runtime a nasazení. Ostatní změny tím nezdržuje.
Úplná validace a nasazovací pravidla větve main zůstávají beze změn.

## Provozní výklad

- `HEALTHY` znamená dostupné provozní podklady, nikoli zaručenou
  přesnost predikcí nebo upozornění.
- `INSUFFICIENT_DATA` se nesmí vydávat za zdravý stav.
- `DEGRADED` je doložený problém; historický počet sloučených
  snapshotů sám o sobě výpadek neznamená.
- Vypnutý volitelný NETWORK nemusí zhoršovat zdravý LOCAL příjem.
- Produkci ověřovat stávajícím release workflow a UI smoke testem.
  Etapa nezapíná predikce PUBLIC, nemění zdrojovou afinitu ani
  nepřidává migrace, workery či externí služby.
