import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { blocksToMarkdown } from "@/state/cardContent";
import { useShare } from "@/state/share/store";
import { useWorkspace, type Card } from "@/state/workspace";
import { createLinkMemo, fillLinkMemo, loadLinkPreview } from "../linkMemo";
import { TextCardContent } from "../cards/text/Content";

/* local-promise D1 — 공유하지 않은 벽의 링크 주소는 "미리보기 가져오기"를 누를 때만 서버로 나간다. */

const URL_A = "https://example.com/a";
const BOARD = "wall-1";

let fetchMock: ReturnType<typeof vi.fn>;

function stubPreview(title = "예시 제목") {
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ url: URL_A, title }) }));
  vi.stubGlobal("fetch", fetchMock);
}

const cardById = (id: string) => useWorkspace.getState().cards.find((c) => c.id === id)!;
const flush = () => new Promise((r) => setTimeout(r, 0));

function share(status: "local" | "shared") {
  useShare.setState({ byBoard: { [BOARD]: { status, inviteToken: null } } });
}

beforeEach(() => {
  stubPreview();
  useWorkspace.setState({ cards: [], currentBoardId: BOARD });
  share("local");
});

afterEach(() => {
  vi.unstubAllGlobals();
  useShare.setState({ byBoard: {} });
});

describe("링크 미리보기 — 공유하지 않은 벽", () => {
  it("링크 메모를 만들어도 fetch가 0번 불린다", async () => {
    const id = createLinkMemo(URL_A, { at: { x: 0, y: 0 } });
    expect(id).toBeTruthy();
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(blocksToMarkdown(cardById(id!).content)).toContain(URL_A);
  });

  it("빈 링크 카드에 주소를 채워도(fillLinkMemo) fetch가 0번 불린다", async () => {
    useWorkspace.setState({
      cards: [{ id: "c1", kind: "text", x: 0, y: 0, width: 240, height: 240, content: "" } as Card],
    });
    expect(fillLinkMemo("c1", URL_A)).toBe(true);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("버튼을 누르면 /api/preview가 1번 불리고 제목이 채워진다", async () => {
    const id = createLinkMemo(URL_A, { at: { x: 0, y: 0 } })!;
    render(
      <I18nProvider locale="ko">
        <TextCardContent card={cardById(id)} editing={false} onChange={() => {}} onCommitEdit={() => {}} />
      </I18nProvider>,
    );
    expect(screen.getByText("주소만 moss 서버를 거쳐요")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "미리보기 가져오기" }));
    await waitFor(() => expect(blocksToMarkdown(cardById(id).content)).toContain("예시 제목"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`/api/preview?url=${encodeURIComponent(URL_A)}`);
  });

  it("가져오는 사이 사용자가 내용을 고쳤으면 덮어쓰지 않는다", async () => {
    const id = createLinkMemo(URL_A, { at: { x: 0, y: 0 } })!;
    const pending = loadLinkPreview(id);
    useWorkspace.getState().setContent(id, "내가 고친 글");
    expect(await pending).toBe(false);
    expect(cardById(id).content).toBe("내가 고친 글");
  });

  it("가져오기에 실패하면 안내를 보이고 카드는 주소만으로 남는다", async () => {
    fetchMock = vi.fn(async () => ({ ok: false }));
    vi.stubGlobal("fetch", fetchMock);
    const id = createLinkMemo(URL_A, { at: { x: 0, y: 0 } })!;
    const before = cardById(id).content;
    render(
      <I18nProvider locale="ko">
        <TextCardContent card={cardById(id)} editing={false} onChange={() => {}} onCommitEdit={() => {}} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "미리보기 가져오기" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(cardById(id).content).toBe(before);
  });
});

describe("링크 미리보기 — 공유 중인 벽", () => {
  it("버튼 없이 저절로 1번 불리고 제목이 채워진다", async () => {
    share("shared");
    const id = createLinkMemo(URL_A, { at: { x: 0, y: 0 } })!;
    await waitFor(() => expect(blocksToMarkdown(cardById(id).content)).toContain("예시 제목"));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    render(
      <I18nProvider locale="ko">
        <TextCardContent card={cardById(id)} editing={false} onChange={() => {}} onCommitEdit={() => {}} />
      </I18nProvider>,
    );
    expect(screen.queryByRole("button", { name: "미리보기 가져오기" })).toBeNull();
  });

  it("제목을 못 가져온 링크라도 공유 중인 벽에서는 버튼을 보이지 않는다", () => {
    share("shared");
    useWorkspace.setState({
      cards: [{ id: "c2", kind: "text", x: 0, y: 0, width: 240, height: 240, content: "" } as Card],
    });
    fetchMock = vi.fn(async () => ({ ok: false }));
    vi.stubGlobal("fetch", fetchMock);
    fillLinkMemo("c2", URL_A);
    render(
      <I18nProvider locale="ko">
        <TextCardContent card={cardById("c2")} editing={false} onChange={() => {}} onCommitEdit={() => {}} />
      </I18nProvider>,
    );
    expect(screen.queryByRole("button", { name: "미리보기 가져오기" })).toBeNull();
  });
});
