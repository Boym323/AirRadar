/** One-shot CI A/B for the V1 prepared-ATC ring scanline optimization. */
import { runV1AtcLatitudeIndexBenchmark } from "./benchmark-atc-ring-stalls";

const result = await runV1AtcLatitudeIndexBenchmark();
console.log(JSON.stringify(result, null, 2));
if (result && typeof result === "object" && "mismatches" in result && result.mismatches !== 0) {
  process.exitCode = 1;
}
