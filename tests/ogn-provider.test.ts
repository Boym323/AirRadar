import { afterEach, describe, expect, it, vi } from "vitest";
import { buildOgnLogin, OgnProvider, type OgnSocketLike } from "@/lib/server/ogn-provider";
import type { OgnConfig } from "@/lib/server/config";
import { OGN_FIXTURES } from "@/tests/fixtures/ogn-packets";

const receiver = { lat: 50.0755, lon: 14.4378, name: "Private receiver" };
const config: OgnConfig = {
  enabled: true, host: "aprs.glidernet.org", port: 14580, radiusKm: 250, connectTimeoutMs: 1_000, handshakeTimeoutMs: 1_000,
  keepaliveMs: 240_000,
  staleAfterMs: 15_000, removeAfterMs: 60_000, maxPacketAgeMs: 120_000, reconnectMinMs: 1_000,
  reconnectMaxMs: 2_000, ddbRefreshMs: 60_000, ddbMaxStaleMs: 86_400_000, ddbUrl: "https://ddb.glidernet.org/download/?j=1&t=1", maxTargets: 5_000, configurationError: null,
};

class FakeSocket implements OgnSocketLike {
  writes: string[] = [];
  destroyed = false;
  private listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  on(event: string, listener: (...args: unknown[]) => void): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  once(event: string, listener: (...args: unknown[]) => void): this {
    const wrapped = (...args: unknown[]) => {
      this.listeners.set(event, (this.listeners.get(event) ?? []).filter((candidate) => candidate !== wrapped));
      listener(...args);
    };
    return this.on(event, wrapped);
  }

  write(data: string): boolean {
    this.writes.push(data);
    return true;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit("close");
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener(...args);
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("OGN APRS provider", () => {
  it("builds the receive-only CRLF login and server-side filter", () => {
    expect(buildOgnLogin(config, receiver)).toBe("user AIRRADAR pass -1 vers AirRadar 1.0.0 filter r/50.0755/14.4378/250 -u/OGADSB\r\n");
  });

  it("frames server comments and aircraft packets without accepting ADS-B", async () => {
    const clock = Date.parse("2026-09-10T10:10:00.000Z");
    const socket = new FakeSocket();
    const positions: unknown[] = [];
    const provider = new OgnProvider({ config, receiver, now: () => clock, random: () => 0.5, socketFactory: () => socket, onPosition: (position) => positions.push(position) });
    provider.start();
    socket.emit("connect");
    expect(socket.writes).toHaveLength(1);
    socket.emit("data", Buffer.from(`# logresp AIRRADAR unverified, server T2\r\n${OGN_FIXTURES.flarm}\r\n${OGN_FIXTURES.adsb}\r\n${OGN_FIXTURES.ground}\r\n${OGN_FIXTURES.weather}\r\n${OGN_FIXTURES.meshtastic}\r\n`));
    expect(positions).toHaveLength(1);
    expect(provider.getDiagnostics()).toMatchObject({ status: "online", loginAcknowledged: true, packets: 5, positionPackets: 1, droppedAdsb: 1, droppedGroundStatus: 2, droppedStatus: 1 });
    expect(provider.getDiagnostics().lastAircraftPacketAt).toBe(new Date(clock).toISOString());
    await provider.stop();
  });

  it("sends only a comment keepalive on the configured interval", async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const provider = new OgnProvider({ config: { ...config, keepaliveMs: 1_000 }, receiver, socketFactory: () => socket });
    provider.start();
    socket.emit("connect");
    await vi.advanceTimersByTimeAsync(999);
    expect(socket.writes).toHaveLength(1);
    socket.emit("data", Buffer.from("# logresp AIRRADAR unverified\r\n"));
    await vi.advanceTimersByTimeAsync(999);
    expect(socket.writes).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(socket.writes).toEqual([expect.stringContaining("user AIRRADAR"), "#keepalive\r\n"]);
    await provider.stop();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(socket.writes).toHaveLength(2);
  });

  it("reconnects with bounded exponential delay and stops cleanly", async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const provider = new OgnProvider({ config, receiver, random: () => 0.5, socketFactory: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; } });
    provider.start();
    sockets[0].emit("connect");
    sockets[0].emit("data", Buffer.from("# logresp AIRRADAR verified\r\n"));
    sockets[0].emit("close");
    expect(provider.getDiagnostics()).toMatchObject({ status: "reconnecting", reconnects: 1 });
    await vi.advanceTimersByTimeAsync(config.reconnectMinMs);
    expect(sockets).toHaveLength(2);
    await provider.stop();
    await vi.advanceTimersByTimeAsync(config.reconnectMaxMs + 1_000);
    expect(sockets).toHaveLength(2);
  });

