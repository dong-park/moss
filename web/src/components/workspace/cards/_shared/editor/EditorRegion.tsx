"use client";

/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-editor-seams (P0) + FEAT-memo-a11y (W9) — 에디터 본문 a11y 래퍼.
 *
 * Milkdown 에디터를 감싸 스크린리더용 role/aria를 붙인다. display:contents라
 * 박스를 만들지 않아 펜 overlay 좌표계(MEMO_CONTENT_WIDTH 컬럼)를 건드리지
 * 않는다 — 시각·정렬 불변(레이아웃 시프트 0).
 *
 * W9가 P0가 연 표면 위에 보강한 것(AC-1~5):
 *  - 라벨 i18n (workspace.memo.editor.label) — useT 컨텍스트 번역.
 *  - aria-keyshortcuts로 인카드 서식 단축(Cmd/Ctrl+B·I·E) 노출(commonmark
 *    프리셋 keymap이 실제 바인딩: Mod-b 굵게 / Mod-i 기울임 / Mod-e 인라인코드).
 *  - .ProseMirror:focus-visible 가시 포커스 링(ink-blue 2px, outline이라 reflow
 *    없음 → 레이아웃 시프트 0, 애니메이션 없음 → prefers-reduced-motion 무관).
 *  - 펜 모드 토글·저장 상태를 aria-live(polite)로 SR 안내.
 *
 * 라이브 안내 주의: 캔버스엔 EditorRegion이 카드 수만큼 동시에 마운트되므로
 * 단순히 각자 live 영역을 그리면 펜 토글 한 번에 N번 낭독된다. 그래서 라이브
 * 영역은 owner 레지스트리로 "정확히 1개"만 렌더하고, 안내 메시지는 모듈 store를
 * 거쳐 그 한 영역이 읽는다(저장 안내는 편집 중인 카드가, 펜 안내는 owner가 push).
 * ───────────────────────────────────────────────────────────── */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useT } from "@/i18n/Provider";
import { useWorkspace } from "@/state/workspace";

/* commonmark keymap 실제 바인딩(node_modules/@milkdown/preset-commonmark):
 * Mod-b=강조(굵게), Mod-i=기울임, Mod-e=인라인 코드. Mod은 mac=Cmd, 그 외=Ctrl.
 * aria-keyshortcuts는 둘 다 노출해 SR이 사용자 플랫폼에 맞게 안내한다. */
const FORMAT_SHORTCUTS = "Control+B Meta+B Control+I Meta+I Control+E Meta+E";

/* 가시 포커스 링 — 메모 에디터 한정 ink-blue 2px. data-memo-editor로 스코프해
 * 전역 *:focus-visible(라임)보다 높은 명시도로 덮는다. outline은 흐름을 차지하지
 * 않아 레이아웃 시프트 0, transition 없음 → reduced-motion 영향 없음.
 * React 19 hoistable <style>(href+precedence)로 head에 1회만 삽입·중복 제거. */
const FOCUS_RING_CSS = `
[data-memo-editor]:not([data-memo-expanded]) .ProseMirror:focus-visible {
  outline: 2px solid var(--color-accent-blue);
  outline-offset: 2px;
  border-radius: 4px;
}
/* 펼치기 모달은 포커스 시 ProseMirror 자체 outline과 노드 선택(이미지 등) 시 뜨는
 * 기본 파란 outline을 모두 끈다 — "펼치면 파란 라인 없음". */
[data-memo-editor][data-memo-expanded] .ProseMirror,
[data-memo-editor][data-memo-expanded] .ProseMirror:focus,
[data-memo-editor][data-memo-expanded] .ProseMirror:focus-visible,
[data-memo-editor][data-memo-expanded] .ProseMirror-selectednode {
  outline: none;
}`;

/* ── SR 라이브 안내 store(모듈 싱글톤) ─────────────────────────
 * trailing space를 토글해 동일 문구가 연속으로 와도 텍스트 노드가 바뀌어
 * 재낭독되게 한다(SR은 끝 공백을 무시 → 읽히는 내용은 동일). */
