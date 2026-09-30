import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { SYSTEM_BOARD_ID, useWorkspace } from "@/state/workspace";
import { useShare } from "@/state/share";
import type { Board } from "@/state/db/schema";
import { Breadcrumb } from "@/components/workspace/Breadcrumb";

const boards: Board[] = [
  { id: SYSTEM_BOARD_ID, name: "", isSystem: true, createdAt: 0 } as Board,
  { id: "b1", name: "팀 보드", isSystem: false, parentBoardId: SYSTEM_BOARD_ID, createdAt: 0 } as Board,
];

function mount() {
  return render(
    <I18nProvider locale="ko">
      <Breadcrumb />
    </I18nProvider>,
  );
}

afterEach(() => {
  useShare.setState({ byBoard: {} });
});

describe("Breadcrumb — 현재 보드 조각", () => {
  it("홈 다음에 지금 보드 이름을 그린다", () => {
    useWorkspace.setState({ boards, currentBoardId: "b1" });
    mount();
    expect(screen.getByText("팀 보드").closest("[aria-current=page]")).toBeTruthy();
    expect(screen.queryByText("공유")).toBeNull();
  });

  it("공유 보드면 이름 옆에 공유 표시를 붙인다", () => {
    useWorkspace.setState({ boards, currentBoardId: "b1" });
    useShare.setState({ byBoard: { b1: { status: "shared", inviteToken: null, role: "editor" } } });
    mount();
    expect(screen.getByText("공유")).toBeTruthy();
  });
});
