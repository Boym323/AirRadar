import { readFileSync, writeFileSync } from "node:fs";

const path = "components/airradar-app.tsx";
let source = readFileSync(path, "utf8");

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Patch anchor not found: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Patch anchor is not unique: ${label}`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  'import type { AtcDataResponse, AtcSector } from "@/lib/atc/types";\n',
  'import type { AtcDataResponse, AtcSector } from "@/lib/atc/types";\nimport type { AirspaceActivityResponse } from "@/lib/airspace-activity/types";\nimport { buildAirspacePlanMapIndex, matchAirspacePlanForSector } from "@/lib/airspace-activity/map";\nimport { airspaceActivityMapT as activityT } from "@/lib/i18n/airspace-activity";\n',
  "imports",
);

replaceOnce(
`function formatAtcLimit(feet: number | null, reference: string | null | undefined, unlimited: string): string {
  if (reference === "SFC") return "SFC";
  if (reference === "UNL" || feet === null) return unlimited;
  if (reference === "FL") return \`FL\${Math.round(feet / 100)}\`;
  return \`\${formatAltitude(feet)}\${reference === "AGL" ? " AGL" : ""}\`;
}
`,
`function formatAtcLimit(feet: number | null, reference: string | null | undefined, unlimited: string): string {
  if (reference === "SFC") return "SFC";
  if (reference === "UNL" || feet === null) return unlimited;
  if (reference === "FL") return \`FL\${Math.round(feet / 100)}\`;
  return \`\${formatAltitude(feet)}\${reference === "AGL" ? " AGL" : ""}\`;
}

function formatAirspaceUtc(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return t.common.emptyValue;
  return \`\${date.toISOString().slice(0, 10)} \${date.toISOString().slice(11, 16)} UTC\`;
}
`,
  "UTC formatter",
);

