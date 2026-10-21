/** Compatibility contract for retired alert status in public/system health. */
export interface AlertStatus {
  status: "ok" | "disabled" | "error";
  enabled: boolean;
  notifier: string;
  ruleCount: number;
}
