# n3-group-visible — 판을 어느 줌에서나 보이게

> 자기완결 브리프. 상위 spec + 이 파일만 본다. `**상태**:` 줄은 손으로 고치지 않는다.

**agent**: runner
**id**: PZ-3
**상위**: spec/postit-group-zoom/spec.md
**deps**: n2
**상태**: 끝남
**담당 행**: T3
**사람 확인**: 불필요

## 문제

- 판 선이 배경과 대비 1.1:1이고, 선·이름표가 줌과 같이 작아진다.

## 목표

D3=A: 옅은 흰 면(멀리에서 진하게) + 선 `#aeb2ba`. 선 1px·이름표 12px는 `--zoom-inv`로 화면 고정.

## 작업

1. `cards/frame/Content.tsx`: 선 두께·색, 면, 이름표 위치·크기를 `--zoom-inv`로.
2. `globals.css`: far 구간 면·이름표 규칙.
3. 선택 파랑, 이름 편집, 넣기 강조 링은 그대로.

## 완료 기준

- [x] spec 공통 완료 기준 전부
- [x] 판 DOM의 선 색이 `#aeb2ba`고 두께가 `--zoom-inv`를 쓴다(테스트)
- [x] 기존 frame 테스트 통과

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/cards/frame/Content.tsx` | 판 선·이름표 |
| `web/src/app/globals.css` | 구간 규칙 |

## 구현 메모

- 2026-10-18 커밋 7860979(n4와 같이, globals.css 같은 블록). 선 토큰 --color-frame-line 추가, 이름표 bottom:100% + scale(--zoom-inv), 최대 폭도 같은 배율로 나눔. FT-1 그룹 선 테스트를 새 계약으로 고쳤다. workspace·state 전체 1285 통과(병렬 실행 때 workspace.test의 Dexie 닫힘 오류 1건은 단독 실행 시 없음 — 무관한 기준선).
