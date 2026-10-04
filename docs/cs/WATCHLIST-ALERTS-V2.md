# Aircraft Watchlist & Alerts V2

Watchlist & Alerts V2 propojuje existující watchlist s veřejnou predikční
advisory vrstvou bez vytvoření druhé predikční nebo readiness cesty.

## Volby pravidla

Každé watchlist pravidlo může volitelně nastavit:

- ETA limit od 1 do 120 minut;
- volitelný čtyřpísmenný ICAO kód cílového letiště pro ETA limit; a
- upozornění na změnu predikované dráhy.

Stávající matching identity, vzdálenosti a enabled stavu zůstává autoritativní.

## Pouze PUBLIC predikce

Predikční alerty se vyhodnocují výhradně ze stejných veřejných advisory
builderů jako aircraft prediction API:

- `buildPublicEtaAdvisory()`;
- `buildPublicRunwayChangeAdvisory()`; a
- efektivní policy po predictive readiness enforcementu.

Alert engine nikdy nedostává admin preview ani raw SHADOW predikce. Capability
nastavená na PUBLIC, která ztratí readiness, se fail-closed stáhne ještě před
tím, než by mohla vytvořit alert.

Pro celý batch letadel se používá jeden cacheovaný readiness report, ne jeden
dotaz na každé letadlo.

## Semantika událostí

ETA alert vznikne jednou po vstupu odpovídajícího pravidla pod nastavený limit.
Persistentní event key je stabilní vůči malým změnám ETA díky kombinaci
letadla, callsignu, cíle, omezeného časového bucketu příletu a ETA limitu.

Runway-change alert vznikne jednou pro každou odlišnou readiness-gated PUBLIC
změnu a klíčuje se podle letadla, času změny, původní a nové dráhy.

Oba typy používají existující historii alertů, delivery queue, notifier,
last-trigger stav pravidla a omezený persistentní dedup.

## Hranice

- bez databázové migrace;
- bez nového client polleru nebo SSE spojení;
- bez druhého prediction enginu;
- bez SHADOW notifikací;
- bez zpřístupnění notifier credentials prohlížeči.