let liveMessage = "";
let liveToggle = false;
const liveSubs = new Set<() => void>();
function announceEditor(message: string) {
  liveToggle = !liveToggle;
  liveMessage = liveToggle ? message : `${message} `;
  liveSubs.forEach((fn) => fn());
}
function subscribeLive(cb: () => void) {
  liveSubs.add(cb);
  return () => liveSubs.delete(cb);
}
const getLive = () => liveMessage;
const getLiveServer = () => "";

/* ── live 영역 owner 레지스트리 ────────────────────────────────
 * 마운트 순서대로 등록, 항상 owners[0]만 owner. owner가 언마운트되면 다음
 * 인스턴스가 자동 승계 → 마운트된 EditorRegion이 1개 이상이면 라이브 영역 정확히 1개. */
const owners: object[] = [];
const ownerSubs = new Set<() => void>();
function notifyOwners() {
  ownerSubs.forEach((fn) => fn());
}
function useIsLiveOwner(): boolean {
  // 안정 식별자 — useState 지연 초기화로 렌더 중 ref 접근(react-hooks/refs) 회피.
  const [token] = useState<object>(() => ({}));
  const subscribe = useCallback((cb: () => void) => {
    ownerSubs.add(cb);
    return () => ownerSubs.delete(cb);
  }, []);
  const isOwner = useSyncExternalStore(
    subscribe,
    () => owners[0] === token,
    () => false,
  );
  useEffect(() => {
    owners.push(token);
    notifyOwners();
    return () => {
      const i = owners.indexOf(token);
      if (i >= 0) owners.splice(i, 1);
      notifyOwners();
    };
  }, [token]);
  return isOwner;
}

export function EditorRegion({
  children,
  editable,
  label,
  expanded,
}: {
  children: ReactNode;
  editable: boolean;
  label?: string;
  // 펼치기 모달 본문이면 포커스 링을 끈다(data-memo-expanded로 CSS 스코프).
  expanded?: boolean;
}) {
  const t = useT();
  const resolvedLabel = label ?? t("workspace.memo.editor.label");
  const isOwner = useIsLiveOwner();
  const penMode = useWorkspace((s) => s.penMode);

  // 저장 안내(AC-4): 편집 이탈(editable true→false) = 커밋/영속 시점 → "저장됨".
  // 한 번에 한 카드만 편집 가능하므로 owner가 아니어도 안내가 겹치지 않는다.
  const wasEditable = useRef(editable);
  useEffect(() => {
    if (wasEditable.current && !editable) {
      announceEditor(t("workspace.memo.editor.saved"));
    }
    wasEditable.current = editable;
  }, [editable, t]);

  // 펜 모드 안내(AC-4): 보드 전역 모드라 owner만 1회 안내. 초기 마운트는 침묵.
  // prevPen은 owner 여부와 무관하게 동기화 → owner 승계 시 헛안내 방지.
  const prevPen = useRef(penMode);
  useEffect(() => {
    if (penMode !== prevPen.current) {
      if (isOwner) {
        announceEditor(
          penMode
            ? t("workspace.memo.editor.penModeOn")
            : t("workspace.memo.editor.penModeOff"),
        );
      }
      prevPen.current = penMode;
    }
  }, [isOwner, penMode, t]);

  return (
    <>
      <style href="moss-memo-editor-a11y" precedence="medium">
        {FOCUS_RING_CSS}
      </style>
      <div
        data-memo-editor
        data-memo-expanded={expanded ? "" : undefined}
        role="textbox"
        aria-multiline="true"
        aria-readonly={!editable}
        aria-label={resolvedLabel}
        aria-keyshortcuts={FORMAT_SHORTCUTS}
        style={{ display: "contents" }}
      >
        {children}
      </div>
      {isOwner && <EditorLiveRegion />}
    </>
  );
}

/* 단일 라이브 영역 — owner만 렌더. sr-only로 시각엔 안 보이고 SR만 낭독. */
function EditorLiveRegion() {
  const message = useSyncExternalStore(subscribeLive, getLive, getLiveServer);
  return (
    <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </span>
  );
}
