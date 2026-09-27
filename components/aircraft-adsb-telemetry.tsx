"use client";

import type { AircraftView } from "@/lib/aircraft/types";
import { formatAge, formatAltitude, formatNumber, t } from "@/lib/i18n";

function value(value: number | null | undefined, suffix: string, digits = 0): string | null {
  return value === null || value === undefined ? null : `${formatNumber(value, digits)}${suffix}`;
}

function angle(value: number | null | undefined, digits = 0): string | null {
  return value === null || value === undefined ? null : `${formatNumber(value, digits)}°`;
}

function TelemetryValue({ label, value: text }: { label: string; value: string | null | undefined }) {
  if (!text) return null;
  return <div className="aircraft-adsb-telemetry-value"><span>{label}</span><strong>{text}</strong></div>;
}

export function AircraftAdsbTelemetry({ aircraft, compact = false }: { aircraft: AircraftView; compact?: boolean }) {
  const telemetry = aircraft.adsbTelemetry;
  const target = aircraft.targetState;
  const operational = aircraft.operationalStatus;
  if (!telemetry && !target && !operational) return null;

  const telemetryFieldNames = new Set([
    "iasKt", "tasKt", "mach", "windDirectionDeg", "windSpeedKt", "outsideAirTemperatureC",
    "totalAirTemperatureC", "staticPressureHpa", "navQnhHpa", "selectedAltitudeMcpFt", "selectedAltitudeFmsFt",
    "selectedHeadingDeg", "nic", "containmentRadiusM", "nacP", "nacV", "sil", "silType",
    "gva", "sda", "adsbVersion", "magneticHeadingDeg", "trueHeadingDeg", "rollDeg",
    "trackRateDegPerSec", "selectedAltitudeFt", "baroPressureHpa", "targetState", "operationalStatus",
  ]);
  const provenance = Object.entries(aircraft.provenance?.fields ?? {})
    .filter(([field]) => telemetryFieldNames.has(field))
    .map(([, entry]) => entry);
  const provenanceTimes = provenance.map((entry) => Date.parse(entry.observedAt)).filter(Number.isFinite);
  const observedAt = provenanceTimes.length ? Math.max(...provenanceTimes) : null;
  const ageSeconds = observedAt === null ? null : Math.max(0, (Date.now() - observedAt) / 1000);
  const protocols = [...new Set(provenance.map((entry) => entry.protocol).filter(Boolean))];
  const bdsRegisters = [...new Set(provenance.map((entry) => entry.bds).filter((entry): entry is string => Boolean(entry)))];
  const protocolLabel = [
    protocols.map((entry) => entry === "beast-mode-s" ? "Beast Mode-S" : entry === "readsb-json" ? "readsb JSON" : entry).join(" + "),
    bdsRegisters.length ? `BDS ${bdsRegisters.map((entry) => entry.replace("BDS", "")).join(" / ")}` : null,
  ].filter(Boolean).join(" · ");

  const activeModes = [
    ...(telemetry?.navModes ?? []).map((mode) => mode.toUpperCase()),
    target?.autopilot ? "AP" : null,
    target?.vnavMode ? "VNAV" : null,
    target?.altitudeHoldMode ? "ALT HOLD" : null,
    target?.approachMode ? "APP" : null,
    target?.lnavMode ? "LNAV" : null,
  ].filter((mode): mode is string => Boolean(mode));
  const navModes = [...new Set(activeModes)].join(" · ") || null;

  const selectedAltitude = target?.selectedAltitudeFt ?? null;
  const selectedAltitudeLabel = selectedAltitude === null
    ? null
    : `${formatAltitude(selectedAltitude)} · ${target?.selectedAltitudeSource ?? "N/A"}`;
  const qnh = target?.baroPressureHpa ?? telemetry?.navQnhHpa ?? null;
  const selectedHeading = target?.selectedHeadingDeg ?? telemetry?.selectedHeadingDeg ?? null;
  const reportedWind = telemetry?.windDirectionDeg !== null && telemetry?.windDirectionDeg !== undefined
    && telemetry?.windSpeedKt !== null && telemetry?.windSpeedKt !== undefined
    ? `${formatNumber(telemetry.windDirectionDeg, 0)}° · ${formatNumber(telemetry.windSpeedKt, 0)} kt`
    : null;
  const adsbVersion = operational?.adsbVersion ?? telemetry?.adsbVersion ?? null;
  const nacp = operational?.nacp ?? target?.nacp ?? telemetry?.nacP ?? null;
  const sil = operational?.sil ?? target?.sil ?? telemetry?.sil ?? null;
  const nicBaro = operational?.nicBaro ?? target?.nicBaro ?? null;

  return <section className={`aircraft-adsb-telemetry ${compact ? "compact" : ""}`} aria-label={t.aircraft.adsbTelemetryTitle}>
    <header className="aircraft-adsb-telemetry-header">
      <div>
        <span className="aircraft-adsb-telemetry-kicker">{t.aircraft.localAdsbModeS}</span>
        <h3>{t.aircraft.adsbTelemetryTitle}</h3>
      </div>
      <div className="aircraft-adsb-telemetry-meta">
        {ageSeconds !== null && <span>{t.aircraft.telemetryAge}: {formatAge(ageSeconds)}</span>}
        {protocolLabel && <span>{t.aircraft.telemetryProtocols}: {protocolLabel}</span>}
      </div>
    </header>

    <div className="aircraft-adsb-telemetry-groups">
      <section className="aircraft-adsb-telemetry-group">
        <h4>{t.aircraft.airDataTitle}</h4>
        <div className="aircraft-adsb-telemetry-grid">
          <TelemetryValue label={t.aircraft.indicatedAirspeed} value={value(telemetry?.iasKt, " kt")} />
          <TelemetryValue label={t.aircraft.trueAirspeed} value={value(telemetry?.tasKt, " kt")} />
          <TelemetryValue label={t.aircraft.mach} value={telemetry?.mach === null || telemetry?.mach === undefined ? null : `M ${formatNumber(telemetry.mach, 3)}`} />
          <TelemetryValue label={t.aircraft.magneticHeading} value={angle(telemetry?.magneticHeadingDeg)} />
          <TelemetryValue label={t.aircraft.trueHeading} value={angle(telemetry?.trueHeadingDeg)} />
          <TelemetryValue label={t.aircraft.rollAngle} value={angle(telemetry?.rollDeg, 1)} />
          <TelemetryValue label={t.aircraft.trackRate} value={value(telemetry?.trackRateDegPerSec, "°/s", 2)} />
          <TelemetryValue label={t.aircraft.reportedWind} value={reportedWind} />
          <TelemetryValue label={t.aircraft.outsideAirTemperature} value={value(telemetry?.outsideAirTemperatureC, " °C", 1)} />
          <TelemetryValue label={t.aircraft.totalAirTemperature} value={value(telemetry?.totalAirTemperatureC, " °C", 1)} />
          <TelemetryValue label={t.aircraft.staticPressure} value={value(telemetry?.staticPressureHpa, " hPa", 0)} />
        </div>
      </section>

      <section className="aircraft-adsb-telemetry-group">
        <h4>{t.aircraft.navigationStateTitle}</h4>
        <div className="aircraft-adsb-telemetry-grid">
          <TelemetryValue label={t.aircraft.selectedAltitude} value={selectedAltitudeLabel} />
          <TelemetryValue label={t.aircraft.selectedAltitudeMcp} value={telemetry?.selectedAltitudeMcpFt === null || telemetry?.selectedAltitudeMcpFt === undefined ? null : formatAltitude(telemetry.selectedAltitudeMcpFt)} />
          <TelemetryValue label={t.aircraft.selectedAltitudeFms} value={telemetry?.selectedAltitudeFmsFt === null || telemetry?.selectedAltitudeFmsFt === undefined ? null : formatAltitude(telemetry.selectedAltitudeFmsFt)} />
          <TelemetryValue label={t.aircraft.selectedHeading} value={angle(selectedHeading)} />
          <TelemetryValue label={t.aircraft.qnh} value={value(qnh, " hPa", 1)} />
          <TelemetryValue label={t.aircraft.navModes} value={navModes} />
          {target?.tcasOperational !== null && target?.tcasOperational !== undefined
            ? <TelemetryValue label={t.aircraft.tcas} value={target.tcasOperational ? t.common.yes : t.common.no} />
            : null}
        </div>
      </section>

      <section className="aircraft-adsb-telemetry-group">
        <h4>{t.aircraft.integrityTitle}</h4>
        <div className="aircraft-adsb-telemetry-grid">
          <TelemetryValue label={t.aircraft.adsbVersion} value={adsbVersion === null ? null : String(adsbVersion)} />
          <TelemetryValue label="NACp" value={nacp === null ? null : String(nacp)} />
          <TelemetryValue label="NACv" value={telemetry?.nacV === null || telemetry?.nacV === undefined ? null : String(telemetry.nacV)} />
          <TelemetryValue label="NIC" value={telemetry?.nic === null || telemetry?.nic === undefined ? null : String(telemetry.nic)} />
          <TelemetryValue label="NICbaro" value={nicBaro === null ? null : String(nicBaro)} />
          <TelemetryValue label="SIL" value={sil === null ? null : `${sil}${telemetry?.silType ? ` · ${telemetry.silType}` : ""}`} />
          <TelemetryValue label="GVA" value={telemetry?.gva === null || telemetry?.gva === undefined ? null : String(telemetry.gva)} />
          <TelemetryValue label="SDA" value={telemetry?.sda === null || telemetry?.sda === undefined ? null : String(telemetry.sda)} />
          <TelemetryValue label={t.aircraft.containmentRadius} value={value(telemetry?.containmentRadiusM, " m")} />
          <TelemetryValue label={t.aircraft.headingReference} value={operational?.headingReference ?? null} />
        </div>
      </section>
    </div>
  </section>;
}
