import { expect, it, vi } from "vitest";
import { fillLinkMemo } from "../linkMemo";
import { fetchLinkPreview, type LinkContent } from "@/state/cardContent";
import { useWorkspace, type Card } from "@/state/workspace";
vi.mock("@/state/cardContent", async (original) => ({ ...await original<typeof import("@/state/cardContent")>(), fetchLinkPreview: vi.fn() }));
it("an obsolete A→B→A preview cannot write while the latest A preview is pending", async () => {
  useWorkspace.setState({ cards: [{ id: "a", kind: "text", x: 0, y: 0, width: 240, content: "" } as Card] });
  let obsolete!: (meta: LinkContent | null) => void;
  let latest!: (meta: LinkContent | null) => void;
  vi.mocked(fetchLinkPreview)
    .mockReturnValueOnce(new Promise(r => { obsolete = r; }))
    .mockResolvedValueOnce(null)
    .mockReturnValueOnce(new Promise(r => { latest = r; }));
  fillLinkMemo("a", "https://a.example");
  fillLinkMemo("a", "https://b.example");
  fillLinkMemo("a", "https://a.example");
  obsolete({ url: "https://a.example", title: "OBSOLETE" });
  await Promise.resolve(); await Promise.resolve();
  expect(useWorkspace.getState().cards[0].content).not.toContain("OBSOLETE");
  latest({ url: "https://a.example", title: "CURRENT" });
  await vi.waitFor(() => expect(useWorkspace.getState().cards[0].content).toContain("CURRENT"));
});
