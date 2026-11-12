import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/Provider";
import { MAX_IMAGE_BYTES } from "@/state/attachmentLimits";
import { useToasts } from "@/state/notifications";
import { storeAttachment } from "@/state/share/attachments";
import { MarkdownToolbar } from "../MarkdownToolbar";
const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock("@milkdown/react", () => ({ useInstance: () => [false, () => ({ action })] }));
vi.mock("@/state/share/attachments", async (original) => ({ ...await original<typeof import("@/state/share/attachments")>(), storeAttachment: vi.fn() }));
beforeEach(() => { action.mockClear(); vi.mocked(storeAttachment).mockReset(); useToasts.setState({ toasts: [] }); });
function mount() {
  const { container } = render(<I18nProvider locale="ko"><MarkdownToolbar /></I18nProvider>);
  return container.querySelector('input[type="file"]')!;
}
it("rejects unsupported images and oversize files before storing anything", async () => {
  const input = mount();
  fireEvent.change(input, { target: { files: [new File(["bmp"], "x.bmp", { type: "image/bmp" })] } });
  const large = new File(["x"], "big.png", { type: "image/png" });
  Object.defineProperty(large, "size", { value: MAX_IMAGE_BYTES + 1 });
  fireEvent.change(input, { target: { files: [large] } });
  expect(storeAttachment).not.toHaveBeenCalled();
  expect(action).not.toHaveBeenCalled();
  expect(useToasts.getState().toasts.length).toBeGreaterThan(0);
});
it("does not insert an image on storage failure and allows a retry", async () => {
  let fail!: (e: Error) => void;
  vi.mocked(storeAttachment).mockReturnValueOnce(new Promise((_, reject) => { fail = reject; })).mockResolvedValueOnce("opfs:retry.png");
  const input = mount();
  const file = new File(["image"], "x.png", { type: "image/png" });
  fireEvent.change(input, { target: { files: [file] } });
  expect(screen.getByRole("status").textContent).toContain("이 기기에");
  expect(action).not.toHaveBeenCalled();
  await act(async () => { fail(new Error("disk full")); });
  expect(screen.getByRole("alert").textContent).toContain("다시 선택");
  expect(action).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  expect(storeAttachment).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("status")).toBeNull();
});
