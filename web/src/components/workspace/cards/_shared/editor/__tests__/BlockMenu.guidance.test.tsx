import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/Provider";
import { storeFileBlock } from "@/components/workspace/canvasCapture";
import { BlockMenu } from "../BlockMenu";
vi.mock("@milkdown/react", () => ({ useInstance: () => [false, () => ({ action: vi.fn() })] }));
vi.mock("@/components/workspace/canvasCapture", () => ({ storeFileBlock: vi.fn(), storeImageBlock: vi.fn() }));
it("makes image/file limits and cursor/local/shared placement available before picking", async () => {
  render(<I18nProvider locale="ko"><BlockMenu /></I18nProvider>);
  fireEvent.pointerDown(screen.getByRole("button", { name: "블록 추가" }), { button: 0, ctrlKey: false });
  expect(await screen.findByText(/10 MiB/)).toBeTruthy();
  expect(screen.getByText(/50 MiB/)).toBeTruthy();
  expect(screen.getAllByText(/커서 위치/)).toHaveLength(2);
  expect(screen.getAllByText(/공유 보드에서는 서버에도/)).toHaveLength(2);
});
it("file storage rejection is visible instead of an unhandled promise or success", async () => {
  vi.mocked(storeFileBlock).mockRejectedValue(new Error("disk full"));
  const { container } = render(<I18nProvider locale="ko"><BlockMenu /></I18nProvider>);
  const input = container.querySelector('input[type="file"]:not([accept])')!;
  fireEvent.change(input, { target: { files: [new File(["file"], "example.txt")] } });
  expect((await screen.findByRole("alert")).textContent).toContain("다시 선택");
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
});
