# n7-memo-postit — 메모를 포스트잇 모양으로 그리기

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다 — 멈추면 `spec-board node block`, 사람 확인이 필요하면 `spec-board node review`.

**agent**: runner
**id**: FT-7
**상위**: spec/frame-image-template/spec.md
**deps**: n1
**상태**: 아직 안 함
**담당 행**: T9
**사람 확인**: 불필요

## 문제

- 메모 앞면이 흰 종이 사진이라 포스트잇보다 메모지로 보인다.
- 고른 색이 아주 옅게만 얹혀 색 구분이 어렵다.

## 목표

메모 앞면을 정사각형 색종이 포스트잇으로 그린다. 모양은 포스트잇 모양 결정, 색 진하기는 색 결정의 답을 따른다. 종이 결은 옅은 잡음 무늬로 남긴다.

## 작업

1. `cards/text/Content.tsx`의 `MEMO_PAPER`(`/cards/v2/text.png`) 배경과 색조 mask 층을 CSS 포스트잇 면으로 바꾼다. 접착 띠·그림자·모서리는 결정 답대로.
2. `memoVariety.ts`: 색 결정이 또렷함이면 `MEMO_COLORS`와 기본 노랑 값을 포스트잇 팔레트로 바꾼다. 저장 값(팔레트 이름)은 그대로라 데이터 이관이 없다. 기본 노랑의 id 해시 6단계는 한 색으로 줄일지 구현 메모에 남긴다.
3. 메모 비율: `workspace.ts` 352행의 종이 비율(957×1021) 강제를 1:1로 바꾸고, 새 메모 기본 크기를 정사각형으로 한다. 이미 저장된 메모 크기는 고치지 않는다.
4. `DockDragPreview.tsx`의 메모 미리보기와 표 보기 색 점(`MemoTable.tsx`)이 같은 색을 쓰는지 맞춘다.
5. 도크 아이콘(`/icons/dock/memo.png`, 노란 포스트잇)은 그대로 둔다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `npx vitest run src/components/workspace src/state` 통과: 메모 DOM에 `text.png`가 없고, 고른 색이 앞면 배경색이 된다
- [ ] 색을 안 고른 메모는 기본 노랑으로 보인다(옛 데이터 그대로 읽힘)
- [ ] 기존 `memoColor`·`memoVariety`·`frameFeel` 테스트가 통과한다(기울기·"착" 모션 그대로)

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/cards/text/Content.tsx` | 메모 앞면 종이(19행 `MEMO_PAPER`) |
| `web/src/components/workspace/memoVariety.ts` | 색 팔레트·`memoTint` |
| `web/src/state/workspace.ts` | 종이 비율 강제(352행) |
| `web/src/components/workspace/DockDragPreview.tsx` | 도크 끌기 미리보기 |

## 구현 메모
- (메인, 2026-10-18) 사용자 요청: "메모는 포스트잇 모양으로". 목업 `memo-postit-variants.html`(지금 종이·클래식·접착 띠·들린 모서리).
- (메인, 2026-10-18) 2026-09-13에 CSS 노란 그라디언트로 바꿨다가 종이 결이 사라져 종이 사진으로 되돌린 적이 있다. 이번에는 잡음 무늬로 결을 남긴다. 실화면에서 다시 볼 것.
- (메인, 2026-10-18) n1과 같은 `DockDragPreview.tsx`를 고쳐서 n1 뒤에 둔다. 판 일과는 독립이다.

