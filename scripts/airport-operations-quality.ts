import { mkdir, writeFile } from "node:fs/promises";
import { analyzeAirportMovement, type MovementFlight, type MovementPosition } from "@/lib/server/airport-movements";

const airport = { icaoCode: "LKPR", latitude: 50, longitude: 14, elevationFt: 1_200 };
const runways = [{ id: 1, airportId: 1, sourceAirportIdent: "LKPR", lengthFt: 10_000, widthFt: 150, surface: "ASP", lighted: true, closed: false, leIdent: "06", leLatitude: 50.001, leLongitude: 13.99, leElevationFt: 1_200, leHeadingDegT: 60, leDisplacedThresholdFt: null, heIdent: "24", heLatitude: 50.001, heLongitude: 14.01, heElevationFt: 1_200, heHeadingDegT: 240, heDisplacedThresholdFt: null }];
const point = (at: number, lat: number, lon: number, altitude: number, track: number, verticalRate: number): MovementPosition => ({ recordedAt: new Date(at).toISOString(), lat, lon, altitude, groundSpeed: 140, track, verticalRate });
const scenarios: Array<{ name: string; flight: MovementFlight }> = [
  { name: "straight-final", flight: { id: 1, icaoHex: "SYN001", callsign: "SYN001", registration: null, positions: [point(0, 50.08, 14.3, 7_000, 240, -500), point(120_000, 50.03, 14.08, 3_000, 240, -600), point(240_000, 50.001, 14.01, 1_400, 240, -300)] } },
  { name: "departure", flight: { id: 2, icaoHex: "SYN002", callsign: "SYN002", registration: null, positions: [point(0, 50.001, 14.01, 1_250, 240, 100), point(120_000, 49.98, 13.95, 3_000, 240, 700), point(240_000, 49.94, 13.88, 6_000, 240, 800)] } },
  { name: "overflight", flight: { id: 3, icaoHex: "SYN003", callsign: "SYN003", registration: null, positions: [point(0, 50, 13.8, 22_000, 90, 0), point(120_000, 50, 14, 22_000, 90, 0), point(240_000, 50, 14.2, 22_000, 90, 0)] } },
];
const movements = scenarios.map(({ name, flight }) => ({ name, result: analyzeAirportMovement(flight, airport, runways) }));
const classified = movements.filter(({ result }) => result !== null).map(({ result }) => result!);
const confidence = Object.fromEntries(["high", "medium", "low"].map((level) => [level, classified.filter((item) => item.confidence === level).length]));
const report = {
  generatedAt: new Date().toISOString(), source: "deterministic synthetic scenarios", airportsObserved: 1,
  movementCandidates: scenarios.length, movements: classified.length, movementCounts: Object.fromEntries([...new Set(classified.map((item) => item.movement))].map((kind) => [kind, classified.filter((item) => item.movement === kind).length])),
  confidence, runwayInferenceCoverage: classified.length ? classified.filter((item) => item.runway !== null).length / classified.length : 0,
  runwayConfidence: Object.fromEntries(["high", "medium", "low"].map((level) => [level, classified.filter((item) => item.runway?.confidence === level).length])), unknownAmbiguousRate: (scenarios.length - classified.length) / scenarios.length,
  goArounds: classified.filter((item) => item.movement === "GO_AROUND").length, holding: classified.filter((item) => item.movement === "HOLDING").length,
  dataSourceCoverage: { position: scenarios.length, runway: scenarios.length, route: 0, metar: 0 }, scenarios: movements.map(({ name, result }) => ({ name, movement: result?.movement ?? "UNKNOWN", confidence: result?.confidence ?? null })),
};
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/airport-operations-quality.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
