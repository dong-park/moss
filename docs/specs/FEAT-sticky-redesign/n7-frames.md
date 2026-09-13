# n7-frames — 메모판: 틀 그리기, 소속 판정, 같이 옮기기

> 자기완결 브리프. runner는 [상위 spec](../FEAT-sticky-redesign.md) + [plan 공통 완료 기준](../FEAT-sticky-redesign.plan.md#공통-완료-기준) + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n1-db-v5 (frame 종류·frameId 필드)
**상태**: pending

## 문제

한 캔버스 안에서 메모를 구역으로 묶는 수단이 없다(사이드바 `column` 버튼은 동작 없음).

## 목표

메모판은 메모보다 아래층에 그려지는 이름 붙은 틀이다. 메모를 끌어 놓으면 중심점 기준으로 소속이 정해지고, 판을 옮기면 속한 메모가 같이 옮겨진다. 판 안에 판은 들어가지 않는다. 생성 액션 `addFrameAt`을 export해 n8 독이 부른다.

## 작업

1. `web/src/state/workspace.ts` 액션:
   - `addFrameAt(x, y)` — n1 `makeFrameNote` 사용, 기본 크기는 최소(240×160) 이상에서 판단.
   - `resolveMembership(cardIds)` — spec §4 "소속 판정" 규칙 전부: 중심점, 경계선 포함, 겹친 판은 나중에 만든 판, frame·다른 보드 제외, 파일함 카드도 소속 가능.
   - `moveFrame(frameId, dx, dy)` — 판 + 속한 카드 전부를 한 Dexie 트랜잭션으로. 판과 메모 동시 다중 선택 이동 시 메모는 한 번만.
   - `resizeFrame`, `renameFrame`(1~40자, 빈 이름 → "새 메모판"), `deleteFrame`(속한 메모는 제자리, frameId만 해제).
   - 드롭 종료·판 드롭·판 리사이즈 시점에만 `resolveMembership` 호출(`DraggableCard.tsx` 드롭 종료 경로).
   - 파일함으로 메모 이동 시 frameId 해제.
2. 새 `web/src/components/workspace/cards/frame/` — 렌더: 메모보다 낮은 z, 상단 이름표(더블클릭 편집), 빈 곳 드래그=이동, 모서리=리사이즈. 토큰은 `web/src/design/tokens.ts`.
3. 테스트 `web/src/state/__tests__/frames.test.ts`: 중심점 안/밖/경계, 겹친 두 판, 판 이동 시 속한 메모만 같은 거리(spec §10), 중첩 불가(AC-12), 삭제 시 메모 유지, 리사이즈로 빠진 메모 해제. 성능: 메모 50개 판 이동 1프레임 < 16ms.

## 완료 기준

- [ ] plan 공통 완료 기준 전부
- [ ] `cd web && npx vitest run src/state/__tests__/frames.test.ts` 통과
- [ ] spec AC-10·AC-11·AC-12 전 항목, §5 "메모의 소속" 상태표 전이 전부 테스트로 확인
- [ ] 메모 50개 판 이동 처리 < 16ms (테스트 내 측정)
- [ ] 실경로: dev 서버에서 `addFrameAt`을 임시 호출(콘솔/개발용 단축키 — 커밋 전 제거)해 판 생성→메모 넣기→판 이동→새로고침 확인, 결과를 `구현 메모`에 (독 드롭은 n8)

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/workspace.ts` | 카드 액션·undo 경로 |
| `web/src/components/workspace/DraggableCard.tsx` | 카드 드래그·드롭 종료 |
| `web/src/components/workspace/Canvas.tsx` | 카드 레이어 렌더 순서 |
| `web/src/components/workspace/ResizeHandles.tsx` | 리사이즈 핸들 재사용 |
| `web/src/components/workspace/cards/CardContent.tsx` | kind 분기에 frame 추가 |
| `web/src/design/tokens.ts` | 색·반경·그림자 |

## 구현 메모

