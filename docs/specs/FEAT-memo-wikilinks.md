# FEAT-memo-wikilinks (W5)

**Status**: 📋 todo — C(P0 후). **Squad**: [[_squad-memo-production]] · [[FEAT-memo-editor-seams]]
**심각도**: 🟠 높음(제품 정체성 — moss는 사고 도구).

## 1. 목표
메모 본문에 `[[카드제목]]` 위키링크를 달고, 카드별 백링크(역참조)를 보여줘 메모끼리 연결한다.

## 2. 범위
**포함:** `editor/wikilink.ts` — Milkdown 플러그인(`[[` 입력 시 카드 자동완성, `[[...]]` 노드 렌더·클릭 시 대상 카드로 점프), `extensions.ts` `editorPlugins[]` 등록. 백링크 셀렉터(`backlinksOf(cardId)`) + 백링크 패널(펼침 모달 하단 또는 카드 hover).
**제외:** 그래프 뷰(다음), 외부 URL(W10).

## 3. 수용 기준
- **AC-1** Given 편집 중 `[[` 입력, When 글자 타이핑, Then 제목 매칭 카드 자동완성 드롭다운.
- **AC-2** Given `[[회고]]` 확정, When 렌더, Then 링크 스타일 + 클릭 시 해당 카드로 점프·선택.
- **AC-3** 대상이 없으면 "새 메모 만들기" 옵션(선택 시 생성 후 링크).
- **AC-4** 카드 B가 A를 링크하면, A의 백링크 패널에 B 표시.
- **AC-5** 카드 제목 변경 시 링크 표시 갱신(참조는 id 기반 권장).

## 4. 의존성
P0(`editorPlugins` 슬롯). 카드 목록·제목 셀렉터(workspace).

## 5. 데이터 모델
링크는 본문 마크다운에 `[[id|표시명]]` 또는 `[[제목]]`로 인코딩(id 기반 안정 참조 권장). 백링크 인덱스는 파생(persist 안 함).

## 6. 인터페이스
```ts
// editor/wikilink.ts
export const wikilink: MilkdownPlugin[];     // editorPlugins.push(...wikilink)
export function backlinksOf(cards: Card[], cardId: string): Card[];
```

## 7. 시각·인터랙션
링크는 ink-blue 밑줄, hover 시 대상 미리보기 툴팁. 자동완성은 키보드 탐색(↑↓ Enter Esc). 백링크 패널은 접이식.

## 8. 비기능
백링크 인덱스 증분 갱신. 순환 링크 안전. 펜 좌표계 불변.

## 9. 다음 iteration
연결 그래프 뷰, signals/home 연결 큐레이팅(ai-pipeline)과 합류.

## 10. DOD
- [ ] wikilink 플러그인(자동완성·노드·점프) + editorPlugins 등록
- [ ] backlinksOf + 백링크 패널, 없는 대상 생성
- [ ] AC-1~5, tsc 0, 단위 테스트
