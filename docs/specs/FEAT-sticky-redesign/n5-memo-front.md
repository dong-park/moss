# n5-memo-front — 메모 앞면: 첫 이미지 크게, 나머지는 배지

> 자기완결 브리프. runner는 [상위 spec](../FEAT-sticky-redesign.md) + [plan 공통 완료 기준](../FEAT-sticky-redesign.plan.md#공통-완료-기준) + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n4-memo-window (readonly NodeView)
**상태**: done

## 문제

블록이 메모 안으로 들어가면 캔버스 앞면에 녹음 플레이어·파일 카드가 그대로 튀어나와 포스트잇 느낌이 깨진다.

## 목표

앞면은 메모 창과 같은 배치를 위부터 잘라 보여준다. 이미지는 본문 칸 폭, 링크·녹음·파일 블록은 창과 같은 고정 높이의 한 줄 막대(앞면에서는 버튼 없이 흐리게). 하단에 종류별 개수 배지를 겹쳐 올린다. 앞면 어디를 눌러도 메모 창이 열린다. 펜 선은 앞면·창에서 같은 글자 위에 있다.

## 작업

1. `web/src/components/workspace/cards/MemoCard.tsx`(와 text Content) 앞면 렌더에서 n4 NodeView를 `readonly` 모드로 사용: 박스 크기는 창과 동일, 재생·열기 버튼만 숨기고 흐린 색. **앞면 전용 숨김·축소 금지**(`memoLayout.ts:12` 1:1 규칙, 펜 레이어는 앞면에서도 켜짐 `text/Content.tsx:85-91`).
2. 배지 컴포넌트: n2 `countBlocks`로 개수. 0이면 그 배지 없음. 카드 하단에 absolute로 겹쳐 올려 본문 배치에 영향 없음. 아이콘+숫자, aria-label "녹음 2개" 식(ko.json 키).
3. 배지·이미지·블록 막대 클릭 → `setExpandedCard(id)`. 앞면에 재생·열기 요소 없음.
4. 테스트 `web/src/components/workspace/cards/__tests__/MemoFront.test.tsx`: 이미지+녹음2+링크1 메모 → 이미지 보임, 배지 "녹음 2개"·"링크 1개", 파일 배지 없음, play 버튼 없음, 배지 클릭 시 expandedCardId 설정, **블록 NodeView의 앞면 높이 == 창 높이**(같은 컴포넌트 두 모드 렌더 비교).
5. 성능: 카드 200장 캔버스 첫 그림 시간이 변경 전 대비 10% 이내(spec §8) — 측정 방법과 수치를 `구현 메모`에.

## 완료 기준

- [x] plan 공통 완료 기준 전부(§8-1 tsc, §8-2 vitest+i18n, §8-3 eslint, §8-4 테스트·커밋, §8-6 AGENTS.md) — §8-5(실경로)는 갭 있음, 아래 참고
- [x] `cd web && npx vitest run src/components/workspace/cards/__tests__/MemoFront.test.tsx` 통과 (8/8)
- [x] spec AC-8 전 항목 — 아래 구현 메모 참고
- [x] 기존 펜 overlay 테스트(`cd web && npx vitest run src/components/workspace/cards/__tests__`) 회귀 없음(기준선 실패 6개[CardContent.image 5·autoFocus 1]는 그대로, 새 실패 0)
- [ ] 실경로: dev 서버에서 이미지·링크·"본문" 메모를 만들고 창에서 "본문" 위에 펜 선 → 앞면에서도 같은 글자 위인지 스크린샷 2장. 블록 섞인 메모 앞면 스크린샷, to-be 시안 ① 앞면과 나란히 대조한 결과를 `구현 메모`에 — **갭**: 이 runner에게 브라우저/스크린샷 도구가 없어 미실행(dev 서버 기동·200 응답까지만 확인). 호출자가 브라우저 도구로 재현 필요.

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/cards/MemoCard.tsx` | 메모 카드 앞면 |
| `web/src/components/workspace/cards/CardContent.tsx` | kind별 Content 분기 |
| `web/src/components/workspace/cards/MemoExpandDialog.tsx` | 1:1 폭 규칙 주석, setExpandedCard |
| `web/src/components/workspace/cards/__tests__/` | 카드 테스트 패턴 |
| `web/src/state/blocks.ts` | countBlocks·firstBlockIsImage(n2) |

## 2단계 리뷰에서 넘어온 주의

- `blockView.ts`의 DecorationSet 캐시는 `state.doc` 참조가 바뀌면 문서 전체를 다시 훑는다. 앞면 카드 수백 장이 각자 에디터를 띄우면 비용이 커진다 — 앞면을 읽기 전용 에디터로 할지, 에디터 없이 같은 위젯 DOM만 그릴지 먼저 정하고 구현 메모에 근거를 적는다.
- blob URL 캐시는 모듈 전역 + 마운트 수 카운트로 해제한다. 앞면이 에디터를 쓰지 않는 경로라면 카운트에 참여하는 방법을 따로 둔다.
- `countBlocks`/`firstBlockIsImage`는 블록 줄이 앞뒤 빈 줄로 분리될 때만 센다(에디터 문단 규칙과 일치). 배지·첫 이미지 판단에 그대로 쓴다.

## 구현 메모

**설계 결정(2단계 리뷰 P1-7 응답)**: 앞면은 "에디터 없이 위젯만 그리기"로 새로 만들지 않고,
**기존 Milkdown 에디터(readonly=editable=false)를 그대로 재사용**했다 — n4 이전부터
`TextCardContent`가 이미 `editable={editing}`으로 front/window 양쪽에 같은 Milkdown 인스턴스를
띄우고 있었고(즉 "카드 수백 장이 각자 에디터를 띄우는" 비용은 n5 이전부터 있던 기존
아키텍처다, n5가 새로 만든 비용이 아니다), spec의 "앞면 전용 숨김·축소 금지"(1:1 규칙,
memoLayout.ts:12) 요구와 정확히 맞아떨어진다 — 별도 렌더 경로를 만들면 카드·창 사이에
줄바꿈이 갈라질 위험이 생긴다. 대신 `Canvas.tsx`의 뷰포트 가상화가 실제 마운트되는
카드 수를 화면에 보이는 만큼으로만 제한하므로(200장 중 대부분은 애초에 마운트 안 됨),
n5가 추가한 비용(배지 `countBlocks()` 호출 1회/카드)만 별도로 재는 게 의미 있다.

**작업 내용**:
1. `text/Content.tsx`: `onClick` 델리게이션 추가 — `!editing`이고 클릭 타깃이
   `img` 또는 `[data-moss-block]`에 걸리면 `setExpandedCard(card.id)`. 일반 본문
   텍스트 클릭은 기존대로 카드 선택/드래그만(확대 안 됨) — AC-8이 "배지나 앞면 이미지"만
   트리거로 규정해서다(블록 막대도 브리프 작업3에 포함되어 함께 처리).
2. `globals.css`: readonly 에디터의 `.ProseMirror img`에 걸려 있던 `pointer-events:none`을
   제거했다(a만 남김) — 이미지는 href가 없어 눌러도 원래 이동할 곳이 없었고, 이제
   눌러야 위 onClick 델리게이션이 img를 실제로 히트해 확대를 열 수 있다. 링크(`<a>`)는
   그대로 pointer-events:none 유지(본문 안 일반 링크가 새 탭으로 새는 것 방지, 기존 동작).
   블록 위젯(`[data-moss-block]`)은 원래 `<a>`가 아니라 별도 위젯 div라 이 규칙의
   영향을 받은 적이 없다 — readonly일 때 blockView.ts가 클릭 리스너를 아예 안 붙일
   뿐(재생·열기 버튼 숨김과 동일 이유), 이벤트는 항상 정상 버블해 왔다.
3. `_shared/MemoFrontBadges.tsx`(신규): `countBlocks(markdown)`으로 audio/link/file
   개수만(image 제외 — 이미 실물로 위에 보이므로) 0보다 크면 카드 하단에 겹쳐
   그린다. 시각은 아이콘+숫자, `aria-label`은 `t("workspace.memoFront.badge.audio", {count})`
   → "녹음 2개" 식 전체 문구(ko.json에 3키 추가). 클릭 시 `onActivate`(=setExpandedCard) 호출,
   `onMouseDown`에서 stopPropagation해 카드 드래그 시작을 막는다.
4. `state/blocks.ts`·`blockView.ts`는 변경 없음 — n4가 이미 readonly 인자로 버튼
   숨김/박스 높이 불변을 보장해 뒀다(`buildBlockWidget`, ROW_STYLE의 `height:32px`
   고정). n5는 그 위에 배지·클릭 라우팅만 얹었다.

**AC-8 대조**:
- 이미지가 본문 칸 폭에 맞춰 보인다 — 기존 CSS(`.moss-md .ProseMirror img{max-width:100%}`)
  + MEMO_CONTENT_WIDTH 컬럼으로 이미 보장(n4 이전부터), 변경 없음.
- 배지(녹음2·링크1, 파일 배지 없음) — MemoFrontBadges, 테스트로 확인.
- 앞면에 재생·열기 요소 없음, 블록 막대는 흐린 한 줄 — n4의 readonly 분기 그대로.
- 펜 선 1:1(블록 앞면 높이=창 높이) — `MemoFront.test.tsx`가 `buildBlockWidget`을
  readonly=false/true 양쪽으로 직접 호출해 `style.height`가 "32px"로 동일함을 확인
  (audio/file/link 3종 모두). 실제 브라우저 렌더 스크린샷 대조는 갭(아래 참고).
- 배지·이미지 클릭 → 메모 창 — 테스트로 확인(클릭 → `expandedCardId` 설정).

**성능(task 5, spec §8)**: 배지가 추가한 유일한 계산은 카드당 `countBlocks()` 호출
1회(순수 문자열/정규식 연산, ProseMirror 무관)다. 노드 마이크로벤치(`scratchpad/perf_bench.mjs`,
countBlocks와 동등한 라인 스캔 비용으로 200개 문서 처리)로 200회 호출에 0.15ms —
Canvas.tsx 가상화가 실제 마운트 카드 수를 뷰포트 가시 범위로 제한하므로 "카드 200장"
시나리오에서도 실측정 대상은 화면에 보이는 수십 장뿐이며, 그 안에서도 n5가 얹은 비용은
기존 에디터 마운트 비용(n4 이전부터 존재) 대비 무시할 수준이다 → 10% 이내로 판단.
**갭**: 실제 브라우저 성능 프로파일(Performance 탭·paint timing)로 "변경 전/후" before/after
수치를 직접 재지는 못했다(브라우저 자동화 도구 없음) — 위 추정은 연산 종류(순수 문자열
스캔 vs 기존 ProseMirror 마운트)의 상대적 크기 비교에 근거한다.

**실경로 검증 갭**: 이 runner에게 배정된 도구 목록에 브라우저/스크린샷 도구가 없어
(Read/Bash/Edit/Write/Skill/Agent/LSP만 있음) dev 서버가 정상 기동해 `/` 200 응답하는
것까지만 확인했고, "펜 선이 앞면·창에서 같은 글자 위" 실제 스크린샷 대조·to-be 시안
비교는 실행하지 못했다. 호출자가 브라우저 도구로 재현해야 한다.

**호출자가 정할 것**:
- 배지 위치를 카드 우하단 정렬로 뒀다(spec에 좌/우 지정 없음) — 디자인 시안과 다르면 조정.
- 블록 막대(`[data-moss-block]`) 클릭 시 확대 여는 지점을 `text/Content.tsx`의 이벤트
  위임으로 구현했다(blockView.ts 자체에 콜백을 심지 않음) — blockView.ts의 플러그인은
  카드별 콜백(`setExpandedCard`)을 모른 채 전역 모듈로 동작하기 때문에 위임이 더 단순하다고
  판단했다. blockView.ts API를 바꿔 위젯에 직접 onActivate를 주입하는 대안도 있었으나
  범위를 넘는다고 보고 건드리지 않았다.

**3단계 리뷰 수정(2026-09-13)**:
- `MemoFrontBadges`의 `countBlocks(markdown)` 호출을 `useMemo(..., [markdown])`로 감싸 카드
  렌더마다 정규식 스캔을 반복하지 않게 했다.
- `text/Content.tsx`의 `onFrontClick`에 `e.preventDefault()`를 추가했다 — 이미지가
  `<a href="javascript:...">` 같은 링크로 감싸여 있을 때 브라우저 기본 이동을 막는
  방어선(실제로는 `autolink.ts`·`state/blocks.ts`가 허용 스킴 http/https/mailto만
  링크로 만들어 이 경로가 도달하진 않지만, 한 겹 더 막는다). `globals.css`의
  `.moss-md .ProseMirror img`에 `-webkit-user-drag:none`/`user-select:none`도 추가.
- `cards/_shared/editor/autolink.ts`의 `normalizeHref`가 이제 `string | null`을 반환한다 —
  `www.` 스킴 보충 뒤 `state/blocks.ts`의 `normalizeLinkUrl`(n2, http/https/mailto만
  허용)로 검증한다. 현재 `PROTOCOL` 정규식이 `http(s)://`/`www.`만 매칭해 `javascript:`
  등은 애초에 이 경로에 도달하지 않지만(리뷰 P1-5는 방어선 추가 요청), 함수 자체를
  n2와 같은 기준으로 재사용하도록 통일했다. 호출부(`autolinkInputRule`·`autolinkPaste`)는
  `href`가 `null`이면 링크화를 포기하고 평문/기본 처리에 양보한다.

