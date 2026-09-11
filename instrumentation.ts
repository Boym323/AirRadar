export function shouldRegisterInstrumentation(
  runtime = process.env.NEXT_RUNTIME,
  phase = process.env.NEXT_PHASE,
): boolean {
  return runtime === "nodejs" && phase !== "phase-production-build";
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    await import("./instrumentation.node");
  }
}
