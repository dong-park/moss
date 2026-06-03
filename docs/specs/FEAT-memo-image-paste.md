# FEAT-memo-image-paste (W2)

**Status**: 📋 todo — C(P0 후). **Squad**: [[_squad-memo-production]] · [[FEAT-memo-editor-seams]]
**심각도**: 🟠 높음.

## 1. 목표
메모 편집 중 이미지를 붙여넣기(Cmd+V)·드래그 드롭하면 OPFS에 저장하고 본문에 인라인 이미지로 삽입한다.

## 2. 범위
**포함:** `editor/imagePaste.ts` — `PasteHandler` 구현, `extensions.ts` `pasteHandlers[]`에 등록(**image=sanitize 뒤**). 클립보드/드롭의 image blob 감지 → OPFS 저장 → `![](opfs://<id>)` 삽입. 이미지 마크다운이 OPFS blob URL로 렌더되게 image 노드 resolver.
**제외:** 비-이미지 정제(W6), 별도 image **카드**(기존 image/Content와 무관).

## 3. 수용 기준
- **AC-1** Given 클립보드에 PNG/JPEG, When 메모에 Cmd+V, Then OPFS 저장 + 커서 위치에 인라인 이미지 삽입.
- **AC-2** Given 파일 탐색기에서 이미지 드래그→메모 드롭, When drop, Then 동일 삽입.
- **AC-3** 텍스트만 있는 클립보드는 이 핸들러가 `false` 반환(기본 붙여넣기/정제로 통과).
- **AC-4** 저장된 이미지는 카드·펼침 모달·재로딩 후에도 렌더(`opfs://` resolver).
- **AC-5** 대용량(>N MB) 또는 비지원 타입은 토스트 경고 후 무시.

## 4. 의존성
P0(`pasteHandlers` 슬롯). 기존 OPFS 저장 헬퍼(`state/db`·storage) 재사용.

## 5. 데이터 모델
이미지 바이트는 OPFS, 본문엔 `opfs://<id>` 참조만(마크다운 호환). 카드 export(향후) 시 번들에 포함되도록 참조 규약 문서화.

## 6. 인터페이스
```ts
// editor/imagePaste.ts
export const imagePasteHandler: PasteHandler;       // pasteHandlers.push (image=마지막)
export function resolveOpfsImageSrc(ref: string): Promise<string>;  // opfs://id → blob URL
```
sanitize(W6)와 순서 계약: **sanitize 먼저(텍스트 정제) → image 나중(blob 추출)**. 둘 다 같은 event를 보되 image는 `items`에 file이 있을 때만 소비.

## 7. 시각·인터랙션
삽입 중 placeholder(흐린 박스)→로드 완료 교체. 드롭 시 드롭존 하이라이트(점선 보더).

## 8. 비기능
blob URL 누수 방지(revokeObjectURL). 동기 디코드 금지(메인 스레드 블록). 펜 overlay 좌표계 불변.

## 9. 다음 iteration
이미지 리사이즈/캡션, 붙여넣은 외부 URL 이미지 자동 다운로드.

## 10. DOD
- [ ] imagePaste 핸들러 + opfs resolver, pasteHandlers 등록(순서 준수)
- [ ] paste·drop·재로딩 렌더, 비이미지 통과
- [ ] AC-1~5, tsc 0, 단위 테스트
