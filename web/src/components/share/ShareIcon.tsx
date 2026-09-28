"use client";

/**
 * 시안 v3 ① 우상단 공유 아이콘(업로드 화살표). 15px 글리프.
 */
export function ShareIcon({ className }: { className?: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M8 1.5v9M5 4.5l3-3 3 3M4 7H3v7.5h10V7h-1" />
    </svg>
  );
}
