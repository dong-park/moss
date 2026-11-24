import { beforeEach, expect, it, vi } from "vitest";
import { fillLinkMemo, retryLinkPreview, useLinkPreviewStatus } from "../linkMemo";
import { useWorkspace, type Card } from "@/state/workspace";
import { serializeBlock } from "@/state/blocks";
import { fetchLinkPreview, type LinkContent } from "@/state/cardContent";
vi.mock("@/state/cardContent", async (original) => ({ ...await original<typeof import("@/state/cardContent")>(), fetchLinkPreview: vi.fn() }));
const content = () => useWorkspace.getState().cards[0]?.content;
const status = () => useLinkPreviewStatus.getState().byCard.a?.status;
beforeEach(() => {
  vi.mocked(fetchLinkPreview).mockReset();
  useLinkPreviewStatus.setState({ byCard: {} });
  useWorkspace.setState({ cards: [{ id: "a", kind: "text", width: 240, x: 0, y: 0, content: "" } as Card] });
});
it("saves the URL immediately, distinguishes preview failure and retries without discarding it", async () => {
  vi.mocked(fetchLinkPreview).mockResolvedValueOnce(null).mockResolvedValueOnce({ url: "https://example.com", title: "Example" });
  expect(fillLinkMemo("a", "https://example.com")).toBe(true);
  expect(content()).toContain("https://example.com");
  expect(status()).toBe("loading");
  await vi.waitFor(() => expect(status()).toBe("failed"));
  const saved = content();
  retryLinkPreview("a");
  expect(content()).toBe(saved);
  await vi.waitFor(() => expect(status()).toBe("ready"));
  expect(content()).toContain("Example");
});
it("a rejected preview is a failure, not an unhandled rejection or URL loss", async () => {
  vi.mocked(fetchLinkPreview).mockRejectedValue(new Error("network"));
  fillLinkMemo("a", "https://example.com");
  await vi.waitFor(() => expect(status()).toBe("failed"));
  expect(content()).toContain("https://example.com");
});
it("late preview from an earlier A→B→A request cannot replace newer metadata", async () => {
  let old!: (meta: LinkContent) => void;
  let newest!: (meta: LinkContent) => void;
  vi.mocked(fetchLinkPreview).mockReturnValueOnce(new Promise(r => { old = r; })).mockResolvedValueOnce(null).mockReturnValueOnce(new Promise(r => { newest = r; }));
  fillLinkMemo("a", "https://a.example");
  fillLinkMemo("a", "https://b.example");
  fillLinkMemo("a", "https://a.example");
  old({ url: "https://a.example", title: "Stale" });
  await Promise.resolve(); await Promise.resolve();
  expect(content()).not.toContain("Stale");
  expect(status()).toBe("loading");
  newest({ url: "https://a.example", title: "Newest" });
  await vi.waitFor(() => expect(status()).toBe("ready"));
  expect(content()).toContain("Newest");
});
it("retry preserves a title supplied by the user", async () => {
  const custom = serializeBlock({ type: "link", url: "https://example.com", title: "My title" })!;
  useWorkspace.setState({ cards: [{ ...useWorkspace.getState().cards[0], content: custom }] });
  vi.mocked(fetchLinkPreview).mockResolvedValue({ url: "https://example.com", title: "Remote metadata" });
  retryLinkPreview("a");
  await vi.waitFor(() => expect(status()).toBe("ready"));
  expect(content()).toBe(custom);
});
it("concurrent edits and deleted cards are never recreated or overwritten", async () => {
  let done!: (meta: LinkContent) => void;
  vi.mocked(fetchLinkPreview).mockReturnValue(new Promise(r => { done = r; }));
  fillLinkMemo("a", "https://example.com");
  const remote = serializeBlock({ type: "link", url: "https://remote.example", title: "Remote" })!;
  useWorkspace.setState({ cards: [{ ...useWorkspace.getState().cards[0], content: remote }] });
  done({ url: "https://example.com", title: "Old" });
  await Promise.resolve();
  expect(content()).toBe(remote);
  retryLinkPreview("a");
  useWorkspace.setState({ cards: [] });
  done({ url: "https://remote.example", title: "Old" });
  await Promise.resolve();
  expect(useWorkspace.getState().cards).toEqual([]);
});
