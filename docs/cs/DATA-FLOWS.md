# Datové toky

`LocalReadsbProvider` čte `aircraft.json` a `receiver.json`, normalizuje
pozorování podle ICAO hexu a předává je službě `AircraftStateService`. Ta
udržuje RAM mapu, odstraňuje zastaralé záznamy, aktualizuje omezené traily a
publikuje bezpečné snapshoty přes `/api/aircraft` a `/api/stream`.

Volitelné síťové zdroje se slučují podle ICAO identity s uchováním původu.
Nezapisují se do lokální historie ani statistik. Metadata, ATC, alerty a
statistiky běží asynchronně a jejich chyba nesmí přerušit živý ingest.

OGN používá samostatný APRS-IS stream, časovou validaci a anonymizační pravidla.
Úplný popis toků je v [anglické verzi](../DATA-FLOWS.md).
