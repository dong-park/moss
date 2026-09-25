"use client";

import { useEffect, useRef } from "react";
import {
  CARD_MAX_HEIGHT,
  CARD_MAX_WIDTH,
  CARD_MIN_HEIGHT,
  CARD_MIN_WIDTH,
  FRAME_MIN_HEIGHT,
  FRAME_MIN_WIDTH,
  aspectForKind,
  useWorkspace,
  type Card,
} from "@/state/workspace";

type HandleDir = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

// 보이는 점(dot)은 그대로 8×8 유지, 잡히는 hit zone만 키운다.
// 코너는 20×20 사각형, 사이드는 edge 전체 길이 × 16px 두께.
const CORNER_HIT = 20;
const EDGE_HIT_THICKNESS = 16;
const CORNER_OFFSET = CORNER_HIT / 2;
const EDGE_OFFSET = EDGE_HIT_THICKNESS / 2;

const HANDLES: {
  dir: HandleDir;
  cursor: string;
  hitStyle: React.CSSProperties;
}[] = [
  { dir: "nw", cursor: "nwse-resize",
    hitStyle: { left: -CORNER_OFFSET, top: -CORNER_OFFSET, width: CORNER_HIT, height: CORNER_HIT, zIndex: 31 } },
  { dir: "ne", cursor: "nesw-resize",
    hitStyle: { right: -CORNER_OFFSET, top: -CORNER_OFFSET, width: CORNER_HIT, height: CORNER_HIT, zIndex: 31 } },
  { dir: "se", cursor: "nwse-resize",
    hitStyle: { right: -CORNER_OFFSET, bottom: -CORNER_OFFSET, width: CORNER_HIT, height: CORNER_HIT, zIndex: 31 } },
  { dir: "sw", cursor: "nesw-resize",
    hitStyle: { left: -CORNER_OFFSET, bottom: -CORNER_OFFSET, width: CORNER_HIT, height: CORNER_HIT, zIndex: 31 } },
  { dir: "n", cursor: "ns-resize",
    hitStyle: { left: 0, right: 0, top: -EDGE_OFFSET, height: EDGE_HIT_THICKNESS, zIndex: 30 } },
  { dir: "s", cursor: "ns-resize",
    hitStyle: { left: 0, right: 0, bottom: -EDGE_OFFSET, height: EDGE_HIT_THICKNESS, zIndex: 30 } },
  { dir: "e", cursor: "ew-resize",
    hitStyle: { top: 0, bottom: 0, right: -EDGE_OFFSET, width: EDGE_HIT_THICKNESS, zIndex: 30 } },
  { dir: "w", cursor: "ew-resize",
    hitStyle: { top: 0, bottom: 0, left: -EDGE_OFFSET, width: EDGE_HIT_THICKNESS, zIndex: 30 } },
];

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

