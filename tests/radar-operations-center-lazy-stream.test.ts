import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../components/radar/radar-operations-center.tsx", import.meta.url), "utf8");
const stream = readFileSync(new URL("../components/use-intelligence-stream.ts", import.meta.url), "utf8");

describe("Operations Center lazy intelligence subscription", () => {
  it("only subscribes after the existing open state is enabled", () => {
    expect(source).toContain("const [open, setOpen] = useState(false);");
    expect(source).toContain("useIntelligenceStream(open)");
    expect(source).not.toContain("useIntelligenceStream();");
  });
  it("retains abort/cleanup and SSE event stream when enabled", () => {
    expect(stream).toContain("if (!enabled) return;");
    expect(stream).toContain('new EventSource("/api/intelligence/stream")');
    expect(stream).toContain('fetch("/api/intelligence/events?limit=12"');
    expect(stream).toContain("controller.abort()");
    expect(stream).toContain("source.close()");
  });
});
