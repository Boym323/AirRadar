-- Opt-in parsed-only RXW ACARS/VDL2 history. Apply manually before enabling.
-- Confirm RXW Hub's permission for retention / public display.
-- No raw messages, CPDLC content, receiver coordinates, UID or payload bodies.
BEGIN;
CREATE TABLE IF NOT EXISTS "public"."RxwRouteSnapshot" (
  "id" text PRIMARY KEY,
  "icaoHex" text NOT NULL,
  "flight" text NOT NULL,
  "kind" text NOT NULL,
  "origin" text NOT NULL,
  "destination" text NOT NULL,
  "etaUtc" text,
  "waypointsJson" text NOT NULL,
  "positionedCount" integer NOT NULL,
  "stationId" text NOT NULL,
  "protocol" text NOT NULL,
  "observedAtMs" bigint NOT NULL,
  "source" text NOT NULL DEFAULT 'rxw-acarshub',
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT rxw_route_kind CHECK ("kind" IN ('FPN','AIRPORT_PAIR')),
  CONSTRAINT rxw_route_identity CHECK ("icaoHex" ~ '^[A-F0-9]{6}$' AND "flight" ~ '^[A-Z0-9]{2,10}$'),
  CONSTRAINT rxw_route_airports CHECK ("origin" ~ '^[A-Z]{3,4}$' AND "destination" ~ '^[A-Z]{3,4}$' AND "origin" <> "destination"),
  CONSTRAINT rxw_route_size CHECK (length("waypointsJson") <= 8192 AND "positionedCount" BETWEEN 0 AND 80),
  CONSTRAINT rxw_route_provenance CHECK ("source" = 'rxw-acarshub'),
  CONSTRAINT rxw_route_time CHECK ("observedAtMs" > 0)
);
CREATE INDEX IF NOT EXISTS "rxw_route_icao_flight_time_idx"
  ON "public"."RxwRouteSnapshot" ("icaoHex","flight","observedAtMs");
CREATE INDEX IF NOT EXISTS "rxw_route_observed_idx"
  ON "public"."RxwRouteSnapshot" ("observedAtMs");
COMMIT;
