import type { ConnectionSide } from "@/state/db/schema";
import { useWorkspace, type Card } from "@/state/workspace";
import {
  anchorPoint,
  clientToWorld,
  isConnectableCard,
  nearestSide,
  type Point,
} from "./geometry";

const DRAG_THRESHOLD = 3;

/**
 * 포인터 아래에서 가장 위에 있는 연결 대상 카드 id. data-card-id 호스트를 찾고,
 * 못 찾으면 그 아래 요소로 내려간다(연결점 오버레이는 카드가 아니라서 건너뛴다).
 */
function cardIdUnderPoint(
  clientX: number,
  clientY: number,
  excludeId: string,
): string | null {
  const els = document.elementsFromPoint(clientX, clientY);
  for (const el of els) {
    const host = (el as HTMLElement).closest?.(
      "[data-card-id]",
    ) as HTMLElement | null;
    if (!host) continue;
    const id = host.dataset.cardId;
    if (!id || id === excludeId) continue;
    return id;
  }
  return null;
}

/**
 * FEAT-connectors: 연결점에서 시작한 드래그 세션. window 리스너를 걸고 포인터를 따라
 * 미리보기를 갱신하다가, 놓으면 대상 카드에 연결하거나 빈 캔버스면 새 메모를 만든다.
 * AC: 자기 자신·Esc·카드 위(비대상) 드롭은 취소.
 */
export function beginConnectionDrag(
  source: Card,
  sourceSide: ConnectionSide,
  startClientX: number,
  startClientY: number,
): void {
  const canvasEl = document.querySelector<HTMLElement>("[data-canvas-root]");

  const worldPoint = (clientX: number, clientY: number): Point => {
    const v = useWorkspace.getState().viewport;
    const rect = canvasEl?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return clientToWorld(clientX, clientY, rect, v);
  };

  useWorkspace.getState().setConnectionDraft({
    sourceId: source.id,
    sourceSide,
    pointer: anchorPoint(source, sourceSide),
    targetId: null,
    targetSide: null,
  });

  let moved = false;

  const onMove = (ev: MouseEvent) => {
    if (
      !moved &&
      Math.hypot(ev.clientX - startClientX, ev.clientY - startClientY) >
        DRAG_THRESHOLD
    ) {
      moved = true;
    }
    if (!moved) return;
    const ws = useWorkspace.getState();
    if (!ws.connectionDraft) return;
    const pointer = worldPoint(ev.clientX, ev.clientY);
    const underId = cardIdUnderPoint(ev.clientX, ev.clientY, source.id);
    const target = underId ? ws.cards.find((c) => c.id === underId) : undefined;
    const valid = target && isConnectableCard(target) ? target : undefined;
    ws.setConnectionDraft({
      sourceId: source.id,
      sourceSide,
      pointer,
      targetId: valid?.id ?? null,
      targetSide: valid ? nearestSide(valid, pointer) : null,
    });
  };

  const cleanup = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    window.removeEventListener("keydown", onKey, { capture: true });
  };

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== "Escape") return;
    // capture 단계에서 즉시 소비해, 캔버스의 window keydown(부모 보드 이동)이 이 Esc를
    // 보지 못하게 한다.
    ev.preventDefault();
    ev.stopImmediatePropagation();
    useWorkspace.getState().setConnectionDraft(null);
    cleanup();
  };

  const onUp = (ev: MouseEvent) => {
    cleanup();
    const ws = useWorkspace.getState();
    const draft = ws.connectionDraft;
    ws.setConnectionDraft(null);
    // 클릭만(임계 미만)이면 아무것도 만들지 않는다 — 놓기 전에 취소.
    if (!draft || !moved) return;
    if (draft.targetId && draft.targetSide) {
      ws.connectCards(source.id, sourceSide, draft.targetId, draft.targetSide);
      return;
    }
    const rect = canvasEl?.getBoundingClientRect();
    const inside =
      !!rect &&
      ev.clientX >= rect.left &&
      ev.clientX <= rect.right &&
      ev.clientY >= rect.top &&
      ev.clientY <= rect.bottom;
    const underId = cardIdUnderPoint(ev.clientX, ev.clientY, source.id);
    if (inside && !underId) {
      const p = worldPoint(ev.clientX, ev.clientY);
      ws.connectToNewMemo(source.id, sourceSide, p.x, p.y);
    }
  };

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  window.addEventListener("keydown", onKey, { capture: true });
}
