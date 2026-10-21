import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { getRuntimeStatePath } from "@/lib/server/runtime-state";

export interface WebPushSubscription {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
  updatedAt: string;
}

const MAX_SUBSCRIPTIONS = 256;
const MAX_ENDPOINT_LENGTH = 2_048;
const MAX_KEY_LENGTH = 256;
const path = () => getRuntimeStatePath("web-push-subscriptions-v1.json");
let writeQueue: Promise<void> = Promise.resolve();

function valid(value: unknown): value is WebPushSubscription {
  const item = value as Partial<WebPushSubscription> | null;
  return Boolean(item && validEndpoint(item.endpoint)
    && item.keys && validKey(item.keys.p256dh) && validKey(item.keys.auth)
    && (item.expirationTime === null
      || typeof item.expirationTime === "number" && Number.isFinite(item.expirationTime) && item.expirationTime > 0));
}

function validEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_ENDPOINT_LENGTH) return false;
  try {
    const endpoint = new URL(value);
    return endpoint.protocol === "https:" && !endpoint.username && !endpoint.password;
  } catch { return false; }
}

function validKey(value: unknown): value is string {
  return typeof value === "string" && value.length >= 16 && value.length <= MAX_KEY_LENGTH && /^[A-Za-z0-9_-]+$/.test(value);
}

export function parseWebPushSubscriptionInput(value: unknown): Omit<WebPushSubscription, "updatedAt"> | null {
  if (!value || typeof value !== "object") return null;
  const item = value as { endpoint?: unknown; expirationTime?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (!validEndpoint(item.endpoint) || !item.keys || !validKey(item.keys.p256dh) || !validKey(item.keys.auth)) return null;
  const expirationTime = item.expirationTime === undefined || item.expirationTime === null ? null : item.expirationTime;
  if (expirationTime !== null && (typeof expirationTime !== "number" || !Number.isFinite(expirationTime) || expirationTime <= 0)) return null;
  return { endpoint: item.endpoint, expirationTime, keys: { p256dh: item.keys.p256dh, auth: item.keys.auth } };
}

async function serializeWrite<T>(operation: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(operation, operation);
  writeQueue = next.then(() => undefined, () => undefined);
  return next;
}

async function replaceSubscriptions(subscriptions: WebPushSubscription[]): Promise<void> {
  const target = path();
  const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  try {
    const file = await open(temp, "wx", 0o600);
    try { await file.writeFile(JSON.stringify(subscriptions)); }
    finally { await file.close(); }
    await rename(temp, target);
  } finally {
    await rm(temp, { force: true }).catch(() => undefined);
  }
}

export async function listWebPushSubscriptions(): Promise<WebPushSubscription[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path(), "utf8"));
    return Array.isArray(parsed) ? parsed.filter(valid).slice(-MAX_SUBSCRIPTIONS) : [];
  } catch { return []; }
}

export async function saveWebPushSubscription(input: Omit<WebPushSubscription, "updatedAt">): Promise<void> {
  const parsed = parseWebPushSubscriptionInput(input);
  if (!parsed) throw new TypeError("Invalid Web Push subscription");
  await serializeWrite(async () => {
    const subscriptions = (await listWebPushSubscriptions()).filter((item) => item.endpoint !== parsed.endpoint);
    subscriptions.push({ ...parsed, updatedAt: new Date().toISOString() });
    await replaceSubscriptions(subscriptions.slice(-MAX_SUBSCRIPTIONS));
  });
}

export async function removeWebPushSubscription(endpoint: string): Promise<void> {
  if (!validEndpoint(endpoint)) throw new TypeError("Invalid Web Push endpoint");
  await serializeWrite(async () => {
    const next = (await listWebPushSubscriptions()).filter((item) => item.endpoint !== endpoint);
    await replaceSubscriptions(next);
  });
}