replaceOnce(
`function createAtcGeoJSON(sectors: AtcSector[], visible: boolean) {
  return {
    type: "FeatureCollection" as const,
    features: visible ? sectors.flatMap((sector) => sector.polygons.map((polygon) => ({
      type: "Feature" as const,
      properties: {
        id: sector.id,
        name: sector.name,
        service: formatAtcService(sector.service ?? sector.atcCallsign),
        lowerAltitudeFt: sector.lowerAltitudeFt,
        upperAltitudeFt: sector.upperAltitudeFt,
        lowerAltitude: formatAtcLimit(sector.lowerAltitudeFt, sector.lowerAltitudeReference, t.common.unlimited),
        upperAltitude: formatAtcLimit(sector.upperAltitudeFt, sector.upperAltitudeReference, t.common.unlimited),
        primaryFrequency: formatAtcFrequency((sector.frequencies.find((frequency) => frequency.isPrimary) ?? sector.frequencies[0])?.frequencyMhz),
        alternateFrequencies: sector.frequencies.filter((frequency) => !frequency.isPrimary).map((frequency) => formatAtcFrequency(frequency.frequencyMhz)).join(", "),
        source: sector.source,
        sourceReference: sector.sourceReference,
        validFrom: sector.validFrom,
        validTo: sector.validTo,
        lastVerifiedAt: sector.lastVerifiedAt,
        activationStatus: sector.activationStatus ?? "UNKNOWN",
      },
      geometry: { type: "Polygon" as const, coordinates: [polygon] },
    }))) : [],
  };
}
`,
`function createAtcGeoJSON(sectors: AtcSector[], visible: boolean, airspaceActivity: AirspaceActivityResponse | null = null) {
  const planIndex = buildAirspacePlanMapIndex(airspaceActivity);
  return {
    type: "FeatureCollection" as const,
    features: visible ? sectors.flatMap((sector) => {
      const plan = matchAirspacePlanForSector(sector, planIndex);
      const planLabel = plan?.state === "planned-now" ? activityT.plannedNow : plan?.state === "upcoming" ? activityT.upcoming : null;
      return sector.polygons.map((polygon) => ({
        type: "Feature" as const,
        properties: {
          id: sector.id,
          name: sector.name,
          label: planLabel ? \`\${sector.name} · \${planLabel}\` : sector.name,
          service: formatAtcService(sector.service ?? sector.atcCallsign),
          lowerAltitudeFt: sector.lowerAltitudeFt,
          upperAltitudeFt: sector.upperAltitudeFt,
          lowerAltitude: formatAtcLimit(sector.lowerAltitudeFt, sector.lowerAltitudeReference, t.common.unlimited),
          upperAltitude: formatAtcLimit(sector.upperAltitudeFt, sector.upperAltitudeReference, t.common.unlimited),
          primaryFrequency: formatAtcFrequency((sector.frequencies.find((frequency) => frequency.isPrimary) ?? sector.frequencies[0])?.frequencyMhz),
          alternateFrequencies: sector.frequencies.filter((frequency) => !frequency.isPrimary).map((frequency) => formatAtcFrequency(frequency.frequencyMhz)).join(", "),
          source: sector.source,
          sourceReference: sector.sourceReference,
          validFrom: sector.validFrom,
          validTo: sector.validTo,
          lastVerifiedAt: sector.lastVerifiedAt,
          activationStatus: sector.activationStatus ?? "UNKNOWN",
          airspacePlanState: plan?.state ?? "none",
          airspacePlanStale: plan?.stale ?? false,
          airspacePlanSource: plan?.source ?? "",
          airspacePlanSequence: plan?.sequence ?? 0,
          airspacePlanSourceReference: plan?.sourceReference ?? "",
          airspacePlanStartsAt: plan?.startsAt ?? "",
          airspacePlanEndsAt: plan?.endsAt ?? "",
          airspacePlanLowerLimit: plan?.lowerLimit ?? "",
          airspacePlanUpperLimit: plan?.upperLimit ?? "",
          airspacePlanResponsibleUnit: plan?.responsibleUnit ?? "",
          airspacePlanActivity: plan?.activity ?? "",
          airspacePlanDesignator: plan?.canonicalDesignator ?? "",
        },
        geometry: { type: "Polygon" as const, coordinates: [polygon] },
      }));
    }) : [],
  };
}
`,
  "ATC GeoJSON activity enrichment",
);

replaceOnce(
  '  const [atcData, setAtcData] = useState<AtcDataResponse>(EMPTY_ATC_DATA);\n',
  '  const [atcData, setAtcData] = useState<AtcDataResponse>(EMPTY_ATC_DATA);\n  const [airspaceActivity, setAirspaceActivity] = useState<AirspaceActivityResponse | null>(null);\n',
  "activity state",
);

replaceOnce(
  '  const sigmetGenerationRef = useRef(0);\n',
  '  const sigmetGenerationRef = useRef(0);\n  const airspaceActivityRequestedRef = useRef(false);\n',
  "activity request ref",
);

replaceOnce(
`  useEffect(() => {
    if (!showAtsRoutes || atsRoutes) return;
    let active = true;
    void fetch("/api/ats/routes", { cache: "force-cache" })
      .then((response) => response.json() as Promise<AtsRoutesResponse>)
      .then((data) => { if (active) setAtsRoutes(data); })
      .catch(() => { if (active) setAtsRoutes({ available: false }); });
    return () => { active = false; };
  }, [atsRoutes, showAtsRoutes]);
`,
`  useEffect(() => {
    if (!showAtsRoutes || atsRoutes) return;
    let active = true;
    void fetch("/api/ats/routes", { cache: "force-cache" })
      .then((response) => response.json() as Promise<AtsRoutesResponse>)
      .then((data) => { if (active) setAtsRoutes(data); })
      .catch(() => { if (active) setAtsRoutes({ available: false }); });
    return () => { active = false; };
  }, [atsRoutes, showAtsRoutes]);

  useEffect(() => {
    if (!showAtc || airspaceActivityRequestedRef.current) return;
    airspaceActivityRequestedRef.current = true;
    let active = true;
    void fetch("/api/airspace/activity", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<AirspaceActivityResponse> : null)
      .then((data) => { if (active && data) setAirspaceActivity(data); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [showAtc]);
`,
  "activity lazy fetch",
);

