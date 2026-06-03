# FEAT-memo-a11y (W9)

**Status**: 📋 todo — C(P0 후). **Squad**: [[_squad-memo-production]] · [[FEAT-memo-editor-seams]]
**심각도**: 🟡 중(포용성).

## 1. 목표
메모 에디터를 키보드·스크린리더 사용자가 동등하게 쓰게 한다.

## 2. 범위
**포함:** P0 `EditorRegion` 컨테이너 보강 — `role`/`aria-label`/`aria-multiline`, 인카드 서식 키보드 단축(Cmd+B/I 등 commonmark 키맵 노출·문서화), 가시적 포커스 링, 펜 모드·편집 모드 전환의 SR 안내(aria-live). 툴바·버블 버튼 포커스 순서.
**제외:** 색대비 전면 감사(별도), 펜 그리기 자체의 a11y(대안 입력은 §9).

## 3. 수용 기준
- **AC-1** 에디터 본문에 `role=textbox` + `aria-multiline=true` + 라벨(i18n).
- **AC-2** Cmd+B/I/`(코드) 등 단축이 인카드에서 동작(키맵 활성·문서화).
- **AC-3** Tab 포커스 시 가시 포커스 링, 키보드만으로 편집 진입·이탈 가능.
- **AC-4** 펜 모드 토글·저장 상태 변화가 aria-live로 SR 안내.
- **AC-5** 툴바/버블 버튼에 aria-label(기존 유지) + 논리적 탭 순서.

## 4. 의존성
P0(`EditorRegion` 표면). W3 버블 툴바와 포커스 순서 협조(있으면).

## 5. 데이터 모델
변경 없음.

## 6. 인터페이스
```tsx
// EditorRegion props 보강(P0가 연 표면)
<EditorRegion editable role="textbox" aria-label=... aria-multiline />
// i18n: workspace.memo.editor.label / .penModeOn / .saved 등
```

## 7. 시각·인터랙션
포커스 링은 토큰 컬러(ink-blue) 2px. 비방해(레이아웃 시프트 0). prefers-reduced-motion 존중.

## 8. 비기능
WCAG 2.1 AA 지향(키보드·이름·역할·값). SSR 폴백도 동일 라벨.

## 9. 다음 iteration
펜 입력 키보드 대안, 고대비 테마, axe 자동 검사 CI.

## 10. DOD
- [ ] EditorRegion role/aria/포커스 링, 인카드 단축 노출, aria-live 안내
- [ ] AC-1~5, tsc 0, a11y 단위/스냅샷 테스트
