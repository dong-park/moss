import { CURRENT_SCHEMA_VERSION } from "./legacyKinds";
import type { MossBundleManifest, ValidateManifestResult } from "./types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function hasValidCounts(counts: unknown): boolean {
  if (!isRecord(counts)) return false;
  const keys = ["notes", "frames", "boards", "connections", "embeddings"] as const;
  return keys.every((k) => typeof counts[k] === "number" && Number.isFinite(counts[k]!));
}

/**
 * manifest.json 검증 — DB·파일시스템 없이 단위 테스트 가능 (spec §6).
 */
export function validateManifest(raw: unknown): ValidateManifestResult {
  if (!isRecord(raw)) {
    return { ok: false, reason: "manifest_not_found" };
  }

  if (raw.version !== "1.1") {
    return { ok: false, reason: "invalid_version" };
  }

  const schemaVersion = raw.schemaVersion;
  if (typeof schemaVersion !== "number" || !Number.isFinite(schemaVersion)) {
    return { ok: false, reason: "invalid_schema_version" };
  }

  if (schemaVersion < CURRENT_SCHEMA_VERSION) {
    return { ok: false, reason: "schema_too_old" };
  }
  if (schemaVersion > CURRENT_SCHEMA_VERSION) {
    return { ok: false, reason: "schema_too_new" };
  }

  if (typeof raw.exportedAt !== "number" || !Number.isFinite(raw.exportedAt)) {
    return { ok: false, reason: "invalid_structure" };
  }

  if (!hasValidCounts(raw.counts)) {
    return { ok: false, reason: "invalid_structure" };
  }

  const scope = raw.scope;
  if (scope !== "all" && scope !== "board" && scope !== "selection") {
    return { ok: false, reason: "invalid_structure" };
  }

  return { ok: true, manifest: raw as unknown as MossBundleManifest };
}
