export function shouldRegisterInstrumentation(
  runtime = process.env.NEXT_RUNTIME,
  phase = process.env.NEXT_PHASE,
): boolean {
  return runtime === "nodejs" && phase !== "phase-production-build";
}

export async function register(): Promise<void> {
  if (!shouldRegisterInstrumentation()) return;
  const { registerShutdownCoordinator } = await import("@/lib/server/shutdown");
  registerShutdownCoordinator();
}
