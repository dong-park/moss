"use client";

import type { TemplateId } from "@/templates";

/**
 * FEAT-templates §7: 5종 템플릿 미리보기.
 * 단순 선화. 외부 자산 없이 SVG 인라인.
 * 80x60 viewBox. 색은 토큰 `border-strong`/`text-soft`로 디자인 일관성 유지.
 */
export function TemplatePreview({ id }: { id: TemplateId }) {
  return (
    <svg
      viewBox="0 0 80 60"
      width="80"
      height="60"
      aria-hidden="true"
      className="text-text-soft"
    >
      <rect
        x="2"
        y="2"
        width="76"
        height="56"
        rx="4"
        fill="var(--color-panel)"
        stroke="currentColor"
        strokeWidth="1"
      />
      {renderShape(id)}
    </svg>
  );
}

function renderShape(id: TemplateId) {
  switch (id) {
    case "free":
      return null;
    case "mindmap":
      return (
        <g stroke="currentColor" strokeWidth="1" fill="none">
          <circle cx="40" cy="30" r="6" fill="var(--color-bg)" />
          <line x1="40" y1="30" x2="20" y2="14" />
          <line x1="40" y1="30" x2="60" y2="14" />
          <line x1="40" y1="30" x2="20" y2="46" />
          <line x1="40" y1="30" x2="60" y2="46" />
          <circle cx="20" cy="14" r="2.5" />
          <circle cx="60" cy="14" r="2.5" />
          <circle cx="20" cy="46" r="2.5" />
          <circle cx="60" cy="46" r="2.5" />
        </g>
      );
    case "project":
      return (
        <g stroke="currentColor" strokeWidth="1" fill="var(--color-bg)">
          <rect x="8" y="10" width="28" height="40" rx="2" />
          <rect x="44" y="10" width="28" height="40" rx="2" />
          <line x1="12" y1="18" x2="32" y2="18" />
          <line x1="48" y1="18" x2="68" y2="18" />
          <line x1="12" y1="28" x2="28" y2="28" />
          <line x1="48" y1="28" x2="64" y2="28" />
        </g>
      );
    case "research":
      return (
        <g stroke="currentColor" strokeWidth="1" fill="var(--color-bg)">
          <rect x="8" y="8" width="64" height="20" rx="2" />
          <rect x="8" y="32" width="64" height="20" rx="2" />
          <line x1="12" y1="14" x2="40" y2="14" />
          <line x1="12" y1="20" x2="36" y2="20" />
          <line x1="12" y1="38" x2="40" y2="38" />
          <line x1="12" y1="44" x2="32" y2="44" />
        </g>
      );
    case "diary":
      return (
        <g stroke="currentColor" strokeWidth="1" fill="var(--color-bg)">
          <rect x="22" y="10" width="36" height="10" rx="2" />
          <line x1="26" y1="15" x2="54" y2="15" />
          <rect x="22" y="26" width="36" height="24" rx="2" strokeDasharray="3 2" />
        </g>
      );
  }
}
