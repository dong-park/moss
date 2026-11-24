import { blocksToMarkdown, fetchLinkPreview, isUrlOnly } from "@/state/cardContent";
import { parseBlock, serializeBlock } from "@/state/blocks";
import { useShare } from "@/state/share/store";
import { useWorkspace } from "@/state/workspace";

/**
 * 이 벽이 공유 중인가 — 공유하지 않은 벽의 주소는 사용자가 누르기 전엔 moss 서버로 나가지 않는다
 * (local-promise D1). 공유 중인 벽만 미리보기를 저절로 가져온다.
 */
export function isWallShared(boardId: string): boolean {
  return useShare.getState().byBoard[boardId]?.status === "shared";
}

/**
 * 주소 하나로 링크 블록 메모를 만든다 — 캔버스 붙여넣기와 도크 링크 버튼이 같이 쓴다.
 * `at`이 있으면 그 월드 좌표, 없으면 화면 가운데. 허용 스킴(http/https/mailto) 밖이면 null.
 * 미리보기 제목은 공유 중인 벽에서만 저절로 채운다(공유하지 않은 벽은 `loadLinkPreview`를 누를 때만).
 */
/** 도크 링크 버튼이 만드는 빈 링크 카드의 본문 — 주소를 넣기 전 자리표시. 앞면이 주소 입력칸을 그린다. */
export const EMPTY_LINK_CONTENT = "<!-- moss-link-empty -->";

export function createLinkMemo(
  raw: string,
  opts: { at?: { x: number; y: number }; centerSize?: { width: number; height: number } } = {},
): string | null {
  if (!isUrlOnly(raw.trim())) return null;
  const ws = useWorkspace.getState();
  const id = opts.at
    ? ws.addCardAt("text", opts.at.x, opts.at.y)
    : ws.addCardAtViewportCenter("text", opts.centerSize);
  // 위젯(표시 형태)으로 바로 보이게 — 편집 모드 진입 없이 링크 블록만 채운다.
  ws.setEditing(null);
  fillLinkMemo(id, raw);
  return id;
}

/**
 * 이미 있는 메모(빈 링크 카드 등)를 주소 하나의 링크 블록으로 채운다. 허용 스킴 밖이면 false.
 * 미리보기 제목은 공유 중인 벽에서만 저절로 가져온다 — 공유하지 않은 벽은 주소가 서버를 거치지 않고,
 * 링크 앞면의 "미리보기 가져오기"가 `loadLinkPreview`를 부른다.
 */
export function fillLinkMemo(id: string, raw: string): boolean {
  const url = raw.trim();
  if (!isUrlOnly(url)) return false;
  const block = serializeBlock({ type: "link", url });
  if (!block) return false;
  const ws = useWorkspace.getState();
  ws.setContent(id, block);
  if (isWallShared(ws.currentBoardId)) void loadLinkPreview(id);
  return true;
}

/**
 * 링크 메모의 미리보기 제목을 가져와 채운다 — 이 주소만 `/api/preview`(moss 서버)로 나간다.
 * 가져오는 사이 사용자가 내용을 고쳤으면 덮어쓰지 않는다. 제목을 채웠으면 true.
 */
export async function loadLinkPreview(id: string): Promise<boolean> {
  const before = useWorkspace.getState().cards.find((c) => c.id === id)?.content;
  if (before === undefined) return false;
  const block = parseBlock(blocksToMarkdown(before).trim());
  if (block?.type !== "link" || !isUrlOnly(block.url)) return false;
  const meta = await fetchLinkPreview(block.url);
  if (!meta?.title) return false;
  const withTitle = serializeBlock({ type: "link", url: block.url, title: meta.title });
  if (!withTitle) return false;
  const current = useWorkspace.getState().cards.find((c) => c.id === id)?.content;
  if (current !== before) return false;
  useWorkspace.getState().setContent(id, withTitle);
  return true;
}
