"use client";

import { useMemo } from "react";
import type { Card, Viewport } from "@/state/workspace";

/**
 * FEAT-canvas AC-3 (REQ-16) 가상화.
 *
 * 카드는 동적 height(content 의존)를 갖지만 측정 없이 보수적 max로 가정한다.
 * 실측보다 큰 ESTIMATED_CARD_HEIGHT를 사용하면 카드가 viewport에 들어오기 전에
 * 마운트되어 jank 없이 자연스럽게 노출된다.
 */
const ESTIMATED_CARD_HEIGHT = 800;

/** screen 단위 over-render padding. world 단위로 환산해 viewport rect 확장. */
const OVERSCAN_SCREEN_PX = 200;

interface Args {
  cards: Card[];
  viewport: Viewport;
  /** 캔버스 실측 크기 (screen px). 0이면 측정 전이므로 전부 노출 → 첫 페인트 안정. */
  canvasSize: { width: number; height: number };
  /**
   * unmount 금지 카드 — 편집 중 카드가 pan으로 viewport를 벗어나도 focus를 잃지 않게.
   * 드래그 중 카드는 마우스를 따라다녀 자동으로 viewport 안이므로 핀 불필요.
   */
  editingId?: string | null;
}

export function useVirtualizedCards({
  cards,
  viewport,
  canvasSize,
  editingId,
}: Args): Card[] {
  return useMemo(() => {
    if (canvasSize.width <= 0 || canvasSize.height <= 0) return cards;

    const overscan = OVERSCAN_SCREEN_PX / viewport.scale;
    const worldLeft = -viewport.x / viewport.scale - overscan;
    const worldTop = -viewport.y / viewport.scale - overscan;
    const worldRight =
      (canvasSize.width - viewport.x) / viewport.scale + overscan;
    const worldBottom =
      (canvasSize.height - viewport.y) / viewport.scale + overscan;

    return cards.filter((card) => {
      if (card.id === editingId) return true;
      const cardRight = card.x + card.width;
      // 사용자가 리사이즈한 카드는 ESTIMATED_CARD_HEIGHT를 초과할 수 있으므로
      // 명시 height를 반영해 컬링이 카드 아래쪽을 잘라먹지 않게 한다.
      const cardBottom =
        card.y + Math.max(card.height ?? 0, ESTIMATED_CARD_HEIGHT);
      return (
        card.x < worldRight &&
        cardRight > worldLeft &&
        card.y < worldBottom &&
        cardBottom > worldTop
      );
    });
  }, [
    cards,
    viewport.x,
    viewport.y,
    viewport.scale,
    canvasSize.width,
    canvasSize.height,
    editingId,
  ]);
}

export const _virtualizationInternals = {
  ESTIMATED_CARD_HEIGHT,
  OVERSCAN_SCREEN_PX,
};
