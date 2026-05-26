"use client";

type Props = {
  author: string;
  avatarHue?: "lime" | "blue" | "purple" | "yellow";
  time: string;
  body: string;
  width?: number;
  rotation?: number;
};

const AVATAR_BG: Record<NonNullable<Props["avatarHue"]>, string> = {
  lime: "bg-accent-lime",
  blue: "bg-accent-blue",
  purple: "bg-accent-purple",
  yellow: "bg-accent-yellow",
};

export function CommentCard({
  author,
  avatarHue = "lime",
  time,
  body,
  width = 280,
  rotation = 0,
}: Props) {
  return (
    <article
      className="rounded-md border border-border/40 bg-card-comment shadow-card"
      style={{
        width,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
      }}
    >
      <div className="p-3.5">
        <div className="mb-1.5 flex items-center gap-2">
          <span
            className={[
              "inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium text-bg",
              AVATAR_BG[avatarHue],
            ].join(" ")}
          >
            {author.slice(0, 1)}
          </span>
          <span className="text-sm font-medium text-text">{author}</span>
          <span className="text-[11px] text-text-soft">{time}</span>
        </div>
        <p className="ml-8 text-sm leading-6 text-text">{body}</p>
        <button className="ml-8 mt-1.5 cursor-pointer text-[12px] text-accent-blue hover:underline">
          답글
        </button>
      </div>
    </article>
  );
}
