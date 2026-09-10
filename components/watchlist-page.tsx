"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getTranslations, type LocaleDictionary, type LocaleKey } from "@/lib/i18n";
import type { PublicWatchlistResponse, PublicWatchlistRule } from "@/lib/server/watchlist-store";

type RuleType = PublicWatchlistRule["type"];

interface RuleForm {
  name: string;
  type: RuleType;
  value: string;
  maxDistanceKm: string;
  enabled: boolean;
}

const DISTANCE_PRESETS_KM = [10, 25, 50, 100] as const;

class ApiError extends Error {
  constructor(readonly code: string | undefined) {
    super(code ?? "request_failed");
  }
}

function emptyForm(): RuleForm {
  return { name: "", type: "icaoHex", value: "", maxDistanceKm: "", enabled: true };
}

function formFromRule(rule: PublicWatchlistRule): RuleForm {
  return {
    name: rule.name,
    type: rule.type,
    value: rule.value,
    maxDistanceKm: rule.maxDistanceKm === undefined ? "" : String(rule.maxDistanceKm),
    enabled: rule.enabled,
  };
}

function formatCooldown(milliseconds: number, dictionary: LocaleDictionary): string {
  const minutes = Math.round(milliseconds / 60_000);
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return dictionary.locale.startsWith("cs") ? `${hours} h` : `${hours} hr`;
  }
  return `${minutes} min`;
}

function formatObservedAt(value: string | null, dictionary: LocaleDictionary): string {
  if (!value) return dictionary.common.emptyValue;
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(dictionary.locale, { dateStyle: "short", timeStyle: "short" }).format(date)
    : dictionary.common.emptyValue;
}

function lastAlertLabel(dictionary: LocaleDictionary): string {
  return dictionary.locale.startsWith("cs") ? "Poslední upozornění" : "Last alert";
}

function neverAlertedLabel(dictionary: LocaleDictionary): string {
  return dictionary.locale.startsWith("cs") ? "Zatím bez upozornění" : "No alert yet";
}

function typeLabel(dictionary: LocaleDictionary, type: RuleType): string {
  const labels = dictionary.watchlist.ruleKinds;
  if (type === "icaoHex") return labels.icaoHex;
  if (type === "callsignPattern") return labels.pattern;
  if (type === "aircraftType") return labels.type;
  return labels[type];
}

function translatedError(dictionary: LocaleDictionary, error: unknown, action: "load" | "save" | "delete"): string {
  if (error instanceof ApiError) {
    if (error.code === "auth_required") return dictionary.watchlist.authRequired;
    if (error.code === "auth_unavailable") return dictionary.watchlist.authUnavailable;
    if (error.code === "auth_failed") return dictionary.watchlist.authFailed;
    if (error.code === "csrf_rejected") return dictionary.watchlist.csrfRejected;
    if (error.code === "invalid_icao") return dictionary.watchlist.invalidIcao;
    if (error.code === "invalid_distance") return dictionary.watchlist.invalidDistance;
    if (error.code === "invalid_cooldown") return dictionary.watchlist.invalidCooldown;
    if (error.code === "duplicate_rule") return dictionary.watchlist.duplicateRule;
  }
  if (action === "load") return dictionary.watchlist.loadFailed;
  if (action === "delete") return dictionary.watchlist.deleteFailed;
  return dictionary.watchlist.saveFailed;
}

async function readResponse(response: Response): Promise<PublicWatchlistResponse> {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = payload && typeof payload === "object" && "code" in payload && typeof payload.code === "string" ? payload.code : undefined;
    throw new ApiError(code);
  }
  return payload as PublicWatchlistResponse;
}

