"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n/Provider";
import {
  parseLink,
  serializeLink,
  type LinkContent,
} from "@/state/cardContent";
import { useClipboardWatch } from "../../useClipboardWatch";
import { cardSurface } from "../_shared/surface";
import { useAutoFocusOnEdit } from "../_shared/useAutoFocusOnEdit";
import type { CardContentProps } from "../_shared/types";

/* ─────────────────────────────────────────────────────────────
 * Link — URL + 제목 + 설명 메타 편집 → /api/preview로 OG 메타 fetch
 *
 * 키보드 (P1-D, SIDEBAR-CARDS-UX §6):
 *   Esc            : commit
 *   Enter (URL)    : URL commit + Open Graph fetch 트리거
 *   Tab/Shift+Tab  : URL ↔ 제목 ↔ 설명 메타 필드 이동
 *   Cmd/Ctrl+K     : 편집 모드 안에서 URL 필드로 포커스 점프
 *
 * inset (PNG 종이 영역, v2/link.png):
 *   thumb 영역 = top 6% / bottom 47% / left 5% / right 7%
 *   meta  영역 = top 53% / bottom 4% / left 5% / right 7%
 * ───────────────────────────────────────────────────────────── */

type LinkField = "url" | "title" | "summary";
const FIELD_ORDER: LinkField[] = ["url", "title", "summary"];

interface LinkFetchState {
  status: "idle" | "loading" | "error";
}