replaceOnce(
  '      map.addLayer({ id: "atc-sectors-fill", type: "fill", source: "atc-sectors", layout: { visibility: "none" }, paint: { "fill-color": "#8068ff", "fill-opacity": 0.16 } });\n',
  '      map.addLayer({ id: "atc-sectors-fill", type: "fill", source: "atc-sectors", layout: { visibility: "none" }, paint: { "fill-color": ["match", ["get", "airspacePlanState"], "planned-now", "#f3b95f", "upcoming", "#4fb3d8", "#8068ff"], "fill-opacity": ["match", ["get", "airspacePlanState"], "planned-now", 0.28, "upcoming", 0.1, 0.16] } });\n',
  "ATC fill styling",
);
replaceOnce(
  '      map.addLayer({ id: "atc-sectors-line", type: "line", source: "atc-sectors", layout: { visibility: "none" }, paint: { "line-color": "#c4b5fd", "line-opacity": 0.92, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.3, 8, 2, 13, 3], "line-dasharray": [2, 2] } });\n',
  '      map.addLayer({ id: "atc-sectors-line", type: "line", source: "atc-sectors", layout: { visibility: "none" }, paint: { "line-color": ["match", ["get", "airspacePlanState"], "planned-now", "#ffd27a", "upcoming", "#79cbe8", "#c4b5fd"], "line-opacity": ["match", ["get", "airspacePlanState"], "planned-now", 1, "upcoming", 0.78, 0.92], "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.3, 8, 2, 13, 3], "line-dasharray": [2, 2] } });\n',
  "ATC line styling",
);
replaceOnce(
  '      map.addLayer({ id: "atc-sectors-label", type: "symbol", source: "atc-sectors", minzoom: 6.5, layout: { visibility: "none", "text-field": ["get", "name"], "text-font": ["Open Sans Semibold"], "text-size": 10, "text-offset": [0, 0.8], "text-allow-overlap": false, "text-ignore-placement": false }, paint: { "text-color": "#d7caff", "text-halo-color": "#08111d", "text-halo-width": 1.2 } });\n',
  '      map.addLayer({ id: "atc-sectors-label", type: "symbol", source: "atc-sectors", minzoom: 6.5, layout: { visibility: "none", "text-field": ["get", "label"], "text-font": ["Open Sans Semibold"], "text-size": 10, "text-offset": [0, 0.8], "text-allow-overlap": false, "text-ignore-placement": false }, paint: { "text-color": ["match", ["get", "airspacePlanState"], "planned-now", "#ffe2a6", "upcoming", "#a8dcf0", "#d7caff"], "text-halo-color": "#08111d", "text-halo-width": 1.2 } });\n',
  "ATC label styling",
);

