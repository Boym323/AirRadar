# T3.4 – diagnostika CPU, paměti, GC a event loopu

Nový modul `lib/server/runtime-health-observation.ts` poskytuje pouze **volitelnou**, procesově lokální diagnostiku.

API: `startRuntimeHealthObservation()`, `getRuntimeHealthObservation()`, `stopRuntimeHealthObservation()`.

Sledování se **automaticky nespouští**. Při explicitní aktivaci používá histogram zpoždění event loopu a maximálně 64 vzorků GC, bez ukládání obsahu požadavků, SQL dotazů či osobních údajů. Je určené pro další připojení k chráněné interní diagnostice a řízené měření na DEV. Vypnutí odpojí observer, zakáže histogram a smaže vzorky.

Před produkční aktivací: doplnit oprávnění administrátora pro diagnostický endpoint, případně přístup pouze přes provozní CLI, testovat reálnou režii a postupy aktivace/vypnutí. Nevyvozovat příčinu CPU/RSS jen z výsledného histogramu.
