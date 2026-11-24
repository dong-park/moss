import { readFileSync } from "node:fs";

/** Build input copied into the image; runtime environment cannot relabel it. */
export function readBuildSha(): string | undefined {
  try {
    return readFileSync(new URL("../.build-sha", import.meta.url), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