replaceOnce(
`        body.textContent = \`\${t.atc.activation}: \${activation} · \${String(properties.service ?? "")} · \${altitude} · \${t.atc.primaryFrequency}: \${String(properties.primaryFrequency ?? t.common.emptyValue)} · \${t.atc.alternates}: \${String(properties.alternateFrequencies || t.common.emptyValue)} · \${t.atc.source}: \${String(properties.source ?? t.common.emptyValue)} · \${t.atc.sourceReference}: \${String(properties.sourceReference ?? t.common.emptyValue)} · \${t.atc.effectiveDate}: \${String(properties.validFrom ?? t.common.emptyValue)} · \${t.atc.lastVerified}: \${String(properties.lastVerifiedAt ?? t.common.emptyValue)}\`;
        content.append(title, body);
        new maplibregl.Popup({ closeButton: true, maxWidth: "260px" }).setLngLat(event.lngLat).setDOMContent(content).addTo(map);
`,
`        body.textContent = \`\${t.atc.activation}: \${activation} · \${String(properties.service ?? "")} · \${altitude} · \${t.atc.primaryFrequency}: \${String(properties.primaryFrequency ?? t.common.emptyValue)} · \${t.atc.alternates}: \${String(properties.alternateFrequencies || t.common.emptyValue)} · \${t.atc.source}: \${String(properties.source ?? t.common.emptyValue)} · \${t.atc.sourceReference}: \${String(properties.sourceReference ?? t.common.emptyValue)} · \${t.atc.effectiveDate}: \${String(properties.validFrom ?? t.common.emptyValue)} · \${t.atc.lastVerified}: \${String(properties.lastVerifiedAt ?? t.common.emptyValue)}\`;
        content.append(title, body);
        const planState = String(properties.airspacePlanState ?? "none");
        if (planState === "planned-now" || planState === "upcoming") {
          const plan = document.createElement("span");
          const planStatus = planState === "planned-now" ? activityT.plannedNow : activityT.upcoming;
          const staleNote = properties.airspacePlanStale === true ? \` · \${activityT.stale}: \${activityT.staleNote}\` : "";
          const responsibleUnit = properties.airspacePlanResponsibleUnit ? \` · \${activityT.responsibleUnit}: \${String(properties.airspacePlanResponsibleUnit)}\` : "";
          const activity = properties.airspacePlanActivity ? \` · \${activityT.activity}: \${String(properties.airspacePlanActivity)}\` : "";
          plan.textContent = \`\${activityT.plannedAllocation}: \${planStatus} · \${activityT.timeWindow}: \${formatAirspaceUtc(String(properties.airspacePlanStartsAt))}–\${formatAirspaceUtc(String(properties.airspacePlanEndsAt))} · \${activityT.levels}: \${String(properties.airspacePlanLowerLimit)}–\${String(properties.airspacePlanUpperLimit)} · \${activityT.source}: \${String(properties.airspacePlanSource)} #\${String(properties.airspacePlanSequence)}\${responsibleUnit}\${activity}\${staleNote}. \${activityT.disclaimer}\`;
          content.append(plan);
        }
        new maplibregl.Popup({ closeButton: true, maxWidth: "360px" }).setLngLat(event.lngLat).setDOMContent(content).addTo(map);
`,
  "ATC popup plan details",
);

replaceOnce(
  '    atcSource?.setData(createAtcGeoJSON(atcData.sectors, showAtc));\n',
  '    atcSource?.setData(createAtcGeoJSON(atcData.sectors, showAtc, airspaceActivity));\n',
  "ATC source activity data",
);
replaceOnce(
  '  }, [airports, atcData, mapReady, selectedHex, showAtc, snapshot.aircraft]);\n',
  '  }, [airports, airspaceActivity, atcData, mapReady, selectedHex, showAtc, snapshot.aircraft]);\n',
  "ATC effect dependency",
);

replaceOnce(
  '                    <label><input type="checkbox" checked={showAtc} onChange={(event) => setShowAtc(event.target.checked)} /> {t.layers.atc}</label>\n',
  '                    <label><input type="checkbox" checked={showAtc} onChange={(event) => setShowAtc(event.target.checked)} /> {t.layers.atc}</label>\n                    {showAtc && airspaceActivity?.planned.status !== "unavailable" && <div className="map-layer-sublevel">{activityT.legendCurrent} · {activityT.legendUpcoming}{airspaceActivity?.planned.status === "stale" ? ` · ${activityT.stale}` : ""}<br /><small>{activityT.disclaimer}</small></div>}\n',
  "ATC plan legend",
);

writeFileSync(path, source);
console.log(`Patched ${path}`);
