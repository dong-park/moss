import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/Provider";
import { SharePopover, type SharePopoverProps } from "../SharePopover";
function mount(status: SharePopoverProps["status"]) {
  return render(<I18nProvider locale="ko"><SharePopover boardName="Test" status={status} viewerRole="owner" members={[]} inviteUrl={null} authenticated busy={false} error={null} copied={false}
    onStart={vi.fn()} onCopy={vi.fn()} onReissue={vi.fn()} onRemove={vi.fn()} onUnshare={vi.fn()} onLeave={vi.fn()} /></I18nProvider>);
}
it.each(["local", "shared"] as const)("explains subtree, attachments, joining as editor and limits of revocation (%s)", (status) => {
  mount(status);
  expect(screen.getByText(/파일함의 메모·사진·첨부/)).toBeTruthy();
  expect(screen.getByText(/로그인한 뒤 참여하면 편집자/)).toBeTruthy();
  expect(screen.getByText(/이미 내려받거나 따로 보관한 사본까지 회수되지는/)).toBeTruthy();
  expect(screen.queryByText("이 보드만 서버에 올라가요")).toBeNull();
});
