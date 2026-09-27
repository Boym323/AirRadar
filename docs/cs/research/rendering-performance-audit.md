# Audit renderingu / výkonu

Baseline byla změřena na produkčním buildu z `origin/main` na `a39c977e`
s `RADAR_PERF_SCENARIOS=100,500,1000` a třísekundovým browser oknem.
Existující harness procvičuje syntetický SSE V2 provoz, WebGL rendering letadel,
diagnostiku labelů, virtualizaci provozu a pozorování long tasks.

| Oblast | Aktuální chování | Náklad/riziko | Důkaz | Navržená akce |
|---|---|---|---|---|
| Live ingest → React | `useRadarLiveAircraft` drží refs/change sety a slučuje React snapshoty přes omezený scheduler. | Nízké; full snapshot se stále commitne okamžitě. | `components/radar/use-radar-live-aircraft.ts`, `lib/radar/live-snapshot-scheduler.ts`, SSE testy. | Zachovat protokol a latest-state-wins sémantiku. |
| Live ingest → mapa | Pending changed/removed ICAO sety řídí `syncAircraftMap`; bulk a special aircraft jsou oddělené. | Nízké/střední; map sync vlastní několik per-change map a selected-route kontrol. | `components/airradar-app.tsx`, `lib/radar/live-aircraft-changes.ts`. | Zachovat change-set path; nepřidávat široké React memoization bez důkazu. |
| WebGL data render | WebGL znovu sestavuje typed vertex buffer při dirty/data-frame/bearing změnách; pohyb se interpoluje a spatial picking je bucketovaný. | Alokace typed array při každém data renderu vytváří zbytečný GC tlak při vysokých počtech. | `lib/radar/aircraft-webgl-layer.ts`; baseline animation 0.18/0.25/0.97 ms při 100/500/1000. | Znovu používat kapacitně rostoucí `Float32Array`; zachovat upload/draw sémantiku. |
| WebGL ↔ HTML heading | HTML používá `resolveAircraftVisualHeading`; WebGL používal stejný bearing model, ale bez explicitního sdíleného helperu. | Budoucí asset offsets by se mohly tiše rozejít. | `lib/radar/aircraft-marker-controller.ts`, WebGL shader/runtime. | Přidat explicitní WebGL screen-heading helper a parity testy. |
| Aktualizace HTML markerů | Aktualizují se pouze změněná letadla; změny textu labelu invalidují změřené rozměry. | Nízké; selected/watchlist/emergency aircraft záměrně zůstávají HTML. | `lib/radar/aircraft-marker-controller.ts`. | Zachovat aktuální ownership a changed-data updates. |
| Collision | Greedy priority order s 96px spatial gridem; selected/emergency jsou force-visible; route-airport labely se filtrují až po aircraft labelech. | Nízké/střední; route-airport exclusion je lineární v malé selected-route sadě. | `lib/radar/aircraft-label-collision.ts`, `aircraft-label-controller.ts`; baseline collision ≤0.03 ms v testovaných bulk scénářích. | Zachovat grid a priority policy; přidat jen regression coverage. |
| Zoom LOD | Stabilní thresholds: hidden <6.5, callsign <8.5, altitude <10.5, type potom. | Nízké; žádné timer-driven flicker, ale žádný explicitní hysteresis state. | `lib/aircraft/map-labels.ts`, `tests/map-labels.test.ts`. | Nepřidávat stavovou hysteresis bez změřeného flicker repro. |
| Selected aircraft | Selected aircraft je odstraněno z WebGL bulk, zachováno jako HTML marker a jeho omezený selected trail se aktualizuje pouze při změně trail inputs. | Nízké; route/weather/ATC reads jsou pouze selected. | `components/airradar-app.tsx`, `lib/aircraft/trail.ts`. | Zachovat reference-keyed trail rebuild guard. |
| Time Machine | Používá omezené tracks/events, helper vzorkování ve stylu binary-search, global map time a po H omezené event clusters. | Nízké/střední; playback záměrně aktualizuje canonical time každý frame. | `components/time-machine.tsx`, `lib/time-machine/`, Time Machine testy. | Validovat existujícími deterministickými testy a browser gate. |
| SSE → render backpressure | Ephemeral aircraft positions se slučují; durable intelligence/alert events používají oddělené persistované cesty. | Nízké; změna této hranice riskuje ztrátu eventů nebo stale selection. | `docs/DATA-FLOWS.md`, `use-radar-live-aircraft.ts`, SSE testy. | Žádné protocol ani semantic změny. |

## Rozhodnutí o rozsahu

V H se mění pouze změřená WebGL alokace a explicitní heading parity helper.
Collision, LOD, trail bounds, selected-panel ownership a SSE coalescing už mají
omezené implementace a regression coverage; nepřepisují se kvůli spekulativním
ziskům.