function RuleEditor({
  dictionary,
  form,
  setForm,
  onSubmit,
  onCancel,
  busy,
}: {
  dictionary: LocaleDictionary;
  form: RuleForm;
  setForm: (form: RuleForm) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
  busy: boolean;
}) {
  return (
    <form className="watchlist-editor" onSubmit={onSubmit}>
      <div className="watchlist-editor-grid">
        <label>
          <span>{dictionary.watchlist.ruleName}</span>
          <input required maxLength={120} value={form.name} placeholder={dictionary.watchlist.ruleNamePlaceholder} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </label>
        <label>
          <span>{dictionary.watchlist.ruleType}</span>
          <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as RuleType })}>
            <option value="icaoHex">{dictionary.watchlist.ruleKinds.icaoHex}</option>
            <option value="registration">{dictionary.watchlist.ruleKinds.registration}</option>
            <option value="callsign">{dictionary.watchlist.exactCallsign}</option>
            <option value="callsignPattern">{dictionary.watchlist.callsignPattern}</option>
            <option value="aircraftType">{dictionary.watchlist.ruleKinds.type}</option>
            <option value="airline">{dictionary.watchlist.ruleKinds.airline}</option>
          </select>
        </label>
        <label>
          <span>{dictionary.watchlist.value}</span>
          <input required value={form.value} placeholder={form.type === "callsignPattern" ? "UAE*" : dictionary.watchlist.valuePlaceholder} onChange={(event) => setForm({ ...form, value: event.target.value })} />
        </label>
        <label>
          <span>{dictionary.watchlist.maxDistance}</span>
          <input type="number" min="0.000001" step="any" value={form.maxDistanceKm} placeholder={dictionary.watchlist.maxDistancePlaceholder} onChange={(event) => setForm({ ...form, maxDistanceKm: event.target.value })} />
        </label>
      </div>
      <div className="watchlist-editor-actions" aria-label={dictionary.watchlist.maxDistance}>
        {DISTANCE_PRESETS_KM.map((distance) => (
          <button key={distance} className="secondary-button" type="button" disabled={busy} aria-pressed={form.maxDistanceKm === String(distance)} onClick={() => setForm({ ...form, maxDistanceKm: String(distance) })}>{distance} km</button>
        ))}
        <button className="secondary-button" type="button" disabled={busy} aria-pressed={form.maxDistanceKm === ""} onClick={() => setForm({ ...form, maxDistanceKm: "" })}>{dictionary.filters.distanceAll}</button>
      </div>
      <label className="watchlist-enabled-input"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /> {form.enabled ? dictionary.watchlist.enabled : dictionary.watchlist.disabled}</label>
      <div className="watchlist-editor-actions">
        <button className="primary-button" type="submit" disabled={busy}>{dictionary.watchlist.save}</button>
        {onCancel && <button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>{dictionary.watchlist.cancel}</button>}
      </div>
    </form>
  );
}

function CurrentState({ rule, dictionary }: { rule: PublicWatchlistRule; dictionary: LocaleDictionary }) {
  const state = rule.currentState;
  const label = state.status === "matching"
    ? dictionary.watchlist.matching
    : state.status === "notMatching" ? dictionary.watchlist.notMatching : dictionary.watchlist.unknownState;
  return (
    <div className={`watchlist-current-state ${state.status}`}>
      <div className="watchlist-current-heading"><span>{dictionary.watchlist.currentState}</span><strong>{label}</strong></div>
      <small>{formatObservedAt(state.observedAt, dictionary)}</small>
      {state.aircraft.length > 0 && <div className="watchlist-matches" aria-label={dictionary.watchlist.matchingAircraft}>
        {state.aircraft.map((aircraft) => <Link key={aircraft.icaoHex} href={`/aircraft/${encodeURIComponent(aircraft.icaoHex)}`}><strong>{aircraft.callsign || aircraft.registration || aircraft.icaoHex}</strong><span>{aircraft.icaoHex}</span></Link>)}
      </div>}
    </div>
  );
}

