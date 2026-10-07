import type { SpotterSkyStory } from "@/lib/spotter-story";

export interface SpotterShareCardInput {
  story: SpotterSkyStory;
  generatedAt: string;
  locale?: string;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function text(value: string | null | undefined, fallback = "—"): string {
  return escapeXml(value?.trim() || fallback);
}

function km(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(value < 10 ? 1 : 0) + " km";
}

function altitude(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : Math.round(value).toLocaleString("en-US") + " ft";
}

function timeLabel(value: string, locale: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Prague",
  }).format(new Date(ms));
}

export function buildSpotterShareCardSvg(input: SpotterShareCardInput): string {
  const locale = input.locale?.startsWith("cs") ? "cs-CZ" : "en-GB";
  const story = input.story;
  const route = story.origin || story.destination
    ? `${text(story.origin)} → ${text(story.destination)}`
    : "Route unavailable";
  const title = text(story.identity);
  const subtitle = [story.operator, story.aircraftType, story.registration].filter(Boolean).map((value) => text(value)).join(" · ");
  const pass = km(story.closestApproachKm);
  const alt = altitude(story.altitudeFt);
  const score = Math.round(story.interest.score);
  const when = escapeXml(timeLabel(input.generatedAt, locale));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" role="img" aria-label="AirRadar Spotter share card">
  <rect width="1080" height="1350" fill="#0b0d10"/>
  <rect x="64" y="64" width="952" height="1222" rx="44" fill="#11151a" stroke="#2b3138" stroke-width="2"/>
  <text x="112" y="144" fill="#8e99a7" font-family="Arial, sans-serif" font-size="30" font-weight="700" letter-spacing="4">AIRRADAR · MY SKY</text>
  <text x="112" y="270" fill="#ffffff" font-family="Arial, sans-serif" font-size="98" font-weight="800">${title}</text>
  <text x="112" y="330" fill="#b8c0cb" font-family="Arial, sans-serif" font-size="32">${subtitle || "LOCAL observation"}</text>

  <rect x="112" y="402" width="856" height="184" rx="28" fill="#0b0d10" stroke="#2b3138"/>
  <text x="152" y="474" fill="#8e99a7" font-family="Arial, sans-serif" font-size="25" font-weight="700">ROUTE</text>
  <text x="152" y="548" fill="#ffffff" font-family="Arial, sans-serif" font-size="56" font-weight="800">${route}</text>

  <text x="112" y="694" fill="#8e99a7" font-family="Arial, sans-serif" font-size="25" font-weight="700">CLOSEST PASS</text>
  <text x="112" y="770" fill="#ffffff" font-family="Arial, sans-serif" font-size="64" font-weight="800">${pass}</text>

  <text x="572" y="694" fill="#8e99a7" font-family="Arial, sans-serif" font-size="25" font-weight="700">ALTITUDE</text>
  <text x="572" y="770" fill="#ffffff" font-family="Arial, sans-serif" font-size="64" font-weight="800">${alt}</text>

  <text x="112" y="900" fill="#8e99a7" font-family="Arial, sans-serif" font-size="25" font-weight="700">INTEREST</text>
  <text x="112" y="976" fill="#ffffff" font-family="Arial, sans-serif" font-size="64" font-weight="800">${score}/100</text>

  <text x="572" y="900" fill="#8e99a7" font-family="Arial, sans-serif" font-size="25" font-weight="700">OBSERVED</text>
  <text x="572" y="976" fill="#ffffff" font-family="Arial, sans-serif" font-size="32" font-weight="700">${when}</text>

  <line x1="112" y1="1084" x2="968" y2="1084" stroke="#2b3138"/>
  <text x="112" y="1160" fill="#b8c0cb" font-family="Arial, sans-serif" font-size="30">${text(story.aircraftDescription, story.manufacturer ?? "Aircraft")}</text>
  <text x="112" y="1220" fill="#8e99a7" font-family="Arial, sans-serif" font-size="24">Observed from LOCAL AirRadar traffic · airradar.pomykal.cz</text>
</svg>`;
}

export function spotterShareFilename(story: Pick<SpotterSkyStory, "identity">): string {
  const safe = story.identity.toUpperCase().replace(/[^A-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "AIRCRAFT";
  return `airradar-${safe}-spotter.svg`;
}
