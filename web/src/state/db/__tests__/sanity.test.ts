import { describe, expect, it } from "vitest";

describe("vitest sanity", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });

  it("has fake IndexedDB available", () => {
    expect(typeof indexedDB).toBe("object");
    expect(indexedDB).not.toBeNull();
  });
});
