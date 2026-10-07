"use client";

import { useState } from "react";
import { PageHeader, Panel, SectionHeader, StatusBadge } from "@/components/ui-primitives";
import type { AlertSimulatorResult } from "@/lib/server/alert-rule-simulator";

export function AlertRuleSimulatorPage() {
  const [icaoHex, setIcaoHex] = useState("");
  const [callsign, setCallsign] = useState("");
  const [trigger, setTrigger] = useState("SQUAWK");
  const [detail, setDetail] = useState("7700");
  const [result, setResult] = useState<AlertSimulatorResult | null>(null);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    const body: Record<string, unknown> = { icaoHex, callsign, trigger };
    if (trigger === "SQUAWK") body.squawk = detail;
    else if (trigger === "FLIGHT_EVENT") body.flightEventType = detail;
    else body.geofenceId = detail;
    const response = await fetch("/api/admin/alerts/simulator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) { setResult(null); setMessage(payload.error ?? "Simulation failed"); return; }
    setResult(payload as AlertSimulatorResult);
  }

  return <main className="history-page" data-testid="alert-rule-simulator-v1">
    <PageHeader kicker="AIRRADAR / ALERTS" title="Alert Rule Simulator" description="Dry-run active alert rules without creating occurrences or sending notifications." />
    <Panel>
      <SectionHeader kicker="INPUT" title="Test signal" description="Evaluate the current fleets, rules, preferences, mutes and cooldown state." />
      <form className="watchlist-editor-form" onSubmit={submit}>
        <label>ICAO<input value={icaoHex} onChange={(e) => setIcaoHex(e.target.value.toUpperCase())} placeholder="ABC123" required /></label>
        <label>Callsign<input value={callsign} onChange={(e) => setCallsign(e.target.value.toUpperCase())} placeholder="CSA123" /></label>
        <label>Trigger<select value={trigger} onChange={(e) => { setTrigger(e.target.value); setDetail(e.target.value === "SQUAWK" ? "7700" : e.target.value === "FLIGHT_EVENT" ? "APPROACH" : ""); }}>
          <option value="SQUAWK">SQUAWK</option><option value="FLIGHT_EVENT">FLIGHT_EVENT</option><option value="GEOFENCE_ENTER">GEOFENCE_ENTER</option><option value="GEOFENCE_EXIT">GEOFENCE_EXIT</option>
        </select></label>
        <label>Condition<input value={detail} onChange={(e) => setDetail(e.target.value.toUpperCase())} required /></label>
        <button className="primary-button" type="submit">Simulate</button>
      </form>
      {message ? <p role="status">{message}</p> : null}
    </Panel>
    {result ? <Panel>
      <SectionHeader kicker="RESULT" title={String(result.matchedRuleIds.length) + " actionable rule(s)"} description={"Matched fleets: " + (result.matchedFleetIds.join(", ") || "none")} />
      <ul>
        {result.rules.map((rule) => <li key={rule.id}>
          <strong>{rule.name}</strong>{" "}
          <StatusBadge variant={rule.matched && !rule.cooldownActive ? "success" : "neutral"}>{rule.matched ? rule.cooldownActive ? "COOLDOWN" : "MATCH" : "NO MATCH"}</StatusBadge>
          <div>{rule.preferenceMode} · channels: {rule.effectiveChannels.join(", ") || "none"}</div>
          <small>{rule.reasons.join(" · ")}</small>
        </li>)}
      </ul>
    </Panel> : null}
  </main>;
}
