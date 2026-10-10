import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({ io: vi.fn() }));
vi.mock("socket.io-client", () => ({ io: transport.io }));

import { RxwHubService, resolveRxwHubEndpoint } from "@/lib/server/rxw-hub-service";

const now = Date.now();
const wireMessage = (uid: string, extra: Record<string, unknown> = {}) => ({
  msghtml: {
    uid,
    timestamp: now / 1000,
    icao_hex: "4ca123",
    station_id: "RXW",
    message_type: "VDL-M2",
    freq: 136.975,
    text: "SENSITIVE CONTENT",
    ...extra,
  },
});

type Handler = (payload?: unknown) => void;

function fakeSocket() {
  const handlers = new Map<string, Handler>();
  const socket = {
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, handler);
      return socket;
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
    removeAllListeners: vi.fn(),
  };
  return { handlers, socket };
}

beforeEach(() => {
  process.env.RXW_HUB_ENABLED = "false";
  delete process.env.RXW_HUB_URL;
  transport.io.mockReset();
});

afterEach(() => {
  delete process.env.RXW_HUB_ENABLED;
  delete process.env.RXW_HUB_URL;
});

describe("RXW Hub adapter", () => {
  it("is disabled by default and opens no connection", () => {
    const hub = new RxwHubService();
    hub.start();
    expect(transport.io).not.toHaveBeenCalled();
    expect(hub.getSnapshot("4CA123")).toMatchObject({ enabled: false, connection: "disabled", messages: [] });
    hub.stop();
  });

  it("consumes live and reconnect batch events without exposing their content", () => {
    process.env.RXW_HUB_ENABLED = "true";
    const { socket, handlers } = fakeSocket();
    transport.io.mockReturnValue(socket);
    const hub = new RxwHubService();
    hub.start();
    expect(transport.io).toHaveBeenCalledWith("https://hub.rxw.cz/main",
      expect.objectContaining({ path: "/socket.io", autoConnect: false, transports: ["websocket"] }));
    expect(socket.connect).toHaveBeenCalledTimes(1);
    handlers.get("connect")?.();
    handlers.get("acars_msg")?.(wireMessage("one"));
    handlers.get("acars_msg_batch")?.({ messages: [wireMessage("one").msghtml, wireMessage("two").msghtml] });
    handlers.get("acars_msg")?.(wireMessage("wrong", { icao_hex: "~4ca123" }));

    const snapshot = hub.getSnapshot("4CA123");
    expect(snapshot.connection).toBe("connected");
    expect(snapshot.messages).toHaveLength(2);
    expect(snapshot.lastReceivedAt).not.toBeNull();
    expect(JSON.stringify(snapshot)).not.toContain("SENSITIVE CONTENT");
    expect(hub.getSnapshot("~4CA123").messages).toEqual([]);
    hub.stop();
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(hub.getSnapshot("4CA123").messages).toEqual([]);
  });

  it("fails closed on invalid endpoints without opening any network connection", () => {
    process.env.RXW_HUB_ENABLED = "true";
    process.env.RXW_HUB_URL = "http://127.0.0.1:3000";
    expect(resolveRxwHubEndpoint()).toBeNull();
    const hub = new RxwHubService();
    hub.start();
    expect(transport.io).not.toHaveBeenCalled();
    expect(hub.getSnapshot("4CA123").connection).toBe("error");
    hub.stop();
  });
});
