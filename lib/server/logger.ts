import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL?.trim() || "info",
  base: { service: "airradar" },
  redact: ["req.headers.authorization", "apiKey", "token", "password"],
});
