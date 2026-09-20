import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetDB } from "@/state/db/schema";
import { useStorage } from "@/state/storage";
import {
  ExportEmptyError,
  exportFilename,
  useExportStore,
} from "@/state/exportStore";

beforeEach(async () => {
  await resetDB();
  await useStorage.getState().init();
  useExportStore.setState({ exporting: false, importing: false, progress: null });
});

afterEach(async () => {
  await resetDB();
});

describe("useExportStore", () => {
  it("notes 0개면 ExportEmptyError", async () => {
    await expect(
      useExportStore.getState().runExport({ scope: "all", format: "moss" }),
    ).rejects.toBeInstanceOf(ExportEmptyError);
  });

  it("exportFilename — 포맷별 확장자", () => {
    expect(exportFilename("moss", "all")).toMatch(/\.moss\.zip$/);
    expect(exportFilename("markdown", "board")).toMatch(/\.zip$/);
  });
});
