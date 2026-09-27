# Audit Flight Intelligence V2

Toto je audit Phase 0 pro první etapu roadmapy. Zaznamenává aktuální
implementaci na `main`; pozdější etapy roadmapy jej mají aktualizovat pouze
tehdy, když jejich implementace změní některou z těchto ownership hranic.

| Oblast | Existující schopnost | Chybějící schopnost | Možnosti reuse | Riziko | Navržená implementace |
| --- | --- | --- | --- | --- | --- |
| Živá letadla | `AircraftStateService` drží jednu RAM mapu a volá intelligence z lokální snapshot větve. | Není potřeba nový vlastník live state. | Zachovat existující single-process poller a cleanup lifecycle. | Druhý detector by se rozešel se SSE/history stavem. | Rozšířit `FlightIntelligenceDetector` na místě. |
| Historie pohybu | Omezená per-aircraft historie detectoru a vzorkovaná historie `FlightPosition` už existují. | Explicitní guard stale/discontinuous pozorování. | Použít `lastSeen`, `seenPosSeconds`, timestampy a existující omezenou historii. | Řídká nebo skoková pozorování mohou vytvářet falešné fáze/události. | Resetovat pouze dotčený detector track do `UNKNOWN` a čekat na čerstvou sekvenci. |
| Fáze letu | Deterministické přechody climb/cruise/descent/approach/landing s hysteresis už existují. | Sémantika `FINAL`, `LANDED`, `GO_AROUND`, `UNKNOWN` a level-off event. | Zachovat aktuální potvrzování transition a airport proximity signály. | Změna persistovaných phase values může rozbít staré konzumenty. | Přidat nové phases a přijímat legacy `LANDING`; zachovat kompatibilní staré event names. |
| Holding/orbit | Omezená oblast, vývoj zatáčení, duration, altitude a airborne kontroly už existují. | Candidate/confirmed/ended lifecycle a explicitní unusual-turn/orbit events. | Reuse `detectHolding()` evidence a jediný event ledger. | Approach vectors a lokální provoz jsou časté false positives. | Přidat duration/hysteresis, lifecycle state a konzervativní spatial gates. |
| Události | `FlightIntelligenceEvent` publikuje jedna služba, persistuje do `FlightEvent` a streamuje přes SSE. | Started/ended timestampy, reason-code alias a omezená metadata. | Rozšířit aktuální DTO a `metadataJson`; žádná nová tabulka ani stream. | Schema migrace by bez aktuální potřeby přidala deployment risk. | Přidat optional fields pro backward compatibility a persistovat je do existujících metadata. |
| Alerty | `AlertEngine` má omezené priority queues, deduplikaci a intelligence bridging. | Phase-1 lifecycle events nesmějí být hlučné alerty. | Dále mapovat pouze potvrzené existující alert typy. | Candidate/ended events mohou spamovat watchlisty. | Omezit alert bridge na existující actionable intelligence events. |
| Replay/history | Řádky `FlightEvent` se joinují do Flight Story a replay tooling existuje. | Replay fixtures pro stale a discontinuous input. | Zachovat deterministický replay a stejný detector. | Historické řádky neobsahují každý live signal. | Přidat pure fixture testy; nerozšiřovat persistence tables. |
| UI/observability | Intelligence page, REST/SSE endpointy a existující překlady existují. | Phase-1 diagnostika zatím není zveřejněna. | Existující event stream zůstává presentation boundary. | UI změny by zbytečně rozšířily tuto etapu. | Držet Phase 1 zaměřenou na backend/event a nová pole zveřejnit aditivně. |

## Rozhodnutí o persistenci

Použít existující hybridní hranici: stav detectoru a omezené recent events
zůstávají v RAM pro live delivery, zatímco detekované události dál používají
existující best-effort persistenci `FlightEvent`. Prisma migrace není potřeba,
protože další lifecycle timestampy a reason codes se vejdou do existujících
polí `metadataJson`/`evidenceJson`.

## Rozsah Stage 1

Implementovat pouze základy Flight Intelligence V2: explicitní phase result,
ochranu proti stale/discontinuous inputu, level-off, konzervativní holding
lifecycle, unusual turn/orbit events a unit coverage založené na fixtures.
ATC, počasí, detail panel, Time Machine, alerting, receiver dashboard,
rendering a filed-route intelligence zůstávají samostatnými etapami.
