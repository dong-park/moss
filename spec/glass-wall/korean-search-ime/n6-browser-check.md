# n6-browser-check — T1·T2·T5·T9·T10·T11·T12 실브라우저 확인

> 자기완결 브리프. `spec/glass-wall/korean-search-ime/` 밑에 산다. runner는 상위 spec + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다.

**agent**: runner
**id**: KS-6
**상위**: spec/glass-wall/korean-search-ime/spec.md
**deps**: n4-search-panel, n2-ime-guard
**상태**: 아직 안 함
**담당 행**: T1, T2, T5, T9, T10, T11, T12

## 문제

한글 조합과 반짝임은 jsdom 합성 이벤트로 판정할 수 없다. 실제 입력기와 브라우저에서 봐야 끝났다고 말할 수 있다.

## 목표

macOS 한글 입력기로 Safari와 Chrome에서 행 T1·T2·T5·T9·T10·T11·T12를 직접 해 보고, 행마다 통과·실패를 증거와 함께 이 파일 구현 메모에 남긴다.

## 작업

1. dev 서버를 띄운다. 포트 3000이 이미 moss면 재사용한다. QA 데이터로 벽 셋('이직 고민 벽', '일상 벽', '리서치 벽')에 포스트잇 '이직 고민 중'·'연주회 표 예매'·'인재 채용 캡처'를 만든다. '이직 고민 벽'에는 마카로만 '이직'을 써 둔다.
2. 키보드 입력은 포그라운드 브라우저에서 한다. pharos 백그라운드 webview에는 키가 안 들어간다.
3. 행마다 rows JSON의 given·when·then을 그대로 따라 해 보고, 스크린샷을 `spec/glass-wall/korean-search-ime/qa/`에 남긴다.
   - T1: ⌘K로 시안 모양 창, 포커스. `09-search.png`와 나란히 비교
   - T2: `ㅇㅈ` 결과 셋과 칠한 구간
   - T5: 다른 벽 결과를 골라 벽이 바뀌고 두 번 반짝임
   - T9: 검색 창에서 '이직' 조합 중 Enter — 창이 열린 채 '이직' 한 번
   - T10: 포스트잇 제목, 벽 이름, 메모판 이름, 사진 캡션, 연결선 라벨, 표 칸에서 조합 중 Enter
   - T11: 제목과 본문에서 '고민' 조합 중 빈 곳 클릭과 다른 앱 전환
   - T12: 포스트잇 본문에서 조합 중 Enter — 줄바꿈 한 번
4. T12가 실패하면 고치지 않는다. 재현 절차를 적고 상태를 `parked`로 둔 뒤 호출자에게 새 노드가 필요하다고 돌려준다. 본문 편집기 수정은 이 노드 범위 밖이다.
5. 끝나면 QA 데이터를 지운다.

## 완료 기준

- [ ] 일곱 행 각각에 Safari·Chrome 두 칸의 통과·실패와 스크린샷 경로가 구현 메모 표에 있다
- [ ] 실패가 0이면 `done`. 하나라도 실패면 `parked`로 두고 실패 행과 재현 절차를 적는다
- [ ] dev DB에서 QA 벽 셋이 지워졌다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `spec/glass-wall/korean-search-ime/rows/` | 행마다 given·when·then |
| `spec/glass-wall/mockups/09-search.png` | 기준 화면 |
| `web/src/components/workspace/cards/_shared/MarkdownEditor.tsx` | 본문 편집기 — T12 재현 시 위치 적기만 |

## 구현 메모

| 행 | Safari | Chrome | 스크린샷 |
|---|---|---|---|
| T1 | | | |
| T2 | | | |
| T5 | | | |
| T9 | | | |
| T10 | | | |
| T11 | | | |
| T12 | | | |
