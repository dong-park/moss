/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-autolink (W10) — URL 자동 링크화.
 *
 * 본문에 URL을 타이핑하거나 단독 URL을 붙여넣으면 클릭 가능한 link 마크로
 * 변환한다([[FEAT-memo-autolink]]). P0 슬롯([[_squad-memo-production]])의
 * editorPlugins[]에 `...autolink` 한 줄로 등록되며, 다른 워커 파일은 건드리지
 * 않는다.
 *
 * gfm 프리셋은 remark-gfm autolink-literal을 통해 "마크다운 파싱 시점"에만
 * bare URL을 링크로 만든다 — 라이브 에디터에서 키 입력 도중에는 작동하지
 * 않으므로(ProseMirror 노드 트리는 재파싱되지 않음) 입력 규칙(InputRule)이
 * 필요하다. 따라서 gfm 설정만으로는 AC-1을 만족할 수 없어 신규 플러그인을 둔다.
 *
 * 구성:
 *  ① autolinkInputRule — 공백 트리거로 직전 URL에 link 마크 부여 (AC-1)
 *  ② autolinkPaste     — 단독 URL 텍스트 붙여넣기를 링크화 (AC-2)
 *  ③ externalLinkAttr  — link 마크 DOM에 target=_blank·rel 부여 (AC-3)
 *
 * 코드블록/인라인코드 예외(AC-4): ProseMirror inputrules는 code 노드/마크
 * 안에서 규칙을 건너뛴다(prosemirror-inputrules `run`). paste 경로는 직접
 * 선택 컨텍스트를 검사한다.
 *
 * 보수적 정규식(AC-5·§8): 스킴(http/https/www)으로 시작하고 공백·꺾쇠를 제외한
 * 단일 `[^\s<>]+` 본문만 허용 — 단일 양화사라 백트래킹 폭발(ReDoS)이 없다.
 * 후행 구두점은 별도로 트림해 거짓 양성을 줄인다.
 * ───────────────────────────────────────────────────────────── */

import type { Ctx, MilkdownPlugin } from "@milkdown/ctx";
import { InitReady } from "@milkdown/core";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { InputRule } from "@milkdown/prose/inputrules";
import { $inputRule, $prose } from "@milkdown/utils";
import { linkAttr, linkSchema } from "@milkdown/preset-commonmark";

/* ── URL 패턴(보수적·ReDoS 안전) ───────────────────────────────
 * 본문은 단일 부정 문자클래스 + 단일 `+` 양화사뿐이라 선형 매칭. 중첩/겹치는
 * 양화사가 없어 catastrophic backtracking이 발생할 수 없다. */
const PROTOCOL = "(?:https?:\\/\\/|www\\.)";
const URL_BODY = "[^\\s<>]+";

/* 타이핑: 직전 토큰 경계(단어/이메일 중간 아님) + URL + 트리거 공백($). */
const INPUT_RULE_RE = new RegExp(
  `(?<![\\w@/.-])(${PROTOCOL}${URL_BODY})(\\s)$`,
);

/* 붙여넣기: 클립보드 전체가 단독 URL인지(앞뒤 잡텍스트 없음). */
const STANDALONE_RE = new RegExp(`^${PROTOCOL}${URL_BODY}$`);