export function WatchlistPage() {
  const [locale, setLocale] = useState<LocaleKey>("cs");
  const dictionary = getTranslations(locale);
  const [data, setData] = useState<PublicWatchlistResponse | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState<RuleForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<{ icaoHex: string | null; registration: string | null }>({ icaoHex: null, registration: null });
  const [authConfigured, setAuthConfigured] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const loadAuth = useCallback(async () => {
    const response = await fetch("/api/watchlist/session", { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json() as { configured?: boolean; authenticated?: boolean };
    setAuthConfigured(result.configured === true);
    setAuthenticated(result.authenticated === true);
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/watchlist", { cache: "no-store" });
      setData(await readResponse(response));
      setError(null);
    } catch (requestError) {
      setError(translatedError(dictionary, requestError, "load"));
    }
  }, [dictionary]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const icaoHex = params.get("icaoHex");
    const registration = params.get("registration");
    setPrefill({ icaoHex, registration });
    if (icaoHex || registration) {
      const value = icaoHex ?? registration ?? "";
      const type: RuleType = icaoHex ? "icaoHex" : "registration";
      setForm({ ...emptyForm(), name: `${typeLabel(dictionary, type)} ${value}`, type, value });
    }
    void loadAuth().catch(() => undefined);
    void load();
  }, [dictionary, load, loadAuth]);

  const signIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/watchlist/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: authToken }),
      });
      await readResponse(response);
      setAuthenticated(true);
      setAuthToken("");
    } catch (requestError) {
      setError(translatedError(dictionary, requestError, "save"));
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    setAuthBusy(true);
    try {
      await fetch("/api/watchlist/session", { method: "DELETE" });
      setAuthenticated(false);
    } finally {
      setAuthBusy(false);
    }
  };

  const submitCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          value: form.value,
          enabled: form.enabled,
          maxDistanceKm: form.maxDistanceKm ? Number(form.maxDistanceKm) : null,
        }),
      });
      const next = await readResponse(response);
      setData(next);
      setForm(emptyForm());
    } catch (requestError) {
      setError(translatedError(dictionary, requestError, "save"));
    } finally {
      setBusy(false);
    }
  };

  const submitEdit = async (id: string, event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingForm) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/watchlist/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingForm.name,
          type: editingForm.type,
          value: editingForm.value,
          enabled: editingForm.enabled,
          maxDistanceKm: editingForm.maxDistanceKm ? Number(editingForm.maxDistanceKm) : null,
        }),
      });
      setData(await readResponse(response));
      setEditingId(null);
      setEditingForm(null);
    } catch (requestError) {
      setError(translatedError(dictionary, requestError, "save"));
    } finally {
      setBusy(false);
    }
  };

  const patchRule = async (rule: PublicWatchlistRule, patch: Partial<RuleForm>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/watchlist/${encodeURIComponent(rule.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: patch.enabled ?? rule.enabled }),
      });
      setData(await readResponse(response));
    } catch (requestError) {
      setError(translatedError(dictionary, requestError, "save"));
    } finally {
      setBusy(false);
    }
  };

  const removeRule = async (rule: PublicWatchlistRule) => {
    if (!window.confirm(dictionary.watchlist.confirmDelete)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/watchlist/${encodeURIComponent(rule.id)}`, { method: "DELETE" });
      setData(await readResponse(response));
    } catch (requestError) {
      setError(translatedError(dictionary, requestError, "delete"));
    } finally {
      setBusy(false);
    }
  };

  const rules = useMemo(() => data?.rules ?? [], [data]);
  const applyPrefill = (type: RuleType, value: string) => setForm({ ...form, name: `${typeLabel(dictionary, type)} ${value}`, type, value });

  return (
    <main className="history-page watchlist-page">
      <header className="history-page-header watchlist-page-header">
        <div>
          <Link className="back-link" href="/">{dictionary.watchlist.backToRadar}</Link>
          <h1>{dictionary.watchlist.pageTitle}</h1>
          <p className="statistics-subtitle">{dictionary.watchlist.pageSubtitle}</p>
        </div>
        <nav className="watchlist-nav" aria-label={dictionary.watchlist.navigation}>
          <Link className="secondary-button" href="/alerts">{dictionary.alerts.title}</Link>
          <Link className="secondary-button" href="/fleet">{dictionary.watchlist.fleet}</Link>
          <button type="button" className="language-button" onClick={() => setLocale((current) => current === "cs" ? "en" : "cs")} aria-label={locale === "cs" ? "English" : "Čeština"}>{locale === "cs" ? "EN" : "CZ"}</button>
        </nav>
      </header>

      {error && <div className="statistics-error" role="alert">{error}</div>}

      {authConfigured && <section className="statistics-card watchlist-auth-card" aria-labelledby="watchlist-auth-title">
        <div className="statistics-card-header"><h2 id="watchlist-auth-title">{dictionary.watchlist.authTitle}</h2>{authenticated && <button type="button" className="secondary-button" onClick={() => void signOut()} disabled={authBusy}>{dictionary.watchlist.signOut}</button>}</div>
        {authenticated ? <p>{dictionary.watchlist.authenticated}</p> : <form className="watchlist-auth-form" onSubmit={signIn}>
          <p>{dictionary.watchlist.authDescription}</p>
          <label><span>{dictionary.watchlist.adminToken}</span><input type="password" autoComplete="current-password" required value={authToken} onChange={(event) => setAuthToken(event.target.value)} /></label>
          <button className="primary-button" type="submit" disabled={authBusy}>{dictionary.watchlist.signIn}</button>
        </form>}
      </section>}

      {prefill.icaoHex || prefill.registration ? <section className="watchlist-prefill" aria-label={dictionary.watchlist.prefilled}>
        <strong>{dictionary.watchlist.prefilled}</strong>
        <div>
          {prefill.icaoHex && <button type="button" className={form.type === "icaoHex" ? "selected" : ""} onClick={() => applyPrefill("icaoHex", prefill.icaoHex!)}>{dictionary.watchlist.useIcao}: {prefill.icaoHex}</button>}
          {prefill.registration && <button type="button" className={form.type === "registration" ? "selected" : ""} onClick={() => applyPrefill("registration", prefill.registration!)}>{dictionary.watchlist.useRegistration}: {prefill.registration}</button>}
        </div>
      </section> : null}

      <div className="watchlist-layout">
        <section className="statistics-card watchlist-create-card" aria-labelledby="watchlist-create-title">
          <div className="statistics-card-header"><h2 id="watchlist-create-title">{dictionary.watchlist.newRule}</h2></div>
          <RuleEditor dictionary={dictionary} form={form} setForm={setForm} onSubmit={submitCreate} busy={busy} />
        </section>

        <section className="statistics-card watchlist-rules-card" aria-labelledby="watchlist-rules-title">
          <div className="statistics-card-header"><h2 id="watchlist-rules-title">{dictionary.watchlist.title}</h2><span>{rules.length}</span></div>
          {data && rules.length === 0 && <p className="watchlist-empty">{dictionary.watchlist.empty}</p>}
          {!data && !error && <p className="watchlist-empty">{dictionary.watchlist.loading}</p>}
          <div className="watchlist-rule-list">
            {rules.map((rule) => editingId === rule.id && editingForm ? (
              <article className="watchlist-rule-card" key={rule.id}><h3>{dictionary.watchlist.editRule}</h3><RuleEditor dictionary={dictionary} form={editingForm} setForm={setEditingForm} onSubmit={(event) => void submitEdit(rule.id, event)} onCancel={() => { setEditingId(null); setEditingForm(null); }} busy={busy} /></article>
            ) : (
              <article className={`watchlist-rule-card ${rule.enabled ? "is-enabled" : "is-disabled"}`} key={rule.id}>
                <div className="watchlist-rule-header"><div><h3>{rule.name}</h3><div className="watchlist-rule-value"><span>{typeLabel(dictionary, rule.type)}</span><strong>{rule.value}</strong></div></div><span className={`watchlist-status ${rule.enabled ? "enabled" : "disabled"}`}>{rule.enabled ? dictionary.watchlist.enabled : dictionary.watchlist.disabled}</span></div>
                <dl className="watchlist-rule-meta">
                  {rule.maxDistanceKm !== undefined && <div><dt>{dictionary.watchlist.maxDistance}</dt><dd>{rule.maxDistanceKm} km</dd></div>}
                  <div><dt>{dictionary.watchlist.cooldown}</dt><dd title={dictionary.watchlist.cooldownDescription}>{formatCooldown(rule.cooldownMs, dictionary)}</dd></div>
                  <div><dt>{lastAlertLabel(dictionary)}</dt><dd>{rule.lastTriggeredAt ? formatObservedAt(rule.lastTriggeredAt, dictionary) : neverAlertedLabel(dictionary)}</dd></div>
                </dl>
                <CurrentState rule={rule} dictionary={dictionary} />
                <div className="watchlist-rule-actions">
                  <button type="button" className="secondary-button" disabled={busy} onClick={() => { setEditingId(rule.id); setEditingForm(formFromRule(rule)); }}>{dictionary.watchlist.edit}</button>
                  <button type="button" className="secondary-button" disabled={busy} onClick={() => void patchRule(rule, { enabled: !rule.enabled })}>{rule.enabled ? dictionary.watchlist.disable : dictionary.watchlist.enable}</button>
                  <button type="button" className="danger-button" disabled={busy} onClick={() => void removeRule(rule)}>{dictionary.watchlist.remove}</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className={`watchlist-emergency ${data?.emergency.enabled ? "is-enabled" : "is-disabled"}`}>
        <div><strong>{dictionary.watchlist.emergencyRule}</strong><span>{data?.emergency.enabled ? dictionary.watchlist.emergencyEnabled : dictionary.watchlist.emergencyDisabled}</span></div>
        <small>{dictionary.watchlist.serverConfigured}</small>
      </section>
    </main>
  );
}