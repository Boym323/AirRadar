-- Route Enrichment Cache V2: additive PostgreSQL extension.
-- Apply to the intended DEV database first, then production during a
-- controlled maintenance/release window. Does not modify existing Flight
-- or FlightPosition rows. Safe to rerun; rollback is to disable the flag.
-- Never execute against production accidentally.
BEGIN;
CREATE TABLE IF NOT EXISTS "public"."routeEnrichmentCache" (
  "cacheKey" text PRIMARY KEY,
  "source" text NOT NULL,
  "routeJson" text NOT NULL,
  "storedAtMs" bigint NOT NULL,
  "expiresAtMs" bigint NOT NULL,
  CONSTRAINT route_enrichment_cache_source CHECK ("source" IN ('adsbdb', 'adsblol-routeset')),
  CONSTRAINT route_enrichment_cache_key CHECK ("cacheKey" ~ '^flight-route:[A-F0-9~]{6,7}:[A-Z0-9]{2,10}:[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  CONSTRAINT route_enrichment_cache_payload_size CHECK (length("routeJson") <= 8192),
  CONSTRAINT route_enrichment_cache_ttl CHECK ("expiresAtMs" > "storedAtMs")
);
CREATE INDEX IF NOT EXISTS route_enrichment_cache_expires_idx
  ON "public"."routeEnrichmentCache" ("expiresAtMs");
COMMIT;
