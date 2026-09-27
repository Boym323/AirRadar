export const AIRRADAR_MAP_THEME = {
  background: "#0b1725",
  outline: "#08111d",
  accent: "#43d8c2",
  selected: "#f5bd62",
  weather: "#66b9ff",
  airspace: "#b39bff",
  muted: "#9da9b5",
  metar: {
    vfr: "#43d8c2",
    mvfr: "#f5bd62",
    ifr: "#ef8f6b",
    lifr: "#dd6b93",
    unknown: "#9da9b5",
  },
} as const;

export type AirRadarMapTheme = typeof AIRRADAR_MAP_THEME;
