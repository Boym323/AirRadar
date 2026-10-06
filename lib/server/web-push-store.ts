import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getRuntimeStatePath } from "@/lib/server/runtime-state";

export interface WebPushSubscription {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
  updatedAt: string;
}

const MAX_SUBSCRIPTIONS = 256;
const path = () => getRuntimeStatePath("web-push-subscriptions-v1.json");

function valid(value: unknown): value is WebPushSubscription {
  const item = value as Partial<WebPushSubscription> | null;
  return Boolean(item && typeof item.endpoint === "string" && item.endpoint.startsWith("https://")
    && item.keys && typeof item.keys.p256dh === "string" && typeof item.keys.auth === "string");
}

export async function listWebPushSubscriptions(): Promise<WebPushSubscription[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path(), "utf8"));
    return Array.isArray(parsed) ? parsed.filter(valid).slice(-MAX_SUBSCRIPTIONS) : [];
  } catch { return []; }
}

export async function saveWebPushSubscription(input: Omit<WebPushSubscription, "updatedAt">): Promise<void> {
  const subscriptions = (await listWebPushSubscriptions()).filter((item) => item.endpoint !== input.endpoint);
  subscriptions.push({ ...input, updatedAt: new Date().toISOString() });
  const next = subscriptions.slice(-MAX_SUBSCRIPTIONS);
  const target = path();
  const temp = `${target}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(temp, JSON.stringify(next), { mode: 0o600 });
  await rename(temp, target);
}

export async function removeWebPushSubscription(endpoint: string): Promise<void> {
  const next = (await listWebPushSubscriptions()).filter((item) => item.endpoint !== endpoint);
  const target = path();
  const temp = `${target}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(temp, JSON.stringify(next), { mode: 0o600 });
  await rename(temp, target);
}
