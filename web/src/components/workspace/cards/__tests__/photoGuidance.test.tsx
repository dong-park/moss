import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace, type Card } from "@/state/workspace";
import { IMAGE_ACCEPT, IMAGE_FORMAT_LABELS, MAX_IMAGE_BYTES } from "@/state/attachmentLimits";
import { storePhoto } from "../../canvasCapture";
import { PhotoCardContent } from "../photo/Content";
vi.mock("../../canvasCapture", () => ({ storePhoto: vi.fn() }));
vi.mock("../photo/usePhotoUrl", () => ({ usePhotoUrl: () => ({ state: "missing", url: null }) }));
const blank: Card = { id: "photo", kind: "photo", content: "", x: 0, y: 0, width: 240, height: 180 };
function mount() {
  useWorkspace.setState({ cards: [blank] });
  return render(<I18nProvider locale="ko"><PhotoCardContent card={blank} editing={false} onChange={vi.fn()} onCommitEdit={vi.fn()} /></I18nProvider>);
}
beforeEach(() => { vi.mocked(storePhoto).mockReset(); });
it("shows validator-derived types, limit and location before selection; cancel leaves card empty", () => {
  const { container } = mount();
  expect(screen.getByText(new RegExp(IMAGE_FORMAT_LABELS))).toBeTruthy();
  expect(screen.getByText(new RegExp(`${MAX_IMAGE_BYTES / 1024 / 1024} MiB`))).toBeTruthy();
  expect(screen.getByText(/이 보드의 사진 카드로/)).toBeTruthy();
  const input = container.querySelector('input[type="file"]')!;
  expect(input.getAttribute("accept")).toBe(IMAGE_ACCEPT);
  fireEvent.change(input, { target: { files: [] } });
  expect(storePhoto).not.toHaveBeenCalled();
  expect(useWorkspace.getState().cards[0].attachmentRef).toBeUndefined();
});
it("local save is pending until storage completes and failed selection stays retryable", async () => {
  let finish!: (v: null) => void;
  vi.mocked(storePhoto).mockReturnValueOnce(new Promise(r => { finish = r; })).mockRejectedValueOnce(new Error("disk full"));
  const { container } = mount();
  const input = container.querySelector('input[type="file"]')!;
  const file = new File(["image"], "test.png", { type: "image/png" });
  fireEvent.change(input, { target: { files: [file] } });
  expect(screen.getByRole("status").textContent).toContain("이 기기에");
  expect(screen.getByRole("button", { name: "사진 고르기" })).toBeDisabled();
  await act(async () => { finish(null); });
  expect(screen.getByRole("alert").textContent).toContain("다시 선택");
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("button", { name: "사진 고르기" })).toBeEnabled();
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(storePhoto).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByRole("button", { name: "사진 고르기" })).toBeEnabled());
  expect(useWorkspace.getState().cards[0].attachmentRef).toBeUndefined();
});
