"use client";

import { useT } from "@/i18n/Provider";

export function RhythmSection({ rhythm }: { rhythm: number[] }) {
  const t = useT();
  const max = Math.max(1, ...rhythm);
  const barWidth = 11;
  const barGap = 2;
  const height = 48;
  const width = rhythm.length * (barWidth + barGap) - barGap;

  return (
    <section className="px-5 py-4">
      <h3 className="mb-1 text-[13px] font-medium text-text-muted tracking-wide">
        {t("signals.rhythm.heading")}
      </h3>
      <p className="mb-3 text-[11px] text-text-soft">
        {t("signals.rhythm.subtitle")}
      </p>
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height + 14}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={t("signals.rhythm.heading")}
      >
        {rhythm.map((count, hour) => {
          const h = max ? (count / max) * height : 0;
          const x = hour * (barWidth + barGap);
          const y = height - h;
          return (
            <g key={hour}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={h}
                rx={1.5}
                fill="var(--color-accent-blue)"
                opacity={count ? 0.7 : 0.12}
              />
            </g>
          );
        })}
        {[0, 6, 12, 18].map((h) => (
          <text
            key={h}
            x={h * (barWidth + barGap) + barWidth / 2}
            y={height + 11}
            fontSize="9"
            fill="var(--color-text-soft)"
            textAnchor="middle"
          >
            {h}
          </text>
        ))}
      </svg>
    </section>
  );
}
