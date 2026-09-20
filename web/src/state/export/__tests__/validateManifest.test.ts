import { describe, expect, it } from "vitest";
import { validateManifest } from "../validateManifest";
import { CURRENT_SCHEMA_VERSION } from "../legacyKinds";

const baseManifest = {
  version: "1.1" as const,
  exportedAt: Date.now(),
  schemaVersion: CURRENT_SCHEMA_VERSION,
  counts: {
    notes: 1,
    frames: 0,
    boards: 1,
    connections: 0,
    embeddings: 0,
  },
  scope: "all" as const,
};

describe("validateManifest", () => {
  it("schemaVersion 5 통과", () => {
    const r = validateManifest(baseManifest);
    expect(r.ok).toBe(true);
  });

  it("schemaVersion 4 거부", () => {
    const r = validateManifest({ ...baseManifest, schemaVersion: 4 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("schema_too_old");
  });

  it("schemaVersion 6 거부", () => {
    const r = validateManifest({ ...baseManifest, schemaVersion: 6 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("schema_too_new");
  });

  it("schemaVersion 숫자 아님 거부", () => {
    const r = validateManifest({ ...baseManifest, schemaVersion: "5" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_schema_version");
  });

  it("manifest 없음(null) 거부", () => {
    const r = validateManifest(null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("manifest_not_found");
  });

  it("version 1.0 거부", () => {
    const r = validateManifest({ ...baseManifest, version: "1.0" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_version");
  });
});
