import { useEffect, type RefObject } from "react";

/**
 * 카드 Content가 편집 모드로 전이될 때 ref 대상에 포커스를 박는다.
 * mount 직후 발동을 위해 `useEffect` dependency에 `isEditing` 포함.
 *
 * spec: FEAT-card-entry-mode §6 — 카드 종류별 기본 포커스 타겟 자동 진입.
 *
 * @example
 *   const inputRef = useRef<HTMLTextAreaElement>(null);
 *   useAutoFocusOnEdit(inputRef, editingId === card.id);
 */
export function useAutoFocusOnEdit<T extends HTMLElement>(
  ref: RefObject<T | null>,
  isEditing: boolean,
): void {
  useEffect(() => {
    if (!isEditing) return;
    const el = ref.current;
    if (!el) return;
    // textarea·input은 cursor를 end로 이동 (값 끝에서 추가 입력)
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
    el.focus({ preventScroll: false });
  }, [isEditing, ref]);
}