export function LinkCardContent({
  card,
  editing,
  onChange,
  onCommitEdit,
}: CardContentProps) {
  const t = useT();
  const data = useMemo(() => parseLink(card.content), [card.content]);
  const [draftUrl, setDraftUrl] = useState(data.url);
  const [draftTitle, setDraftTitle] = useState(data.title ?? "");
  const [draftSummary, setDraftSummary] = useState(data.summary ?? "");
  const [fetchState, setFetchState] = useState<LinkFetchState>({ status: "idle" });
  const [focusedField, setFocusedField] = useState<LinkField | null>(null);

  const urlRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLInputElement>(null);

  const refOf = (f: LinkField) =>
    f === "url" ? urlRef : f === "title" ? titleRef : summaryRef;

  // T-7: clipboard 자동 채움 시도 (link 종)
  useClipboardWatch("link", card.id);

  // 외부에서 카드 컨텐츠가 바뀌면 draft 동기화 (clipboard auto-paste, fetch 결과 반영 등).
  /* eslint-disable react-hooks/set-state-in-effect -- sync from card.content */
  useEffect(() => {
    setDraftUrl(data.url);
    setDraftTitle(data.title ?? "");
    setDraftSummary(data.summary ?? "");
  }, [data.url, data.title, data.summary]);

  // FEAT-card-entry-mode §6: link 자동 포커스 타겟 = input[data-card-url].
  // editing 진입 시 url 유무 무관하게 URL 필드로 포커스 박힘.
  useAutoFocusOnEdit(urlRef, editing);
  useEffect(() => {
    if (editing && !data.url) {
      setFocusedField("url");
    }
  }, [editing, data.url]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // focusedField 변경 → 해당 input으로 실제 포커스 이동.
  useEffect(() => {
    if (!focusedField) return;
    const el = refOf(focusedField).current;
    if (!el || document.activeElement === el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [focusedField]);

  const commitUrl = async (raw: string) => {
    const url = raw.trim();
    if (!url) {
      // 빈 URL — preview 비움
      onChange("");
      return;
    }
    // 일단 URL+현재 메타만 저장 (preview 실패해도 카드 유지)
    onChange(
      serializeLink({
        url,
        title: draftTitle || undefined,
        summary: draftSummary || undefined,
      }),
    );
    setFetchState({ status: "loading" });
    try {
      const res = await fetch(
        `/api/preview?url=${encodeURIComponent(url)}`,
        { method: "GET" },
      );
      if (!res.ok) {
        setFetchState({ status: "error" });
        return;
      }
      const meta = (await res.json()) as LinkContent;
      onChange(serializeLink({ ...meta, url: meta.url || url }));
      setFetchState({ status: "idle" });
    } catch {
      setFetchState({ status: "error" });
    }
  };

  // title/summary는 입력 즉시 카드 컨텐츠에 반영 (fetch 없음).
  const commitMeta = (next: Partial<LinkContent>) => {
    onChange(
      serializeLink({
        url: draftUrl,
        title: next.title ?? (draftTitle || undefined),
        summary: next.summary ?? (draftSummary || undefined),
        thumbUrl: data.thumbUrl,
      }),
    );
  };

  /**
   * 카드 어디서든 Cmd/Ctrl+K → URL 필드 점프 (편집 모드 전용).
   * 각 input의 onKeyDown에서 위임 호출.
   */
  const handleSharedKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      setFocusedField("url");
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
      onCommitEdit();
      return true;
    }
    return false;
  };

  const moveField = (from: LinkField, delta: 1 | -1) => {
    const idx = FIELD_ORDER.indexOf(from);
    const next = FIELD_ORDER[idx + delta];
    if (!next) return false;
    setFocusedField(next);
    return true;
  };

  const hostname = (() => {
    try {
      return new URL(data.url).hostname;
    } catch {
      return data.url;
    }
  })();

  const showEditor = editing || !data.url;

  return (
    <div
      className="relative h-full overflow-hidden"
      style={{
        minHeight: 160,
        borderRadius: 6,
        ...cardSurface("link"),
      }}
    >
      {/*
       * Thumb 영역 — PNG 상단 회색 thumb 박스 정렬 (top 6% / bottom 47%).
       * data.thumbUrl이 있을 때만 채우고, 비어 있어도 영역은 유지해 메타 영역 위치가 흔들리지 않게 한다.
       */}
      <div
        className="absolute overflow-hidden"
        style={{ top: "6%", bottom: "47%", left: "5%", right: "7%" }}
      >
        {data.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.thumbUrl}
            alt=""
            className="block h-full w-full object-cover"
            draggable={false}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : null}
      </div>

      {/*
       * Meta 영역 — PNG 하단 흰 종이 텍스트 영역 정렬 (top 53% / bottom 4%).
       * 편집 모드면 URL/제목/설명 3개 input, 표시 모드면 메타 + hostname.
       */}
      <div
        className="absolute overflow-auto"
        style={{ top: "53%", bottom: "4%", left: "5%", right: "7%" }}
      >
        {showEditor ? (
          <div className="space-y-1.5">
            <input
              ref={urlRef}
              type="url"
              data-card-url
              value={draftUrl}
              onFocus={() => setFocusedField("url")}
              onChange={(e) => setDraftUrl(e.target.value)}
              onBlur={() => {
                if (draftUrl !== data.url) void commitUrl(draftUrl);
              }}
              onKeyDown={(e) => {
                if (handleSharedKey(e)) return;
                if (e.key === "Enter") {
                  // URL commit + Open Graph fetch
                  e.preventDefault();
                  void commitUrl(draftUrl);
                  return;
                }
                if (e.key === "Tab") {
                  // 명시적으로 다음 메타 필드로 이동 (브라우저 기본 Tab은 카드 밖으로 빠질 수 있음).
                  e.preventDefault();
                  moveField("url", e.shiftKey ? -1 : 1);
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder={t("capture.link.urlPlaceholder")}
              className="w-full bg-transparent text-[12px] text-text outline-none placeholder:text-text-soft"
            />
            <input
              ref={titleRef}
              type="text"
              value={draftTitle}
              onFocus={() => setFocusedField("title")}
              onChange={(e) => {
                const v = e.target.value;
                setDraftTitle(v);
                commitMeta({ title: v || undefined });
              }}
              onBlur={() => onCommitEdit()}
              onKeyDown={(e) => {
                if (handleSharedKey(e)) return;
                if (e.key === "Tab") {
                  e.preventDefault();
                  moveField("title", e.shiftKey ? -1 : 1);
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder={t("capture.link.titlePlaceholder")}
              className="w-full bg-transparent text-[13px] font-medium text-text outline-none placeholder:text-text-soft"
            />
            <input
              ref={summaryRef}
              type="text"
              value={draftSummary}
              onFocus={() => setFocusedField("summary")}
              onChange={(e) => {
                const v = e.target.value;
                setDraftSummary(v);
                commitMeta({ summary: v || undefined });
              }}
              onBlur={() => onCommitEdit()}
              onKeyDown={(e) => {
                if (handleSharedKey(e)) return;
                if (e.key === "Tab") {
                  e.preventDefault();
                  moveField("summary", e.shiftKey ? -1 : 1);
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder={t("capture.link.summaryPlaceholder")}
              className="w-full bg-transparent text-[11px] text-text-muted outline-none placeholder:text-text-soft"
            />
          </div>
        ) : (
          <div className="space-y-1">
            {data.title && (
              <div className="text-[13px] font-medium text-text leading-snug line-clamp-2">
                {data.title}
              </div>
            )}
            {data.summary && (
              <div className="text-[11px] text-text-muted leading-snug line-clamp-2">
                {data.summary}
              </div>
            )}
            <div className="text-[11px] text-text-soft">{hostname}</div>
          </div>
        )}
        {fetchState.status === "loading" && (
          <div className="mt-1 text-[10px] text-text-soft">
            {t("capture.link.loading")}
          </div>
        )}
        {fetchState.status === "error" && (
          <div className="mt-1 text-[10px] text-text-soft">
            {t("capture.link.fetchFailed")}
          </div>
        )}
      </div>
    </div>
  );
}