export function ResizeHandles({
  card,
  measuredHeight,
}: {
  card: Card;
  /** card.height가 없을 때 fallback으로 쓸 실측 높이 (DOM offsetHeight). */
  measuredHeight: number;
}) {
  const resizeCard = useWorkspace((s) => s.resizeCard);
  const resizeFrame = useWorkspace((s) => s.resizeFrame);
  const resolveMembership = useWorkspace((s) => s.resolveMembership);
  const setTextWidth = useWorkspace((s) => s.setTextWidth);
  const moveCard = useWorkspace((s) => s.moveCard);
  const isFrame = card.kind === "frame";
  // FEAT-text-tool §2: textbox는 좌우(e/w) 핸들만 — 끌면 고정 폭 전환(AC-4),
  // 높이는 항상 내용에 맞춘다(핸들 대상 아님).
  const isTextbox = card.kind === "textbox";
  const visibleHandles = isTextbox
    ? HANDLES.filter((h) => h.dir === "e" || h.dir === "w")
    : HANDLES;

  const dragRef = useRef<{
    dir: HandleDir;
    startX: number;
    startY: number;
    originW: number;
    originH: number;
    originCardX: number;
    originCardY: number;
    cleanup: () => void;
  } | null>(null);

  // 드래그 도중 컴포넌트 unmount되면 window 리스너 누수 — 안전한 cleanup.
  useEffect(() => {
    return () => {
      dragRef.current?.cleanup();
      dragRef.current = null;
    };
  }, []);

  const onHandleMouseDown = (dir: HandleDir) => (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    // FEAT-text-tool: textbox 좌우 핸들 — 고정 폭 전환. 높이는 손대지 않는다(내용 높이).
    if (isTextbox) {
      const onMove = (ev: MouseEvent) => {
        const d = dragRef.current;
        if (!d) return;
        const scale = useWorkspace.getState().viewport.scale;
        const dx = (ev.clientX - d.startX) / scale;
        const raw = d.dir === "e" ? d.originW + dx : d.originW - dx;
        const w = clamp(raw, CARD_MIN_WIDTH, CARD_MAX_WIDTH);
        setTextWidth(card.id, w);
        // 왼쪽 핸들은 오른쪽 가장자리를 고정 — x를 함께 민다.
        if (d.dir === "w") {
          moveCard(card.id, d.originCardX + (d.originW - w), d.originCardY);
        }
      };
      const cleanup = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      const onUp = () => {
        dragRef.current = null;
        cleanup();
      };
      dragRef.current = {
        dir,
        startX: e.clientX,
        startY: e.clientY,
        originW: card.width,
        originH: 0,
        originCardX: card.x,
        originCardY: card.y,
        cleanup,
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      return;
    }

    // 메모(text)는 정사각 — 시작 높이는 실측이 아니라 폭. 그 외는 명시 높이/실측.
    const startH =
      card.kind === "text" ? card.width : (card.height ?? measuredHeight);

    const ratio = aspectForKind(card.kind);
    // 비율 유지 조건에서 width의 유효 범위 — 두 축 min/max 모두를 만족시키도록 좁힌다.
    const minW = Math.max(CARD_MIN_WIDTH, CARD_MIN_HEIGHT * ratio);
    const maxW = Math.min(CARD_MAX_WIDTH, CARD_MAX_HEIGHT * ratio);

    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const scale = useWorkspace.getState().viewport.scale;
      const dx = (ev.clientX - d.startX) / scale;
      const dy = (ev.clientY - d.startY) / scale;

      // FEAT-sticky-redesign: 메모판은 종이 카드가 아니라 자유 사각형 — 가로/세로
      // 비율을 강제하지 않고 각 축을 독립적으로 늘리거나 줄인다.
      if (isFrame) {
        let w = d.originW;
        let h = d.originH;
        if (d.dir.includes("e")) w = d.originW + dx;
        if (d.dir.includes("w")) w = d.originW - dx;
        if (d.dir.includes("s")) h = d.originH + dy;
        if (d.dir.includes("n")) h = d.originH - dy;
        w = clamp(w, FRAME_MIN_WIDTH, CARD_MAX_WIDTH);
        h = clamp(h, FRAME_MIN_HEIGHT, CARD_MAX_HEIGHT);
        let x = d.originCardX;
        let y = d.originCardY;
        if (d.dir.includes("w")) x = d.originCardX + (d.originW - w);
        if (d.dir.includes("n")) y = d.originCardY + (d.originH - h);
        resizeFrame(card.id, { width: w, height: h, x, y });
        return;
      }

      // 핸들 방향에 따라 한 축 변화량을 width로 환산. 비율은 강제(왜곡/잘림 방지).
      // - e/w/corner: dx로 width 직접 결정
      // - n/s: dy로 height 결정 → width = height * ratio
      let w: number;
      if (d.dir === "n" || d.dir === "s") {
        const hCandidate = d.dir === "s" ? d.originH + dy : d.originH - dy;
        w = hCandidate * ratio;
      } else {
        w = d.dir.includes("e") ? d.originW + dx : d.originW - dx;
      }

      w = clamp(w, minW, maxW);
      const h = w / ratio;

      // 좌/상 핸들은 카드 위치(x/y) 보정 — 반대편 가장자리를 고정한다.
      let x = d.originCardX;
      let y = d.originCardY;
      if (d.dir.includes("w")) x = d.originCardX + (d.originW - w);
      if (d.dir.includes("n")) y = d.originCardY + (d.originH - h);

      resizeCard(card.id, { width: w, height: h, x, y });
    };

    const cleanup = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    const onUp = () => {
      dragRef.current = null;
      cleanup();
      // FEAT-sticky-redesign §4: 판 크기 조정이 끝난 시점에만 전체 멤버십 재판정.
      if (isFrame) {
        const ids = useWorkspace
          .getState()
          .cards.filter((c) => c.kind !== "frame")
          .map((c) => c.id);
        resolveMembership(ids);
      }
    };

    dragRef.current = {
      dir,
      startX: e.clientX,
      startY: e.clientY,
      originW: card.width,
      originH: startH,
      originCardX: card.x,
      originCardY: card.y,
      cleanup,
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <>
      {visibleHandles.map(({ dir, cursor, hitStyle }) => (
        <span
          key={dir}
          data-resize-handle={dir}
          onMouseDown={onHandleMouseDown(dir)}
          className="absolute"
          style={{ ...hitStyle, cursor }}
        >
          <span
            aria-hidden
            className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-border bg-bg shadow-card"
          />
        </span>
      ))}
    </>
  );
}
