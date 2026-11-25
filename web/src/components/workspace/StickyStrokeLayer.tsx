"use client";

import {
  memo,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import { useWorkspace, type Card } from "@/state/workspace";
import { drawingToolFor, isPhoneViewport } from "@/state/marker/heldTool";
import { strokeOwnerOfCard } from "@/state/marker/strokeOwner";
import { MARKER_COLOR_VALUE } from "@/state/marker/tokens";
import { DrawingLayer, type DrawingLayerHandle } from "./cards/_shared/DrawingLayer";
import { clientToCardLocal, scaleFromBounds } from "./cards/_shared/stickyGeometry";
import { cardRotationDeg } from "./memoVariety";

/* ─────────────────────────────────────────────────────────────
 * wall-marker n5 — 포스트잇 위 마카 획.
 *
 * 마카를 들고 포스트잇 위에서 시작해 그으면 그 포스트잇의 획이 된다(색·굵기는 든 마카).
 * 획은 노트 `overlay`에 저장돼 포스트잇과 함께 움직인다(D2=A). 천이면 문지른 자리만
 * 지운다. 옛 메모 펜 획(색·굵기 없음)도 이 레이어가 검정·가는 선으로 그린다.
 *
 * 좌표: 포스트잇은 기울어 있다(D7=A). 화면 좌표에서 회전·줌을 풀어 포스트잇 자기 좌표로
 * 저장한다 — 그러면 옮기거나 열어도 같은 자리다. 포스트잇 가장자리에서 잘린다(D4=A).
 *
 * 안 들었어도 태블릿 펜이 닿으면 마지막 마카로 그린다(D5=A). 이 레이어는 안 든 동안
 * pointer-events:none이라(손가락은 끌기·이동으로 통과) 펜의 pointerdown은 카드 껍데기가
 * `handleRef.begin`으로 넘겨 준다.
 * ───────────────────────────────────────────────────────────── */

export interface StickyStrokeHandle {
  /** 카드 껍데기의 pointerdown을 넘긴다. 이 포인터가 그릴 것이면 그리기를 시작한다. */
  begin: (e: React.PointerEvent<Element>) => void;
}

interface Props {
  card: Pick<Card, "id" | "kind" | "width" | "height" | "overlay">;
  /** 카드 껍데기(회전·줌이 걸린 상자). 화면 좌표 → 자기 좌표 변환의 기준이다. */
  boxRef: RefObject<HTMLElement | null>;
  /** 포스트잇 높이. 정사각이 아닌 흰 앞면(링크·할 일)은 측정 전까지 없다. */
  height: number | undefined;
  handleRef?: Ref<StickyStrokeHandle>;
}

export const StickyStrokeLayer = memo(function StickyStrokeLayer({
  card,
  boxRef,
  height,
  handleRef,
}: Props) {
  const heldTool = useWorkspace((s) => s.heldTool);
  const lastMarkerColor = useWorkspace((s) => s.lastMarkerColor);
  const markerWidth = useWorkspace((s) => s.markerWidth);
  const setOverlay = useWorkspace((s) => s.setOverlay);

  const toLocal = useCallback(
    (clientX: number, clientY: number) => {
      const el = boxRef.current;
      const box = {
        width: el?.offsetWidth || card.width,
        height: el?.offsetHeight || height || card.width,
      };
      const deg = cardRotationDeg(card.id, card.kind);
      const rect = el?.getBoundingClientRect();
      const scale = scaleFromBounds(
        rect?.width ?? 0,
        box,
        deg,
        useWorkspace.getState().viewport.scale,
      );
      const center = rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : { x: 0, y: 0 };
      return clientToCardLocal({ x: clientX, y: clientY }, center, box, scale, deg);
    },
    [boxRef, card.id, card.kind, card.width, height],
  );

  const onChange = useCallback(
    (json: string) => {
      // 그리는 동안 다른 사람이 이 포스트잇을 지웠으면 그리던 획은 버린다.
      if (!useWorkspace.getState().cards.some((c) => c.id === card.id)) return;
      setOverlay(card.id, json);
    },
    [card.id, setOverlay],
  );

  const drawingHandleRef = useRef<DrawingLayerHandle>(null);
  // 그리기 레이어는 필요할 때만 마운트한다(W11): 획이 있거나, 도구를 들었거나, 펜이 한 번 닿은 뒤.
  // 포스트잇이 수백 장이어도 빈 포스트잇은 레이어 하나(svg·훅)를 더 달지 않는다.
  const [penEntered, setPenEntered] = useState(false);
  const begin = useCallback(
    (e: React.PointerEvent<Element>) => {
      const s = useWorkspace.getState();
      // 이 포스트잇의 획이 아니면(주인 규칙 한 곳: strokeOwner) 시작하지 않는다.
      if (strokeOwnerOfCard({ id: card.id, kind: card.kind }).kind !== "sticky") return;
      if (e.currentTarget.closest("[data-canvas-root]")?.getAttribute("data-space-pan") === "true") return;
      if (s.heldTool) return; // 든 동안은 레이어가 직접 받는다
      if (s.editingId === card.id) return;
      if (isPhoneViewport()) return;
      if (drawingToolFor(null, e.pointerType, s.lastMarkerColor) === null) return;
      // 아직 레이어가 없으면 이 펜 입력이 닿은 자리에서 지금 마운트해 같은 이벤트로 그리기를 시작한다.
      if (!drawingHandleRef.current) flushSync(() => setPenEntered(true));
      drawingHandleRef.current?.onPointerDown(e);
    },
    [card.id, card.kind, drawingHandleRef],
  );
  useImperativeHandle(handleRef, () => ({ begin }), [begin]);

  const drawTool = drawingToolFor(heldTool, "pen", lastMarkerColor);
  const isCloth = drawTool?.kind === "cloth";
  const color = drawTool && drawTool.kind === "marker" ? drawTool.color : "black";
  const clip = height !== undefined ? { width: card.width, height } : true;

  const hasStrokes = (card.overlay ?? "") !== "";
  if (!hasStrokes && heldTool === null && !penEntered) return null;

  return (
    <div
      aria-hidden="true"
      data-sticky-strokes
      className="absolute inset-0"
      style={{ zIndex: 5, pointerEvents: "none" }}
    >
      <DrawingLayer
        value={card.overlay ?? ""}
        active={heldTool !== null}
        acceptPen={heldTool === null}
        tool={isCloth ? "eraser" : "pen"}
        color={color}
        width={markerWidth}
        // 종이 위 검정 잉크는 재질·테마와 상관없이 마카 검정이다.
        stroke={MARKER_COLOR_VALUE.black}
        toLocal={toLocal}
        clip={clip}
        cursor={heldTool ? "inherit" : "default"}
        onChange={onChange}
        handleRef={drawingHandleRef}
      />
    </div>
  );
});
