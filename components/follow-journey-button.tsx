"use client";

import { useState } from "react";
import {
  FOLLOWED_JOURNEYS_STORAGE_KEY,
  addFollowedJourney,
  parseFollowedJourneys,
  resolveFollowedJourney,
  serializeFollowedJourneys,
} from "@/lib/followed-journeys";
import { Button } from "@/components/ui-primitives";
import { t } from "@/lib/i18n";

export function FollowJourneyButton({
  icaoHex,
  callsign,
  registration,
  origin,
  destination,
}: {
  icaoHex: string;
  callsign: string | null;
  registration: string | null;
  origin: string | null;
  destination: string | null;
}) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const cs = t.locale.startsWith("cs");
  const label = state === "saved" ? (cs ? "Sledování aktivní" : "Following")
    : state === "saving" ? (cs ? "Ukládám…" : "Saving…")
    : cs ? "Sledovat tento let" : "Follow this flight";

  const follow = async () => {
    if (state === "saving") return;
    setState("saving");
    try {
      const response = await fetch("/api/intelligence/events?aircraft=" + encodeURIComponent(icaoHex) + "&limit=20", { cache: "no-store" });
      const payload = response.ok ? await response.json() as {
        events?: Array<{ flightId: number | null; lifecycleKey: string; occurredAt: string; type: string }>;
      } : { events: [] };
      const journey = resolveFollowedJourney({
        icaoHex,
        callsign,
        registration,
        origin,
        destination,
        events: payload.events ?? [],
      });
      const current = parseFollowedJourneys(window.localStorage.getItem(FOLLOWED_JOURNEYS_STORAGE_KEY));
      const next = addFollowedJourney(current, journey);
      window.localStorage.setItem(FOLLOWED_JOURNEYS_STORAGE_KEY, serializeFollowedJourneys(next));
      window.dispatchEvent(new Event("airradar:followed-journeys-changed"));
      setState("saved");
    } catch {
      setState("failed");
    }
  };

  return <span>
    <Button size="compact" variant="secondary" onClick={() => void follow()} disabled={state === "saving"}>
      {state === "failed" ? (cs ? "Zkusit znovu" : "Retry") : label}
    </Button>
  </span>;
}
