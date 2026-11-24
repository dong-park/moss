import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { BoardPicker } from "@/components/workspace/BoardPicker";
import { MemoTitleRow } from "@/components/workspace/cards/_shared/MemoTitleRow";
import { EditableLine } from "@/components/workspace/cards/_shared/editable";
import { SYSTEM_BOARD_ID, useWorkspace } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";

/* T9·T10·T11 — 입력 칸이 한글 조합 중 Enter·blur에 저장하지 않는다.
 * jsdom 합성 이벤트만 쓴다. 실제 macOS 한글 입력기 확인은 n6(실브라우저) 몫이다. */

const settle = () => new Promise((r) => setTimeout(r, 20));

afterEach(async () => {
  // 앞 테스트의 compositionend가 남긴 시간 창이 다음 테스트의 Enter를 삼키지 않게 한다.
  await new Promise((r) => setTimeout(r, 120));
});

describe("MemoTitleRow — 포스트잇 제목 칸", () => {
  function setup() {
    const onEnter = vi.fn();
    const onBlur = vi.fn();
    const onCommit = vi.fn();
    render(
      <I18nProvider locale="ko">
        <MemoTitleRow
          title="이직"
          editable
          onCommit={onCommit}
          onEnter={onEnter}
          onBlur={onBlur}
        />
      </I18nProvider>,
    );
    const input = document.querySelector("[data-memo-title-input]") as HTMLInputElement;
    return { input, onEnter, onBlur };
  }

  it("조합 중 Enter는 본문으로 넘기지 않는다", () => {
    const { input, onEnter } = setup();
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(onEnter).not.toHaveBeenCalled();
  });

  it("평소 Enter는 본문으로 넘긴다", () => {
    const { input, onEnter } = setup();
    fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it("조합이 끝난 직후 Enter(Safari)도 넘기지 않는다", () => {
    const { input, onEnter } = setup();
    fireEvent.compositionStart(input);
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: "Enter", keyCode: 13, isComposing: false });
    expect(onEnter).not.toHaveBeenCalled();
  });

  it("조합 중 blur는 조합이 끝난 뒤에 알린다 — 마지막 글자가 한 번만 남는다", async () => {
    const { input, onBlur } = setup();
    fireEvent.compositionStart(input);
    fireEvent.blur(input);
    expect(onBlur).not.toHaveBeenCalled();

    fireEvent.compositionEnd(input);
    expect(onBlur).not.toHaveBeenCalled();
    await settle();
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it("조합 중이 아닌 blur는 바로 알린다", () => {
    const { input, onBlur } = setup();
    fireEvent.blur(input);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});

describe("EditableLine — 공용 편집 칸", () => {
  function Harness({ onCommit }: { onCommit: () => void }) {
    return (
      <EditableLine
        value="고민"
        editing
        placeholder="이름"
        onChange={() => {}}
        onCommit={onCommit}
        className=""
      />
    );
  }

  it("조합 중 Enter는 저장(blur)을 부르지 않는다", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    const input = screen.getByPlaceholderText("이름") as HTMLInputElement;
    input.focus();

    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(onCommit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
  });

  it("평소 Enter는 저장한다", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    const input = screen.getByPlaceholderText("이름") as HTMLInputElement;
    input.focus();

    fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("조합 중 blur는 조합이 끝난 뒤 한 번만 저장한다", async () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    const input = screen.getByPlaceholderText("이름") as HTMLInputElement;
    input.focus();

    fireEvent.compositionStart(input);
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    await settle();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});

describe("BoardPicker — 벽 이름 칸", () => {
  afterEach(async () => {
    await resetDB();
    useStorage.setState({ initialized: false, settings: null, quota: null });
    useWorkspace.setState({
      cards: [],
      selectedIds: [],
      editingId: null,
      boards: [],
      currentBoardId: SYSTEM_BOARD_ID,
      lastNonSystemBoardId: null,
      viewportByBoard: {},
      pendingRenameBoardId: null,
    });
  });

  async function openRename() {
    await useStorage.getState().init();
    const id = await useWorkspace.getState().createBoard("draft");
    await new Promise((r) => setTimeout(r, 250));
    render(
      <I18nProvider locale="ko">
        <BoardPicker />
      </I18nProvider>,
    );
    fireEvent.doubleClick(screen.getByLabelText("프로젝트 선택"));
    const input = screen.getByLabelText("프로젝트 이름 변경") as HTMLInputElement;
    return { id, input };
  }

  it("조합 중 Enter는 이름을 저장하지 않고 칸이 그대로 열려 있다", async () => {
    const { id, input } = await openRename();
    fireEvent.change(input, { target: { value: "이지" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    await new Promise((r) => setTimeout(r, 50));

    expect(screen.queryByLabelText("프로젝트 이름 변경")).toBeTruthy();
    expect(useWorkspace.getState().boards.find((b) => b.id === id)?.name).toBe("draft");
  });

  it("조합 중 blur는 확정된 글자로 한 번만 저장한다", async () => {
    const { id, input } = await openRename();
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "이" } });
    fireEvent.blur(input);
    await new Promise((r) => setTimeout(r, 50));
    // 조합이 끝나기 전에는 저장하지 않는다.
    expect(useWorkspace.getState().boards.find((b) => b.id === id)?.name).toBe("draft");

    // 확정 글자가 들어온 뒤 조합이 끝난다.
    fireEvent.change(input, { target: { value: "이직" } });
    fireEvent.compositionEnd(input);
    await new Promise((r) => setTimeout(r, 80));
    expect(useWorkspace.getState().boards.find((b) => b.id === id)?.name).toBe("이직");
  });
});
