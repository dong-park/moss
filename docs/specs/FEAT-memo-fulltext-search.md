# FEAT-memo-fulltext-search (W4)

**Status**: ✅ complete (2026-06-04) — feat/memo-editor-seams 합본 머지. **Squad**: [[_squad-memo-production]] · [[FEAT-memo-editor-seams]]
**심각도**: 🟠 높음.

## 1. 목표
메모 본문 텍스트로 카드를 찾는다 — 검색어 입력 시 매칭 카드를 캔버스에서 강조하거나 결과 목록으로 점프.

## 2. 범위
**포함:** `state/memoSearch.ts` — 본문 인덱스(현 카드 markdown 평문화) + `searchMemos(query)`. workspace에 `searchMemos` 셀렉터 노출. 캔버스 강조·dim 처리(`filterByKeyword` 연계 — `_index.md` C-2와 동일 액션 재사용 가능).
**제외:** AI 의미 검색(ai-pipeline), 태그 검색.

## 3. 수용 기준
- **AC-1** Given 본문에 "회고" 포함 메모 3장, When "회고" 검색, Then 3장 매칭(대소문자·markdown 기호 무시).
- **AC-2** 매칭 카드 강조, 비매칭 dim. 검색 비우면 원상복귀.
- **AC-3** 결과 클릭 시 해당 카드로 캔버스 팬·선택.
- **AC-4** 카드 수백 장에서 입력당 < 16ms(인덱스/디바운스).

## 4. 의존성
P0(seam은 직접 의존 안 하나 같은 사이클). 캔버스 `filterByKeyword`가 있으면 재사용, 없으면 본 워커가 추가(C-2와 조율 — 중복 시 보존 머지).

## 5. 데이터 모델
인덱스는 메모리(파생) — persist 안 함. markdown→평문은 `blocksToMarkdown` 후 기호 제거 헬퍼.

## 6. 인터페이스
```ts
// state/memoSearch.ts
export function plainText(markdown: string): string;
export function searchMemos(cards: Card[], query: string): { id: string; score: number }[];
// workspace.ts: searchMemos 셀렉터 + (없으면) filterByKeyword(word) 액션
```

## 7. 시각·인터랙션
검색 입력은 Header(기존 search UI 옆) 또는 단축(Cmd+F). 매칭 강조는 보더/글로우, 비매칭 opacity 0.4.

## 8. 비기능
입력 디바운스 150ms. 인덱스는 카드 변경 시 증분 갱신(전체 재구축 회피).

## 9. 다음 iteration
정규식/필드 검색, 펜 메모 텍스트 OCR 제외 명시.

## 10. DOD
- [ ] memoSearch 인덱스+검색, workspace 셀렉터, 캔버스 강조/팬
- [ ] AC-1~4, tsc 0, 단위 테스트(plainText·랭킹)
