"use client";

type Props = {
  title?: string;
  body: string;
  meta?: string;
  tone?: "base" | "yellow" | "blue" | "lime" | "purple";
  rotation?: number; // ±도
  width?: number;
  className?: string;
};

const TONE_BG: Record<NonNullable<Props["tone"]>, string> = {
  base: "bg-card-base",
  yellow: "bg-card-yellow",
  blue: "bg-card-blue",
  lime: "bg-card-lime",
  purple: "bg-card-purple",
};

export function MemoCard({
  title,
  body,
  meta,
  tone = "base",
  rotation = 0,
  width = 240,
  className,
}: Props) {
  return (
    <article
      className={[
        "rounded-md border border-border/60 shadow-card",
        TONE_BG[tone],
        className ?? "",
      ].join(" ")}
      style={{
        width,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
      }}
    >
      <div className="p-4">
        {title && (
          <h3 className="mb-2 text-sm font-medium text-text">{title}</h3>
        )}
        <p className="whitespace-pre-line text-sm leading-6 text-text">
          {body}
        </p>
        {meta && (
          <p className="mt-3 text-[11px] text-text-soft">{meta}</p>
        )}
      </div>
    </article>
  );
}
