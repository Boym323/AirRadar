import { describe, expect, it } from "vitest";
import {
  airportMovementFeedItems,
  flightIntelligenceFeedItems,
  mergeAviationEventFeed,
  navigationIntegrityFeedItems,
} from "@/lib/aviation-event-feed";

describe("Aviation Event Feed V1", () => {
  it("normalizes existing event sources into one chronological feed", () => {
    const fi = flightIntelligenceFeedItems([{
      eventKey: "go:1", type: "GO_AROUND", icaoHex: "ABC123", callsign: "CSA1", registration: null,
      occurredAt: "2026-10-07T15:00:00Z", airportIcao: "LKPR", runway: "24", sectorId: null,
    }]);
    const nav = navigationIntegrityFeedItems([{
      id: "nav1", startedAt: "2026-10-07T14:58:00Z", lastObservedAt: "2026-10-07T15:01:00Z",
      severity: "DEGRADED", confidence: "HIGH", affectedAircraftCount: 3,
    }]);
    const airport = airportMovementFeedItems([{
      flightId: 42, icaoHex: "DEF456", callsign: "UAE139", registration: null,
      movement: "HOLDING", observedAt: "2026-10-07T14:59:00Z", airport: "LKPR", runway: null,
    }]);
    const feed = mergeAviationEventFeed([fi, nav, airport]);
    expect(feed.map((item) => item.id)).toEqual(["nav:nav1", "fi:go:1", "airport:LKPR:42:HOLDING"]);
    expect(feed[1]).toMatchObject({ severity: "warning", provenance: "OBSERVED" });
  });

  it("keeps the feed bounded and deduplicated by canonical source identity", () => {
    const item = flightIntelligenceFeedItems([{
      eventKey: "same", type: "APPROACH", icaoHex: "ABC123", callsign: null, registration: null,
      occurredAt: "2026-10-07T15:00:00Z", airportIcao: "LKPR", runway: null, sectorId: null,
    }])[0]!;
    expect(mergeAviationEventFeed([[item], [item]], 1)).toHaveLength(1);
  });
});
