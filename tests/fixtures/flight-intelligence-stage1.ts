export const HOLDING_TRAJECTORY = [
  [50.10, 14.30, 0], [50.12, 14.30, 45], [50.12, 14.34, 90],
  [50.10, 14.34, 135], [50.08, 14.30, 180], [50.08, 14.26, 225],
  [50.10, 14.26, 270], [50.12, 14.30, 315], [50.10, 14.30, 0],
] as const;

export const LARGE_VECTORING_TURN = [
  [50.00, 14.00, 0], [50.10, 14.00, 90], [50.20, 14.10, 180],
  [50.20, 14.20, 270], [50.10, 14.30, 0], [50.00, 14.30, 90],
] as const;

export const LEVEL_OFF_SEQUENCE = [
  { altitude: 5_000, verticalRate: 800 },
  { altitude: 6_000, verticalRate: 800 },
  { altitude: 7_000, verticalRate: 800 },
  { altitude: 7_050, verticalRate: 0 },
  { altitude: 7_050, verticalRate: 0 },
] as const;
