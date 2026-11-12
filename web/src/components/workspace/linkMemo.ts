import { create } from "zustand";
import { memoFace } from "@/state/memoFace";
import { fetchLinkPreview, isUrlOnly } from "@/state/cardContent";
import { serializeBlock } from "@/state/blocks";
import { runAsUserAction, useWorkspace } from "@/state/workspace";

/**
 * 주소 하나로 링크 블록 메모를 만든다 — 캔버스 붙여넣기와 도크 링크 버튼이 같이 쓴다.
 * `at`이 있으면 그 월드 좌표, 없으면 화면 가운데. 허용 스킴(http/https/mailto) 밖이면 null.
 * 미리보기 제목은 비동기로 채우되, 그사이 사용자가 내용을 고쳤으면 덮어쓰지 않는다.
 */
/** 도크 링크 버튼이 만드는 빈 링크 카드의 본문 — 주소를 넣기 전 자리표시. 앞면이 주소 입력칸을 그린다. */
export { EMPTY_LINK_CONTENT } from "@/state/linkContent";

export function createLinkMemo(
  raw: string,
  opts: { at?: { x: number; y: number }; centerSize?: { width: number; height: number } } = {},
): string | null {
  if (!isUrlOnly(raw.trim())) return null;
  // cmd-z-undo 웨이브 3: 만들기·채우기는 붙여넣기 한 번 — 기록 1단계.
  return runAsUserAction(
    () => {
      const ws = useWorkspace.getState();
      const id = opts.at
        ? ws.addCardAt("text", opts.at.x, opts.at.y)
        : ws.addCardAtViewportCenter("text", opts.centerSize);
      // 위젯(표시 형태)으로 바로 보이게 — 편집 모드 진입 없이 링크 블록만 채운다.
      ws.setEditing(null);
      fillLinkMemo(id, raw);
      return id;
    },
    { creates: true },
  );
}

/**
 * 이미 있는 메모(빈 링크 카드 등)를 주소 하나의 링크 블록으로 채운다. 허용 스킴 밖이면 false.
 * 미리보기 제목은 비동기로 채우되, 그사이 사용자가 내용을 고쳤으면 덮어쓰지 않는다.
 */
export function fillLinkMemo(id: string, raw: string): boolean {
  const url = raw.trim();
  if (!isUrlOnly(url)) return false;
  const block = serializeBlock({ type: "link", url });
  if (!block) return false;
  useWorkspace.getState().setContent(id, block);
  requestPreview(id, url, block);
  return true;
}

// Session-only feedback, never part of the persisted card or a URL draft.
type PreviewStatus = { url: string; status: "loading" | "failed" | "ready"; token: number };
export const useLinkPreviewStatus = create<{ byCard: Record<string, PreviewStatus> }>(() => ({ byCard: {} }));
let requestToken = 0;
function requestPreview(id: string, url: string, originalContent: string) {
  const token = ++requestToken;
  const update = (status: PreviewStatus["status"]) => useLinkPreviewStatus.setState((s) => ({
    byCard: { ...s.byCard, [id]: { url, status, token } },
  }));
  update("loading");
  void fetchLinkPreview(url).catch(() => null).then((meta) => {
    if (useLinkPreviewStatus.getState().byCard[id]?.token !== token) return;
    const current = useWorkspace.getState().cards.find((c) => c.id === id)?.content;
    if (current !== originalContent) {
      useLinkPreviewStatus.setState((s) => {
        const byCard = { ...s.byCard };
        delete byCard[id];
        return { byCard };
      });
      return;
    }
    if (!meta) { update("failed"); return; }
    // Keep the existing title enrichment, guarded by content AND request order.
    const hasTitle = originalContent !== serializeBlock({ type: "link", url });
    const withTitle = !hasTitle && meta.title && serializeBlock({ type: "link", url, title: meta.title });
    if (withTitle && withTitle !== originalContent) useWorkspace.getState().setContent(id, withTitle);
    update("ready");
  });
}

export function retryLinkPreview(id: string): void {
  const card = useWorkspace.getState().cards.find((c) => c.id === id);
  if (!card) return;
  const face = memoFace(card.content);
  if (face.t !== "link") return;
  requestPreview(id, face.url, card.content);
}
