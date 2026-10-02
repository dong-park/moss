import { fetchLinkPreview, isUrlOnly } from "@/state/cardContent";
import { serializeBlock } from "@/state/blocks";
import { useWorkspace } from "@/state/workspace";

/**
 * 주소 하나로 링크 블록 메모를 만든다 — 캔버스 붙여넣기와 도크 링크 버튼이 같이 쓴다.
 * `at`이 있으면 그 월드 좌표, 없으면 화면 가운데. 허용 스킴(http/https/mailto) 밖이면 null.
 * 미리보기 제목은 비동기로 채우되, 그사이 사용자가 내용을 고쳤으면 덮어쓰지 않는다.
 */
export function createLinkMemo(
  raw: string,
  opts: { at?: { x: number; y: number }; centerSize?: { width: number; height: number } } = {},
): string | null {
  const url = raw.trim();
  if (!isUrlOnly(url)) return null;
  const block = serializeBlock({ type: "link", url });
  if (!block) return null;

  const ws = useWorkspace.getState();
  const id = opts.at
    ? ws.addCardAt("text", opts.at.x, opts.at.y)
    : ws.addCardAtViewportCenter("text", opts.centerSize);
  // 위젯(표시 형태)으로 바로 보이게 — 편집 모드 진입 없이 링크 블록만 채운다.
  ws.setEditing(null);
  ws.setContent(id, block);
  void fetchLinkPreview(url).then((meta) => {
    if (!meta) return;
    const withTitle = serializeBlock({ type: "link", url, title: meta.title });
    if (!withTitle) return;
    const current = useWorkspace.getState().cards.find((c) => c.id === id)?.content;
    if (current !== block) return;
    useWorkspace.getState().setContent(id, withTitle);
  });
  return id;
}
