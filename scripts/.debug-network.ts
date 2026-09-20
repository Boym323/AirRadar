import { createNetworkFailoverProvider } from "@/lib/server/network-failover-provider";
import { AdsbLolProvider } from "@/lib/server/adsblol-provider";

const provider = createNetworkFailoverProvider(
  { lat: 49.1653225, lon: 17.8778464, name: "debug" },
  true,
);
const direct = new AdsbLolProvider(
  { lat: 49.1653225, lon: 17.8778464, name: "debug" },
  { enabled: true },
);
direct.start();
const directSnapshot = await direct.getSnapshot();
console.log(JSON.stringify({ directCount: directSnapshot.aircraft.length, directTarget: directSnapshot.aircraft.find((item) => item.icaoHex === "49F0C5") ?? null, directDiagnostics: direct.getDiagnostics() }, null, 2));
await direct.stop();
provider.start();
await new Promise((resolve) => setTimeout(resolve, 1000));
const snapshot = await provider.getSnapshot();
console.log(JSON.stringify({
  count: snapshot.aircraft.length,
  target: snapshot.aircraft.find((item) => item.icaoHex === "49F0C5") ?? null,
  diagnostics: provider.getDiagnostics(),
}, null, 2));
await provider.stop();
