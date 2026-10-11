import { describe, expect, it } from "vitest";
import { mqttConnectPacket, mqttSubscribePacket, mqttPubAck, mqttPublishPayload, splitMqttPackets, readAuthorizedSondeMqttUrl } from "@/lib/server/sondehub-mqtt";

function framePublish(topic: string, data: string): Uint8Array {
  const t = new TextEncoder().encode(topic);
  const d = new TextEncoder().encode(data);
  const body = Uint8Array.of(t.length >> 8, t.length & 255, ...t, ...d);
  const length: number[] = [];
  let n = body.length;
  do { let part = n % 128; n = Math.floor(n / 128); if (n > 0) part |= 128; length.push(part); } while(n > 0);
  return Uint8Array.of(0x30, ...length, ...body);
}
describe("SondeHub MQTT 3.1.1 batch protocol", () => {
  it("builds clean-session CONNECT and QoS0 batch SUBSCRIBE", () => {
    const connect = mqttConnectPacket("airradar-test123");
    const subscribe = mqttSubscribePacket();
    expect(connect[0]).toBe(0x10);
    expect([...connect].slice(2, 8)).toEqual([0, 4, 77, 81, 84, 84]);
    expect(subscribe[0]).toBe(0x82);
    expect(new TextDecoder().decode(subscribe)).toContain("batch");
    expect([...mqttPubAck(12, 27)]).toEqual([0x40, 2, 12, 27]);
  });
  it("accepts partial and joined websocket frames, preserves topic", () => {
    const p = framePublish("batch", '{"serial":"EXAMPLE"}');
    const first = splitMqttPackets(p.slice(0, 3));
    expect(first.packets).toHaveLength(0);
    const next = new Uint8Array(first.remainder.length + p.length - 3);
    next.set(first.remainder); next.set(p.slice(3), first.remainder.length);
    const result = splitMqttPackets(next);
    expect(result.packets).toHaveLength(1);
    expect(result.remainder.length).toBe(0);
    expect(mqttPublishPayload(result.packets[0])?.topic).toBe("batch");
    expect(new TextDecoder().decode(mqttPublishPayload(result.packets[0])?.data)).toContain("EXAMPLE");
    const combined = new Uint8Array(p.length*2);
    combined.set(p);combined.set(p,p.length);
    expect(splitMqttPackets(combined).packets).toHaveLength(2);
  });
  it("bounds signed WSS URL transport and rejects untrusted websocket destinations", async () => {
    const url = "wss://abc-ats.iot.eu-central-1.amazonaws.com/mqtt?X-Amz-Signature=example";
    await expect(readAuthorizedSondeMqttUrl(new Response(url))).resolves.toBe(url);
    await expect(readAuthorizedSondeMqttUrl(new Response(url, {
      headers: { "content-length": "999999" },
    }))).rejects.toThrow(/oversized/i);
    await expect(readAuthorizedSondeMqttUrl(new Response(url, {
      headers: { "content-length": "bogus" },
    }))).rejects.toThrow(/oversized/i);
    await expect(readAuthorizedSondeMqttUrl(new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4096));
        controller.enqueue(Uint8Array.of(65));
        controller.close();
      },
    })))).rejects.toThrow(/oversized/i);
    for (const bad of [
      "ws://abc-ats.iot.eu-central-1.amazonaws.com/mqtt",
      "wss://fake-iot.example.com/mqtt",
      "wss://abc-ats.iot.eu-central-1.amazonaws.com/other",
      "wss://user:secret@abc-ats.iot.eu-central-1.amazonaws.com/mqtt",
      "wss://abc-ats.iot.eu-central-1.amazonaws.com/mqtt#fragment",
    ]) await expect(readAuthorizedSondeMqttUrl(new Response(bad))).rejects.toThrow();
  });
  it("fails closed on oversized packets", () => {
    expect(() => splitMqttPackets(Uint8Array.of(0x30, 0xff, 0xff, 0x7f))).toThrow();
  });
});
