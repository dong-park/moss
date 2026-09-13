"use client";

import { useMemo } from "react";
import { useT } from "@/i18n/Provider";
import { countBlocks, type BlockCounts } from "@/state/blocks";

/* ─────────────────────────────────────────────────────────────
 * FEAT-sticky-redesign n5 — 메모 앞면 하단 블록 개수 배지.
 *
 * 이미지는 앞면 위쪽에 실물(본문 칸 폭)로 보이므로 배지 대상이 아니다.
 * 링크·녹음·파일만 종류별 개수를 겹쳐 보여준다(spec AC-8). 0개인 종류는
 * 배지 자체를 렌더하지 않는다. 아이콘+숫자만 시각 노출하고, aria-label에
 * "녹음 2개" 식 전체 문구를 달아 스크린리더가 종류·개수를 함께 읽게 한다.
 *
 * 클릭하면(badge든 배지 영역이든) 메모 창을 연다(onActivate) — 앞면에는
 * 재생·열기 요소가 없으므로 배지가 유일한 진입점 중 하나다(AC-8).
 * ───────────────────────────────────────────────────────────── */

const BADGE_ORDER: { type: keyof Omit<BlockCounts, "image">; icon: string; key: string }[] = [
  { type: "audio", icon: "🎙️", key: "workspace.memoFront.badge.audio" },
  { type: "link", icon: "🔗", key: "workspace.memoFront.badge.link" },
  { type: "file", icon: "📎", key: "workspace.memoFront.badge.file" },
];

export function MemoFrontBadges({
  markdown,
  onActivate,
}: {
  markdown: string;
  onActivate: () => void;
}) {
  const t = useT();
  // 2단계 리뷰 P1-3: 카드 수백 장이 렌더될 때마다 정규식 스캔을 반복하지 않도록
  // markdown이 바뀔 때만 다시 센다.
  const counts = useMemo(() => countBlocks(markdown), [markdown]);
  const badges = BADGE_ORDER.filter((b) => counts[b.type] > 0);
  if (badges.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-1 z-20 flex justify-end gap-1 px-2"
      data-moss-front-badges
    >
      {badges.map((b) => (
        <button
          key={b.type}
          type="button"
          data-moss-front-badge={b.type}
          aria-label={t(b.key, { count: counts[b.type] })}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onActivate();
          }}
          className="pointer-events-auto flex cursor-pointer items-center gap-1 rounded-full border border-border bg-bg/90 px-2 py-0.5 text-[11px] text-text-soft shadow-card"
        >
          <span aria-hidden="true">{b.icon}</span>
          <span>{counts[b.type]}</span>
        </button>
      ))}
    </div>
  );
}
