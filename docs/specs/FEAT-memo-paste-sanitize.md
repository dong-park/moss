# FEAT-memo-paste-sanitize (W6)

**Status**: 📋 todo — C(P0 후). **Squad**: [[_squad-memo-production]] · [[FEAT-memo-editor-seams]]
**심각도**: 🟡 중.

## 1. 목표
웹·문서에서 리치 HTML을 붙여넣을 때 Milkdown이 잡탕 마크다운을 흡수하지 않도록 정제한다.

## 2. 범위
**포함:** `editor/sanitizePaste.ts` — `PasteHandler`, `extensions.ts` `pasteHandlers[]`에 **첫 번째**로 등록(이미지보다 먼저). HTML 클립보드 → 깔끔한 마크다운(허용 태그만: 제목/목록/링크/코드/강조), 나머지는 평문. plain-text 폴백(Cmd+Shift+V는 항상 평문).
**제외:** 이미지(W2가 file blob 처리), 위키링크 변환.

## 3. 수용 기준
- **AC-1** Given 웹페이지 리치 텍스트 복사, When 메모 붙여넣기, Then 스팬/스타일 속성 제거된 정제 마크다운.
- **AC-2** Given Cmd+Shift+V, When 붙여넣기, Then 서식 0 평문.
- **AC-3** 코드블록 안 붙여넣기는 원문 그대로(정제 안 함).
- **AC-4** image file이 포함된 클립보드는 이 핸들러가 텍스트만 처리하고 `false`로 통과시켜 W2가 이미지 처리(순서 계약).

## 4. 의존성
P0(`pasteHandlers` 슬롯). W2와 **순서 계약**: sanitize 먼저.

## 5. 데이터 모델
변경 없음(본문 마크다운 품질만).

## 6. 인터페이스
```ts
// editor/sanitizePaste.ts
export const sanitizePasteHandler: PasteHandler;   // pasteHandlers.unshift 또는 첫 등록
export function htmlToCleanMarkdown(html: string): string;  // allowlist 기반
```

## 7. 시각·인터랙션
사용자에게 보이는 UI 없음(투명 정제). 코드블록 컨텍스트 감지로 분기.

## 8. 비기능
정제는 동기 가벼움(거대 HTML은 길이 캡). XSS 표면 없음(마크다운만, raw HTML 비주입).

## 9. 다음 iteration
표(table) 붙여넣기 정제, 노션/구글독스 특화 클린업.

## 10. DOD
- [ ] sanitizePaste 핸들러(allowlist·plain 폴백·코드블록 예외) + 첫 등록
- [ ] AC-1~4, tsc 0, htmlToCleanMarkdown 단위 테스트