/** 후행 구두점·짝 안 맞는 닫는 괄호를 URL 끝에서 떼어낸다(거짓 양성 최소). */
export function trimTrailingPunctuation(url: string): string {
  let u = url.replace(/[.,;:!?'"]+$/, "");
  // 짝이 맞지 않는 닫는 괄호만 제거(위키피디아식 (disambiguation) 경로 보존).
  while (u.endsWith(")")) {
    const opens = (u.match(/\(/g) ?? []).length;
    const closes = (u.match(/\)/g) ?? []).length;
    if (closes <= opens) break;
    u = u.slice(0, -1);
  }
  return u;
}

/** href 정규화: www.로 시작하면 https:// 보충, 그 외 원형 유지. */
export function normalizeHref(url: string): string {
  return /^www\./i.test(url) ? `https://${url}` : url;
}

/** 클립보드 텍스트가 (구두점 트림 후) 단독 URL인지. */
export function isStandaloneUrl(text: string): boolean {
  return STANDALONE_RE.test(trimTrailingPunctuation(text.trim()));
}

/* ── ① 입력 규칙 — 타이핑 후 공백 → 링크(AC-1) ─────────────────
 * code 노드/마크 안에서는 prosemirror-inputrules가 규칙을 건너뛰므로(AC-4)
 * 별도 가드가 필요 없다. 매칭된 URL 범위에만 link 마크를 부여하고, 트리거
 * 공백 뒤로는 마크가 이어지지 않도록 stored mark를 제거한다. */
const autolinkInputRule = $inputRule(
  (ctx: Ctx) =>
    new InputRule(INPUT_RULE_RE, (state, match, start) => {
      const raw = match[1];
      if (!raw) return null;
      const url = trimTrailingPunctuation(raw);
      if (!url) return null;
      const linkType = linkSchema.type(ctx);
      // match[0]은 URL로 시작(lookbehind는 zero-width) → start가 곧 URL 시작.
      const urlStart = start;
      const urlEnd = urlStart + url.length;
      const tr = state.tr.addMark(
        urlStart,
        urlEnd,
        linkType.create({ href: normalizeHref(url) }),
      );
      tr.removeStoredMark(linkType);
      return tr;
    }),
);

/* ── ② 붙여넣기 — 단독 URL 텍스트 → 링크(AC-2) ─────────────────
 * 서식 있는 HTML 페이스트와 다중 라인/혼합 텍스트는 기본 마크다운 처리에
 * 맡기고(거짓 양성·서식 손실 방지), 클립보드 전체가 한 개의 URL일 때만
 * 가로챈다(§2 "붙인 단독 URL"). 코드블록/인라인코드 컨텍스트는 제외(AC-4). */
const autolinkPaste = $prose(
  (ctx: Ctx) =>
    new Plugin({
      key: new PluginKey("MEMO_AUTOLINK_PASTE"),
      props: {
        handlePaste: (view, event) => {
          const cd = event.clipboardData;
          if (!cd) return false;
          // 서식 포함 페이스트는 sanitize/markdown 경로에 양보.
          if (cd.types.includes("text/html")) return false;
          const text = cd.getData("text/plain").trim();
          if (!text || !isStandaloneUrl(text)) return false;

          const { $from, from, to } = view.state.selection;
          if ($from.parent.type.spec.code) return false;
          if ($from.marks().some((m) => m.type.spec.code)) return false;

          const url = trimTrailingPunctuation(text);
          const linkType = linkSchema.type(ctx);
          const tr = view.state.tr.insertText(text, from, to);
          // 트림된 후행 구두점은 링크 밖 평문으로 남긴다.
          tr.addMark(
            from,
            from + url.length,
            linkType.create({ href: normalizeHref(url) }),
          );
          tr.removeStoredMark(linkType);
          view.dispatch(tr.scrollIntoView());
          return true;
        },
      },
    }),
);

/* ── ③ 외부 링크 속성 — 새 탭·rel(AC-3) ────────────────────────
 * link 마크 toDOM은 `...ctx.get(linkAttr.key)(mark)`를 펼친다. 그 함수를
 * 교체해 모든 메모 링크가 새 탭에서 안전하게 열리도록(target=_blank,
 * rel=noopener noreferrer) 한다. InitReady 이후 commonmark의 linkAttr
 * 슬라이스가 주입돼 있으므로 그 시점에 설정한다. */
const externalLinkAttr: MilkdownPlugin = (ctx) => async () => {
  await ctx.wait(InitReady);
  ctx.set(linkAttr.key, () => ({
    target: "_blank",
    rel: "noopener noreferrer",
  }));
};

/**
 * editorPlugins[]에 `...autolink`로 등록되는 W10 플러그인 묶음.
 * (입력 규칙 + 붙여넣기 + 외부 링크 속성)
 */
export const autolink: MilkdownPlugin[] = [
  externalLinkAttr,
  autolinkInputRule,
  autolinkPaste,
];
