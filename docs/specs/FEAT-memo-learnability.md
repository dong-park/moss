# FEAT-memo-learnability · 메모 학습성 (마크다운 힌트)

> 사이드바 블록 버튼이 사라진 빈 메모에서, 무엇을 칠 수 있는지(마크다운 문법)를 한 줄로 알려준다.

**Status**: spec
**Estimated**: S
**Owner**: (WS-C)
**Reference**: deep-interview UX 피드백 (2026-06-03) — D1

---

## 1. 목표 (Job Statement)

처음 메모를 쓰는 사용자가 / 빈 메모 카드에서 / `# 제목`·`- [ ] 할일`·`>` 같은 마크다운 문법을 / 별도 학습 없이 발견해 바로 쓸 수 있게 한다.

[[FEAT-markdown-memo-pen]]가 사이드바의 code/checklist/highlight 버튼을 제거하고 마크다운 문법으로 대체했는데, v1엔 슬래시 커맨드도 문법 힌트도 없어 "체크리스트 버튼"으로 만들던 사용자가 `- [ ]`를 칠 줄 모르는 학습 절벽이 있다.

## 2. 범위

### 포함 (in-scope)
- **D1**: 빈 메모 placeholder에 마크다운 치트시트 1줄 노출. 예: `# 제목 · - [ ] 할일 · > 인용 · ``` 코드`.

### 제외 (out-of-scope, 다른 단위 담당)
- 슬래시 커맨드·단축 메뉴 — [[FEAT-markdown-memo-pen]] §9 보류 유지.
- 코치마크/온보딩 투어 — 차기.
- 펜 모드 UX — [[FEAT-pen-mode-ux]].

## 3. 수용 기준 (Acceptance Criteria, GWT)

### AC-1 빈 메모 힌트
- **Given** 내용이 비어 있는 새 메모 카드를 편집 진입
- **When** 아직 아무것도 입력하지 않음
- **Then** placeholder로 핵심 마크다운 문법 치트시트가 보이고, 입력 시작 시 사라진다.

### AC-2 비파괴
- **Given** 이미 내용이 있는 메모
- **When** 편집 진입
- **Then** placeholder는 표시되지 않고 기존 내용이 그대로 보인다.

## 4. 의존성

### 다른 feature
- **약한 의존**: [[FEAT-pen-drawing-engine]] — `text/Content.tsx`를 공유 편집하므로 머지 순서 A→B→**C** 권장(영역은 안 겹침).

### 코드 기준점
- `web/src/components/workspace/cards/_shared/MarkdownEditor.tsx` (placeholder prop 경로 우선)
- 또는 `web/src/components/workspace/cards/text/Content.tsx` (editor props 영역만)

## 5. 데이터 모델

변경 없음.

## 6. 인터페이스

### 컴포넌트 props
- Milkdown 에디터의 empty-state placeholder. Milkdown은 ProseMirror 기반이라 빈 doc placeholder를 CSS(`.ProseMirror p.is-empty::before`) 또는 플러그인으로 처리 — `node_modules/next/dist/docs/` 및 Milkdown placeholder 플러그인 확인 후 채택(`web/AGENTS.md` 주의).

### 조율 경계
- `text/Content.tsx`를 만질 경우 **editor props 영역만**. 하단 overlay JSX([[FEAT-pen-drawing-engine]])·카드 chrome([[FEAT-pen-mode-ux]])는 건드리지 않음.

## 7. 시각·인터랙션

- placeholder는 저채도 보조 텍스트. 길지 않게 한 줄(2~4개 문법 예시).
- 입력 시작 즉시 사라짐(표준 placeholder 동작).

## 8. 비기능 요구사항

- **성능**: 정적 텍스트/CSS — 비용 0.
- **접근성**: placeholder는 보조 수단, 실제 입력 가능 여부와 무관.
- **i18n**: 치트시트 문자열 `ko.json` 키(`workspace.memo.placeholder.hint`).

## 9. 다음 iteration (의도적 보류)

- 슬래시 커맨드(`/`) 메뉴 — Milkdown 플러그인.
- 첫 진입 1회 코치마크.

## 10. 검증 방법 (DOD)

- [ ] tsc/eslint 클린, `check:i18n` 통과
- [ ] 브라우저 실측: 빈 메모 placeholder 표시(AC-1), 내용 있으면 미표시(AC-2)
- [ ] 자기 파일 외 변경 없음
