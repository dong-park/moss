# Plan: FEAT-sticky-redesign — 운영 규약 + DAG

> spec: [`FEAT-sticky-redesign.md`](FEAT-sticky-redesign.md) · kind=issues. 노드 브리프는 [`FEAT-sticky-redesign/`](FEAT-sticky-redesign/).
> 실행: `/go docs/specs/FEAT-sticky-redesign.plan.md` + 노드 브리프 경로. deps 없는 노드는 한 메시지에 병렬.
> runner는 자기 브리프의 `상태`·`구현 메모`만 고친다. 이 파일의 노드 표는 호출자가 고친다.

## 사람용 요약

**한 줄로**: 카드 종류를 메모 하나로 합치고, 이미지·링크·녹음·파일은 메모 안 블록으로, 사이드바는 하단 독으로, 묶음은 메모판 틀로 바꾼다.

1. **DB v5 자리 만들기** — 메모판 종류와 소속·백업 필드를 저장소에 추가한다. (토대)
2. **블록 문법** — 링크·녹음·파일 블록을 마크다운에 적고 읽는 순수 모듈. (토대)
3. **새 DB로 시작** — 옛 카드를 이관하지 않고 v5에서 DB와 첨부를 비운다(2단계 리뷰 후 사용자 결정, 처음엔 이관으로 구현했다가 뒤집음).
4. **메모 창 블록** — 창 안에서 네 블록을 넣고 보고 재생한다.
5. **메모 앞면** — 첫 이미지 크게, 나머지는 배지.
6. **캔버스 붙여넣기·드롭** — 이미지·URL·파일이 블록 든 메모가 된다.
7. **메모판** — 틀 그리기, 소속 판정, 같이 옮기기.
8. **하단 독** — 사이드바를 걷고 독에서 끌어 만든다.
9. **명칭** — 보드→프로젝트, 함→파일함.
10. **마무리 검증** — 옛 생성 경로 제거, 수동 시나리오, 시안 대조.

진행: 1·2·9 동시 시작 → 3·4·6·7 병렬 → 5·8 → 10.

## 공통 완료 기준

1. `cd web && npx tsc --noEmit` 통과
2. `cd web && npx vitest run` 전체 통과, `cd web && bun scripts/check-i18n.mjs` 통과
3. `cd web && npx eslint <바꾼 파일>` 경고 0
4. 새 로직마다 테스트 최소 1개. Conventional Commits, 노드당 커밋 1개 이상
5. **실경로 검증(green≠done)**: stub·직접 주입으로만 green이면 브리프 `구현 메모`에 갭을 적는다
6. `web/AGENTS.md` 경고(Next 16 비표준)를 읽고 시작한다

**기준선 (2026-09-13, b644c0d)**: `tsc` 통과. `vitest run` 717개 중 **7개가 이미 실패** — `Canvas.virtualization.test.tsx`(1), `CardContent.autoFocus.test.tsx`(image 1), `CardContent.image.test.tsx`(5). 공통 기준 2의 "전체 통과"는 이 7개를 뺀 나머지 기준이다. 새로 깨진 테스트가 0이어야 한다. 의존성은 `web/node_modules`(npm install로 설치, 레포 lockfile은 bun.lock — package-lock.json 커밋 금지). 워크트리에서 dev 서버가 필요하면 node_modules를 심링크하지 말고 `cp -Rc`(APFS 클론)로 복사한다 — Turbopack이 루트 밖 심링크를 거부한다(n9에서 확인).

## DAG

```
n1-db-v5 ────┬──────────────► n3-fresh-db ─────────────┐
             │                                          │
             └──► n7-frames ──► n8-dock ────────────────┤
                                                        │
n2-blocks ───┬─────────────────────────────────────────┬──► n10-finish
             ├──► n4-memo-window ──► n5-memo-front ─────┤
             └──► n6-canvas-capture ────────────────────┤
                                                        │
n9-naming ──────────────────────────────────────────────┘
```

진입점: n1, n2, n9 · critical path 길이 4 (n2→n4→n5→n10, n1→n7→n8→n10) < 노드 10

### edge 사유

| edge | 사유 |
|---|---|
| n1→n3 | n3가 n1의 v4 스키마 위에 v5 초기화 upgrade를 얹는다 |
| n1→n7 | n7이 n1의 `kind:"frame"`·`frameId` 필드로 판과 소속을 저장한다 |
| n7→n8 | n8의 메모판 드롭이 n7의 `addFrameAt` 액션을 부른다 |
| n2→n4 | n4의 NodeView가 n2의 `parseBlock`으로 블록 문단을 알아본다 |
| n4→n5 | n5 앞면이 n4의 읽기 전용 NodeView를 재사용한다(카드·창 높이 1:1 규칙) |
| n2→n6 | n6이 n2의 `serializeBlock`으로 붙여넣기 본문을 만든다 |
| n3,n5,n6,n8,n9→n10 | n10이 옛 생성 경로를 지우고 전체 시나리오를 검증한다 — 모든 기능이 들어와 있어야 한다 |

### 커버리지 (spec AC → 노드)

| spec | 노드 |
|---|---|
| AC-1·2·3·4 독 (AC-5 제거됨) | n8 |
| AC-6·7 붙여넣기·드롭 | n6 |
| AC-8 앞면 | n5 |
| AC-9 창 블록 | n4 |
| AC-10·11·12 메모판 | n7 (드롭 생성은 n8) |
| AC-13 파일함·명칭 | n9 |
| AC-14 새 DB로 시작 | n3 |
| §6 데이터 모델 | n1 · 블록 문법 n2 |
| §8 비기능(성능·접근성) | n7(판 이동 16ms) · n8(독 60fps·a11y) · n5(렌더 10%) |
| §10 DOD 수동·시안 대조, 옛 경로 제거 | n10 |

## 노드 인덱스

| ID | 브리프 | deps | 상태 |
|---|---|---|---|
| n1 | [n1-db-v5.md](FEAT-sticky-redesign/n1-db-v5.md) | — | done |
| n2 | [n2-blocks.md](FEAT-sticky-redesign/n2-blocks.md) | — | done |
| n3 | [n3-fresh-db.md](FEAT-sticky-redesign/n3-fresh-db.md) | n1 | done |
| n4 | [n4-memo-window.md](FEAT-sticky-redesign/n4-memo-window.md) | n2 | done |
| n5 | [n5-memo-front.md](FEAT-sticky-redesign/n5-memo-front.md) | n4 | done |
| n6 | [n6-canvas-capture.md](FEAT-sticky-redesign/n6-canvas-capture.md) | n2 | done |
| n7 | [n7-frames.md](FEAT-sticky-redesign/n7-frames.md) | n1 | done |
| n8 | [n8-dock.md](FEAT-sticky-redesign/n8-dock.md) | n7 | done |
| n9 | [n9-naming.md](FEAT-sticky-redesign/n9-naming.md) | — | done |
| n10 | [n10-finish.md](FEAT-sticky-redesign/n10-finish.md) | n3, n5, n6, n8, n9 | 시나리오 A·B 검증 완료, 시안 대조 남음 |

## 파킹 / 보류 로그

| 날짜 | 노드 | 사유 |
|---|---|---|
| | | |
