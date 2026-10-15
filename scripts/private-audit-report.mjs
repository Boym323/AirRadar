import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";

const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_MARKDOWN_BYTES = 128 * 1024;

/**
 * Audit inputs must already be projected to a bounded aggregate-only schema.
 * The destination is an explicit local operator path, never a network value.
 * Do not overwrite/symlink-follow existing reports; make both files private.
 */
export async function writePrivateAuditReport(output, report, markdown) {
  if (typeof output !== "string" || output.length > 2048 ||
      !isAbsolute(output) || !output.endsWith(".json") || output.includes("\0")) {
    throw new Error("private_audit_output_path_required");
  }
  if (typeof markdown !== "string") throw new Error("invalid_private_audit_markdown");
  const json = JSON.stringify(report, null, 2) + "\n";
  const md = markdown.endsWith("\n") ? markdown : markdown + "\n";
  if (Buffer.byteLength(json) > MAX_JSON_BYTES || Buffer.byteLength(md) > MAX_MARKDOWN_BYTES) {
    throw new Error("private_audit_report_too_large");
  }

  const mdPath = output.slice(0, -5) + ".md";
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  let wroteJson = false;
  try {
    await writeFile(output, json, { flag: "wx", mode: 0o600 });
    wroteJson = true;
    await writeFile(mdPath, md, { flag: "wx", mode: 0o600 });
    // Mode is set on create, not corrected after exposing sensitive data.
    // The size checks bound resource usage even under unusual source metrics.
    const [jsonStats, mdStats] = await Promise.all([stat(output), stat(mdPath)]);
    if (!jsonStats.isFile() || !mdStats.isFile()) throw new Error("invalid_private_audit_target");
  } catch (error) {
    if (wroteJson) {
      try { await unlink(output); } catch { /* retain original error */ }
    }
    throw error;
  }
  return mdPath;
}
