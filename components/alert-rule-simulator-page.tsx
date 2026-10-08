"use client";

import { useState } from "react";
import { PageHeader, Panel, SectionHeader, StatusBadge } from "@/components/ui-primitives";
import type { AlertSimulatorResult } from "@/lib/server/alert-rule-simulator";
import { t } from "@/lib/i18n";

export function AlertRuleSimulatorPage() {
  const copy = t.locale.startsWith("cs") ? {
    kicker: "AIRRADAR / UPOZORNĚNÍ", title: "Simulátor pravidel upozornění",
    description: "Vyzkoušejte aktivní pravidla bez vytváření upozornění nebo odesílání notifikací.",
    inputKicker: "VSTUP", inputTitle: "Zkušební událost",
    inputDescription: "Vyhodnocení aktuálních flotil, pravidel, preferencí, ztišení a čekacích lhůt.",
    callsign: "Volací znak", trigger: "Spouštěč", condition: "Podmínka", simulate: "Simulovat",
    flightEvent: "Letová událost", geofenceEnter: "Vstup do geozóny", geofenceExit: "Opuštění geozóny",
    requestFailed: "Simulace se nezdařila.", resultKicker: "VÝSLEDEK", matchedFleets: "Vyhovující flotily",
    none: "žádné", channels: "kanály", cooldown: "ČEKACÍ LHŮTA", match: "SHODA", noMatch: "BEZ SHODY",
    actionableRules: (n: number) => n === 1 ? "1 použitelné pravidlo" : n >= 2 && n <= 4 ? n + " použitelná pravidla" : n + " použitelných pravidel",
  } : {
    kicker: "AIRRADAR / ALERTS", title: "Alert Rule Simulator",
    description: "Dry-run active alert rules without creating occurrences or sending notifications.",
    inputKicker: "INPUT", inputTitle: "Test signal",
    inputDescription: "Evaluate the current fleets, rules, preferences, mutes and cooldown state.",
    callsign: "Callsign", trigger: "Trigger", condition: "Condition", simulate: "Simulate",
    flightEvent: "Flight event", geofenceEnter: "Geofence enter", geofenceExit: "Geofence exit",
    requestFailed: "Simulation failed.", resultKicker: "RESULT", matchedFleets: "Matched fleets",
    none: "none", channels: "channels", cooldown: "COOLDOWN", match: "MATCH", noMatch: "NO MATCH",
    actionableRules: (n: number) => n + " actionable rule(s)",
  };
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
    if (!response.ok) { setResult(null); setMessage(payload.error ?? copy.requestFailed); return; }
    setResult(payload as AlertSimulatorResult);
  }

  return <main className="history-page" data-testid="alert-rule-simulator-v1">
    <PageHeader kicker={copy.kicker} title={copy.title} description={copy.description} />
    <Panel>
      <SectionHeader kicker={copy.inputKicker} title={copy.inputTitle} description={copy.inputDescription} />
      <form className="watchlist-editor-form" onSubmit={submit}>
        <label>ICAO<input value={icaoHex} onChange={(e) => setIcaoHex(e.target.value.toUpperCase())} placeholder="ABC123" required /></label>
        <label>{copy.callsign}<input value={callsign} onChange={(e) => setCallsign(e.target.value.toUpperCase())} placeholder="CSA123" /></label>
        <label>{copy.trigger}<select value={trigger} onChange={(e) => { setTrigger(e.target.value); setDetail(e.target.value === "SQUAWK" ? "7700" : e.target.value === "FLIGHT_EVENT" ? "APPROACH" : ""); }}>
          <option value="SQUAWK">SQUAWK</option><option value="FLIGHT_EVENT">{copy.flightEvent}</option><option value="GEOFENCE_ENTER">{copy.geofenceEnter}</option><option value="GEOFENCE_EXIT">{copy.geofenceExit}</option>
        </select></label>
        <label>{copy.condition}<input value={detail} onChange={(e) => setDetail(e.target.value.toUpperCase())} required /></label>
        <button className="primary-button" type="submit">{copy.simulate}</button>
      </form>
      {message ? <p role="status">{message}</p> : null}
    </Panel>
    {result ? <Panel>
      <SectionHeader kicker={copy.resultKicker} title={copy.actionableRules(result.matchedRuleIds.length)} description={copy.matchedFleets + ": " + (result.matchedFleetIds.join(", ") || copy.none)} />
      <ul>
        {result.rules.map((rule) => <li key={rule.id}>
          <strong>{rule.name}</strong>{" "}
          <StatusBadge variant={rule.matched && !rule.cooldownActive ? "success" : "neutral"}>{rule.matched ? rule.cooldownActive ? copy.cooldown : copy.match : copy.noMatch}</StatusBadge>
          <div>{rule.preferenceMode} · {copy.channels}: {rule.effectiveChannels.join(", ") || copy.none}</div>
          <small>{rule.reasons.join(" · ")}</small>
        </li>)}
      </ul>
    </Panel> : null}
  </main>;
}
