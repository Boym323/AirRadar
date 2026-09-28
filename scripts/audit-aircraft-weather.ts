import { mkdir, writeFile } from "node:fs/promises";
import { collectAircraftWeatherQualityReport } from "@/lib/server/aircraft-weather-quality";

const report = await collectAircraftWeatherQualityReport();
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/aircraft-weather-quality.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
