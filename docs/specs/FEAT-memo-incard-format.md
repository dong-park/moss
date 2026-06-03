# FEAT-memo-incard-format (W3)

**Status**: ✅ complete (2026-06-04) — feat/memo-editor-seams 합본 머지. **Squad**: [[_squad-memo-production]] · [[FEAT-memo-editor-seams]]
**심각도**: 🟠 높음(학습성).

## 1. 목표
서식 툴바가 펼침 모달에만 있는 현 상태를 보완 — 카드 안 편집 중에도 텍스트 선택 시 떠오르는 버블 툴바로 서식을 적용한다.

## 2. 범위
**포함:** `editor/BubbleToolbar.tsx` + `extensions.ts` `bubbleMenuItems[]` 등록. 선택 영역 위에 floating 툴바(B/I/S/H1/H2/•/1./☑/❝/code). 기존 `MarkdownToolbar`의 커맨드 매핑 재사용(중복 로직 추출 공유).
**제외:** 슬래시(`/`) 메뉴는 다음 iteration(범위 확정만, 구현은 §9). 모달 툴바(이미 존재) 변경 금지.

## 3. 수용 기준
- **AC-1** Given 인카드 편집 중 텍스트 선택, When 선택 완료, Then 선택 위에 버블 툴바 노출.
- **AC-2** Given 버블의 B 클릭, When 클릭, Then 선택에 bold 적용 + 포커스·선택 유지(onMouseDown preventDefault).
- **AC-3** 선택 해제/blur 시 버블 사라짐.
- **AC-4** 현재 서식 활성 표시(isActive — bold 안이면 B 강조).
- **AC-5** 모달 툴바와 동일 i18n 키 재사용, 회귀 0.

## 4. 의존성
P0(`bubbleMenuItems` 슬롯 + 호스트). MarkdownToolbar 커맨드 로직.

## 5. 데이터 모델
변경 없음(서식은 마크다운 본문에 반영).

## 6. 인터페이스
```ts
// editor/BubbleToolbar.tsx
export const memoBubbleItems: BubbleMenuItem[];   // bubbleMenuItems.push(...memoBubbleItems)
// MarkdownToolbar에서 공유할 커맨드 맵 추출
export const FORMAT_COMMANDS: Record<string, { run; isActive; aria; label }>;
```

## 7. 시각·인터랙션
버블은 선택 상단 중앙, 화살표 없는 둥근 카드(shadow). 뷰포트 경계서 클램프. 모바일 터치 선택도 동작(가능 범위).

## 8. 비기능
선택 변경마다 위치 재계산은 rAF throttle. 펜 모드(active)일 땐 버블 억제(그리기 우선).

## 9. 다음 iteration
`/` 슬래시 커맨드 메뉴(빈 줄에서 블록 삽입), 링크 삽입 버튼(W5 wikilink·W10 autolink와 합류).

## 10. DOD
- [ ] BubbleToolbar + bubbleMenuItems 등록, 커맨드 맵 공유 추출
- [ ] 선택 시 노출·서식 적용·isActive·blur 소거
- [ ] AC-1~5, tsc 0, 단위 테스트