  it("accepts an unverified receive-only login and starts keepalive only after acknowledgement", async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const provider = new OgnProvider({ config: { ...config, keepaliveMs: 1_000 }, receiver, socketFactory: () => socket });
    provider.start();
    socket.emit("connect");
    await vi.advanceTimersByTimeAsync(config.handshakeTimeoutMs - 1);
    expect(provider.getDiagnostics()).toMatchObject({ status: "connecting", loginAcknowledged: false });
    socket.emit("data", Buffer.from("# logresp AIRRADAR unverified, server GLIDERN3/2\r\n"));
    expect(provider.getDiagnostics()).toMatchObject({ status: "online", loginAcknowledged: true });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(socket.writes.at(-1)).toBe("#keepalive\r\n");
    await provider.stop();
  });

  it("destroys a silently connected socket and uses the normal reconnect path", async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const provider = new OgnProvider({ config, receiver, random: () => 0.5, socketFactory: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; } });
    provider.start();
    sockets[0].emit("connect");
    await vi.advanceTimersByTimeAsync(config.handshakeTimeoutMs);
    expect(sockets[0].destroyed).toBe(true);
    expect(provider.getDiagnostics()).toMatchObject({ status: "reconnecting", loginAcknowledged: false, reconnects: 1 });
    await vi.advanceTimersByTimeAsync(config.reconnectMinMs);
    expect(sockets).toHaveLength(2);
    await provider.stop();
  });

  it("ignores a late acknowledgement from an invalidated socket", async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const provider = new OgnProvider({ config, receiver, random: () => 0.5, socketFactory: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; } });
    provider.start();
    const first = sockets[0];
    first.emit("connect");
    await vi.advanceTimersByTimeAsync(config.handshakeTimeoutMs);
    await vi.advanceTimersByTimeAsync(config.reconnectMinMs);
    const second = sockets[1];
    first.emit("data", Buffer.from("# logresp AIRRADAR unverified\r\n"));
    expect(provider.getDiagnostics()).toMatchObject({ status: "connecting", loginAcknowledged: false });
    second.emit("connect");
    expect(second.writes).toHaveLength(1);
    await provider.stop();
  });

  it("cancels the handshake timer and does not reconnect during shutdown", async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const provider = new OgnProvider({ config, receiver, random: () => 0.5, socketFactory: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; } });
    provider.start();
    sockets[0].emit("connect");
    await provider.stop();
    await vi.advanceTimersByTimeAsync(config.handshakeTimeoutMs + config.reconnectMaxMs + 1_000);
    expect(sockets).toHaveLength(1);
    expect(sockets[0].destroyed).toBe(true);
    expect(provider.getDiagnostics()).toMatchObject({ status: "offline", loginAcknowledged: false });
  });

  it("reconnects after an explicit login rejection", async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const provider = new OgnProvider({ config, receiver, random: () => 0.5, socketFactory: () => socket });
    provider.start();
    socket.emit("connect");
    socket.emit("data", Buffer.from("# logresp AIRRADAR invalid\r\n"));
    expect(socket.destroyed).toBe(true);
    expect(provider.getDiagnostics()).toMatchObject({ status: "reconnecting", loginAcknowledged: false, reconnects: 1 });
    await provider.stop();
  });
});
