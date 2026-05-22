# SIDEBAR-CARDS-UX — 캡처 카드 9종 UX 강화 병렬 플랜

> 사이드바 캡처 도구로 만드는 카드 9종(text/image/link/code/highlight/audio/handwriting/mindmap/file)에 **checklist 카드의 UX 강화 패턴**을 펼친다. 단일 오케스트레이터 + 워커별 독립 PR.

**Status**: ✅ complete (2026-05-22) — 9개 카드 모두 머지, AC 충족, 회귀 0
**기준점 커밋**: `1fea4a0 feat(cards): 카드 v2 PNG 표면 도입 + 체크리스트 사용성 개선`
**산출 위치**: `web/src/components/workspace/cards/{kind}/Content.tsx` (P0에서 10개 파일로 분리됨)
**완료 정의 (전체)**: 9개 카드 모두 (a) 키보드 표준 통과 (b) v2 PNG 표면 적용 검증 (c) inset PNG 종이 영역 정렬 (d) 카드당 5~6건 단위 테스트 통과
**최종 결과**: tsc 0 errors, vitest 416/416 통과 (전체 48 파일, P0 머지 시점 367 + 신규 49건). 9개 머지 commit 850b290~3a35eae (web submodule).

---

## 1. 목표

캡처 카드 사용자가 **마우스 의존 없이** 카드 안에서 키보드만으로 편집 흐름을 완결할 수 있고, 표면(PNG)·콘텐츠(텍스트/메타)가 시각적으로 일관되게 정렬되도록 한다. 회귀를 막기 위해 카드당 단위 테스트 5~6건을 동봉한다.

## 2. 범위

### 포함 (in-scope)
- 카드 9종 각각의 `onKeyDown` 핸들러 정의·구현
- 카드 9종 각각의 `cards/v2/{kind}.png` 표면 적용 검증 (현재 호출은 모두 있으나 종이 영역 정합은 미점검)
- 카드 9종 각각의 콘텐츠 inset를 PNG 종이 영역(% 기반)에 정렬
- 카드 9종 각각의 단위 테스트 5~6건 (`CardContent.{kind}.test.tsx`)

### 제외 (out-of-scope)
- 신규 카드 kind 도입 (text/image/link/code/highlight/audio/handwriting/mindmap/file 외)
- `cardSurface` 헬퍼 시그니처 변경 — `(kind: string) => CSSProperties` 유지
- 캔버스 정리 도구(line/board/column/comment) — 다른 FEAT 담당
- 카드 간 포커스 이동(카드 ↔ 캔버스) — `useShortcuts.ts` 영역
- 신규 PNG 자산 제작 — 표면 자산은 `1fea4a0`에서 모두 추가됨, 점검만

## 3. 제약

- **단일 파일 동시 편집 위험** — 9개 워커가 `CardContent.tsx`(1469줄) 같은 파일을 만진다. 머지 순서·PR 단위 분리로 충돌 회피. 컴포넌트별 파일 분리는 선택 옵션(§7 참조).
- **`cardSurface` 호출 시그니처 불변** — 호출부는 그대로 두고 PNG 자산만 점검·교체.
- **각 카드 작업은 독립 PR 가능해야 함** — 카드 간 import·공유 state 의존 금지.
- **PNG 종이 영역 측정 도구 부재** — 비주얼 검수 + 디자이너(또는 디자인 모드) 확인 필요. P0에서 측정 가이드 확립.

---

## 4. 강화 4축 — 공통 표준

### 4.1 키보드 내비게이션 표준 (전 카드 공통 골격)

| 키 | 의미 (전역 default) | 카드별 변형 |
|---|---|---|
| `Esc` | 편집 모드 종료, `onCommitEdit()` 호출 | 전 카드 동일 — **필수** |
| `Enter` | 1) 리스트형: 새 항목 / 2) 텍스트성: 줄바꿈 또는 commit | 카드별 정의 |
| `Shift+Enter` | 텍스트성에서 줄바꿈 (Enter가 commit인 경우) | text/highlight/code에서 사용 |
| `↑ / ↓` | 리스트성: 항목 간 포커스 이동 | checklist/mindmap |
| `Backspace`(빈 항목) | 리스트성: 항목 제거 + 이전 항목 끝으로 | checklist/mindmap |
| `Tab / Shift+Tab` | 메타 필드(alt/lang/filename 등) 사이 이동 | image/file/code/link/audio |
| `Cmd/Ctrl+Enter` | 편집 종료 + 다음 카드로 진행 | (Phase 2, 본 플랜 밖) |

원칙:
- **Esc는 9종 모두 필수** — 카드 외부 ShortcutsBinder가 위임받지 못하는 경우 카드 안에서 자체 commit.
- **포커스가 input/textarea 안에 있을 때만 onKeyDown 처리**, 캔버스 단축키와 충돌 회피.
- **`e.preventDefault()`로 텍스트 영역 기본 동작 차단**할 때는 카드별 명시적 사유 주석 1줄.

### 4.2 v2 PNG 표면 점검 체크

`cards/v2/{kind}.png` 자산 존재 + `cardSurface("{kind}")` 호출이 있는지 확인. `1fea4a0` 기준 자산은 9종 모두 추가됨. 워커는 (a) 자산 파일 존재 확인 (b) 호출 라인 확인만 — 신규 제작 금지.

### 4.3 콘텐츠 inset 측정 가이드 (% 기반)

기준점 checklist:
```css
position: absolute;
top: 16%; left: 9%; right: 9%; bottom: 8%;
```

측정 절차 (P0에서 1회 확립, 9종이 동일 절차 반복):
1. `cards/v2/{kind}.png`를 1024×768 컨테이너에 contain으로 렌더.
2. PNG의 "종이 영역"(콘텐츠를 두는 흰 부분) 사각형을 픽셀로 측정 (디자인 툴 또는 dev tool).
3. `(상단여백 / 컨테이너높이) × 100`을 % 값으로 환산 → top.
4. 같은 방식으로 left/right/bottom.
5. **카드별 측정값을 본 문서 §6 워커 brief의 inset 표에 기입** — 워커가 측정 안 하고 그대로 적용.

### 4.4 테스트 패턴 (카드당 5~6건)

`CardContent.checklist.test.tsx` 구조 그대로 차용:
1. **render**: 카드 마운트, 표면 background 스타일에 `cards/v2/{kind}.png` 포함 확인
2. **edit-mode**: editing=true → 포커스 트랩 + 적절한 input/textarea 마운트
3. **commit (Esc)**: Esc 키 → `onCommitEdit` 1회 호출
4. **카드별 키보드 시나리오 1**: 카드 특화 동작 (예: code = Tab 들여쓰기)
5. **카드별 키보드 시나리오 2**: 카드 특화 동작 (예: link = Enter로 URL commit)
6. **onChange 호출**: 입력 시 `onChange(updatedCard)` 호출 + 페이로드 검증

---

## 5. 의존성 DAG + 우선순위

### 5.1 그래프

```
                    ┌──────────────────────────────┐
                    │  P0  공통 선행 작업           │
                    │  - 키보드 표준 표 확정        │
                    │  - inset 측정 가이드 + 9개 측정│
                    │  - 테스트 헬퍼(setupCard) 추출 │
                    └──────────────┬───────────────┘
                                   │ (해제 시)
       ┌───────────────┬───────────┼───────────┬──────────────┐
       ▼               ▼           ▼           ▼              ▼
   [P1-A text]   [P1-B highlight] [P1-C code] [P1-D link]  [P1-E mindmap]
   텍스트성 4개 + 리스트성 1개 — 키보드 효과가 큼, 빠른 win

       ┌───────────────┬───────────┬───────────┐
       ▼               ▼           ▼           ▼
   [P2-A image]   [P2-B file]  [P2-C audio]  [P2-D handwriting]
   미디어/메타 4개 — 메타 편집·단축키 중심, 효과 낮음
```

### 5.2 Critical path

`P0 → (P1 중 가장 늦은 1개) → 통합`. P0를 1명이 0.5d 안에 끝내야 P1·P2 9명이 동시 시작 가능. 9개 카드는 서로 독립이라 병렬 최대화.

### 5.3 그룹

| 그룹 | 단위 | 카드 | 시작 시점 | 예상 |
|---|---|---|---|---|
| **P0** | 공통 선행 1개 | — | 즉시·단독 | 0.5d |
| **P1** | 텍스트성+리스트성 5개 | text, highlight, code, link, mindmap | P0 완료 후 동시 | 카드당 0.5~1d |
| **P2** | 미디어/메타 4개 | image, file, audio, handwriting | P0 완료 후 동시 | 카드당 0.5~0.75d |
| **C** | 통합 후처리 1개 | — | P1+P2 모두 머지 후 | 0.5d |

### 5.4 머지 순서 (CardContent.tsx 충돌 회피)

`CardContent.tsx`를 9명이 동시에 만지면 머지 충돌. 권장 순서:
1. P0 머지 — 키보드 표준/inset 가이드 문서화. 코드 변경은 테스트 헬퍼 추출만(분리 파일).
2. P1 5개를 **순차 머지** (text → highlight → code → link → mindmap). 각 PR은 자기 카드 함수만 만지므로 rebase 비용 작음.
3. P2 4개도 순차 머지 (image → file → audio → handwriting).
4. C 통합 후처리 (회귀 회귀, 시각 QA).

대안: P0에서 **9개 컴포넌트를 별 파일로 분리**하는 사전 리팩터를 수행. 그러면 9명이 진짜로 충돌 없이 동시 머지 가능. 단점은 P0 추정이 0.5d → 1.5d로 증가. 의사결정은 §7.

---

## 6. 워커별 brief

각 워커는 본 §6의 자기 섹션 + §4 공통 표준 + `CardContent.tsx`의 해당 컴포넌트만 보면 시작 가능.

> ⚠️ **inset 표의 `%` 값은 P0 측정 후 채워진다.** 본 문서의 값은 예상치 — 실제 PNG 종이 영역 측정값으로 P0에서 갱신.

---

### P0 · 공통 선행 작업

**Owner**: 1명 단독
**파일**: `docs/plans/SIDEBAR-CARDS-UX.md` (본 문서 §6 inset 표 갱신), `web/src/components/workspace/cards/__tests__/setupCard.ts` (신규)
**작업**:
1. 디자인 모드 또는 PNG 픽셀 측정으로 9개 카드의 종이 영역 % 값 확정 → 본 문서 §6의 각 inset 표에 기입.
2. 테스트 헬퍼 추출: `renderCard(kind, props)` — checklist 테스트의 boilerplate를 일반화. 9개 워커가 import해 쓴다.
3. (선택) §7 결정에 따라 9개 컴포넌트를 별 파일로 분리하는 사전 리팩터.
4. PNG 자산 9종 존재 확인: `public/cards/v2/{text,image,link,code,highlight,audio,handwriting,mindmap,file}.png`.

**수용 기준**:
- §6 9개 카드의 inset % 값이 모두 채워짐.
- `__tests__/setupCard.ts`가 export되고 checklist 테스트가 이 헬퍼로 마이그레이션 (1건 PR로 검증).
- 빌드 통과 (`pnpm tsc --noEmit`, `pnpm test`).

---

### P1-A · text 카드 (텍스트 메모)

**Owner**: 1명
**파일**: `web/src/components/workspace/cards/CardContent.tsx` (`TextCardContent`, L148~)
**현재 상태**: EditableBlock 위임, 카드 레벨 키보드 핸들러 없음, padding `px-4 py-3.5`.

#### (a) 키보드 단축키 표

| 키 | 동작 |
|---|---|
| `Esc` | 편집 종료 + `onCommitEdit` |
| `Cmd/Ctrl+Enter` | 편집 종료 (commit) — Phase 1.5에 도입 보류, 본 PR은 Esc만 |
| `Enter` | 줄바꿈 (default 유지) |
| `Tab` | 들여쓰기 — text는 들여쓰기 미지원, Tab은 포커스 이동 (default) |

#### (b) inset % 가이드

| 속성 | 값 (P0 측정값, 신뢰도 높음) |
|---|---|
| position | absolute |
| top | 1% |
| left | 1% |
| right | 3% |
| bottom | 4% |

> 측정 근거: PNG 957×1021, 흰 종이 영역 raw bbox. 종이가 거의 PNG 전체를 채우고, 좌상·우하 모서리 구겨짐(~5%)은 자동 측정에서 회피됨. 시각 QA에서 모서리 회피를 위해 약간 더 보수적 padding 적용 권장.

#### (c) 테스트 케이스 (`CardContent.text.test.tsx`, 5건)

1. render — 카드 표면 background에 `cards/v2/text.png` 포함
2. edit-mode — editing=true에서 textarea 포커스
3. Esc — `onCommitEdit` 1회 호출
4. 줄바꿈 — Enter 키 입력 시 onChange 페이로드에 `\n` 포함
5. onChange — 텍스트 입력 시 매 입력마다 onChange 호출 (debounce 없음 가정)

#### (d) 수정 대상 라인
- `CardContent.tsx` L148~L175 (`TextCardContent`)
- 신규: `__tests__/CardContent.text.test.tsx`

#### (e) 수용 기준
- 모든 5건 테스트 통과
- Esc 키로 편집 종료 동작 시각 검증 1회
- 기존 다른 카드 테스트 회귀 없음 (`pnpm test cards/`)

---

### P1-B · highlight 카드 (강조)

**Owner**: 1명
**파일**: `CardContent.tsx` (`HighlightCardContent`, L387~)
**현재 상태**: EditableBlock 위임, 카드 키보드 없음, `px-4 py-3.5`.

#### (a) 키보드

| 키 | 동작 |
|---|---|
| `Esc` | commit |
| `Enter` | 줄바꿈 (text와 동일) |

(highlight는 형광펜 영역. text와 거의 동일한 키보드 모델로 단순화.)

#### (b) inset
| 속성 | 값 (P0 측정값, 신뢰도 높음) |
|---|---|
| position | absolute |
| top | 1% |
| left | 1% (좌측 노란바 ~5% 우측부터) |
| right | 3% |
| bottom | 4% |

> 측정 근거: PNG 1039×895, 흰 종이 영역 raw bbox (좌측 노란 highlight 바 자동 제외).

#### (c) 테스트 (`CardContent.highlight.test.tsx`, 5건)
1. render — `cards/v2/highlight.png` 표면
2. edit-mode 포커스
3. Esc commit
4. 강조 영역 색상 토큰 적용 검증 (현재 강조 색 디자인 토큰 사용 시)
5. onChange 텍스트 입력

#### (d) 라인 / (e) 수용 기준
- L387~L437 / 5건 통과, 회귀 없음

---

### P1-C · code 카드

**Owner**: 1명
**파일**: `CardContent.tsx` (`CodeCardContent`, L438~)
**현재 상태**: Enter/Esc 있음 (언어 selector 자체에). 코드 본문 키보드 미정의. `px-4 py-3`.

#### (a) 키보드 — code는 텍스트성 중 가장 정교함

| 키 | 동작 |
|---|---|
| `Esc` | commit |
| `Tab` | **들여쓰기** 삽입 (`e.preventDefault()`로 default 차단) — 2 spaces |
| `Shift+Tab` | 들여쓰기 해제 (현재 줄 앞 2 spaces 제거) |
| `Enter` | 줄바꿈 + **이전 줄 들여쓰기 유지** (auto-indent) |
| `Cmd/Ctrl+/` | (Phase 2, 본 PR 밖) 라인 주석 토글 |

#### (b) inset (P0 측정값, 신뢰도 중간)
| 속성 | 값 |
|---|---|
| top | 12% (상단 회색 헤더 띠 제외) |
| left | 1% |
| right | 16% (우측 펜 그래픽 회피) |
| bottom | 20% (펜 회피) |

> 측정 근거: PNG 1114×811, 흰 본문 종이 raw bbox. 회색 헤더(상단)와 우하단 펜 영역이 큰 시각 요소이므로 right/bottom이 큼. 본문은 헤더 div + 본문 div 2단으로 렌더되므로, 본문 컨테이너에 적용 시 top 0% + 헤더 자체 높이로 처리할 수도 있음 — 워커 판단.

#### (c) 테스트 (`CardContent.code.test.tsx`, 6건)
1. render — `cards/v2/code.png` 표면 + 언어 라벨 표시
2. Tab 들여쓰기 — `value`에 2 spaces 삽입
3. Shift+Tab — 줄 앞 2 spaces 제거
4. Enter auto-indent — 이전 줄의 leading spaces 유지
5. Esc commit
6. 언어 selector 변경 → onChange 페이로드에 `language` 필드 반영

#### (d) 라인 / (e) 수용 기준
- L438~L560 / 6건 통과 + auto-indent 시각 QA 1회

---

### P1-D · link 카드

**Owner**: 1명
**파일**: `CardContent.tsx` (`LinkCardContent`, L1231~)
**현재 상태**: Enter/Esc만 (URL 1줄 편집). Open Graph 미리보기 있음. `px-3.5 py-3`.

#### (a) 키보드

| 키 | 동작 |
|---|---|
| `Esc` | commit |
| `Enter` | URL commit + Open Graph fetch 트리거 (현재 동작 유지) |
| `Tab` | URL → 제목 → 설명 메타 필드 간 이동 |
| `Shift+Tab` | 역방향 |
| `Cmd/Ctrl+K` | URL 필드로 포커스 점프 (편집 모드 안에서) |

#### (b) inset (P0 측정값, 신뢰도 중간)
| 속성 | 값 |
|---|---|
| top | 6% (상단 회색 thumb 박스 시작점) |
| left | 5% |
| right | 7% |
| bottom | 47% (※ 하단 흰 종이 텍스트 영역과 분리) |

> 측정 근거: PNG 806×1151, 상단 회색 thumb 박스 영역. 카드 구조상 thumb img + 메타 텍스트 2단으로 렌더되므로 단일 inset으로 표현이 어려움. 실제 구현은 (1) thumb 영역 = top 6% / bottom 47% 안에 contain, (2) 메타 텍스트 영역 = top 53% / bottom 4% (좌우 5~7%) 권장.

#### (c) 테스트 (`CardContent.link.test.tsx`, 6건)
1. render — `cards/v2/link.png` + URL 표시
2. Enter URL commit — Open Graph fetch 호출(mock)
3. Tab — URL → 제목 필드로 포커스 이동
4. Cmd+K — 다른 필드에서 URL 필드로 점프
5. Esc commit
6. 잘못된 URL — onChange 페이로드에 에러 플래그 (현재 검증 로직 있다면)

#### (d) 라인 / (e) 수용 기준
- L1231~L1395 / 6건 통과 + Tab 흐름 시각 QA

---

### P1-E · mindmap 카드

**Owner**: 1명
**파일**: `CardContent.tsx` (`MindmapCardContent`, L1094~)
**현재 상태**: Enter/Backspace/Esc 있음 (노드 추가/삭제). 카드 중 키보드 가장 성숙. `px-4 py-3.5`.

#### (a) 키보드 — 리스트성, checklist 패턴 차용 + 트리 확장

| 키 | 동작 |
|---|---|
| `Esc` | commit |
| `Enter` | 같은 깊이의 새 노드 추가 + 포커스 |
| `Tab` | 자식 노드로 들여쓰기 (깊이 +1) |
| `Shift+Tab` | 부모 깊이로 (깊이 -1) |
| `↑ / ↓` | 인접 노드로 포커스 이동 (트리 in-order 순회) |
| `Backspace`(빈 노드) | 노드 제거 + 이전 노드 끝으로 포커스 |

#### (b) inset (P0 측정값, 신뢰도 중간)
| 속성 | 값 |
|---|---|
| top | 1% (상단 압정 2개 회피 위해 시각 QA에서 ~8%로 보수 조정 권장) |
| left | 4% |
| right | 5% |
| bottom | 10% (하단 와이어 그래픽 회피) |

> 측정 근거: PNG 1150×1147, 코르크/크림 보드 raw bbox. 상단 압정(좁은 영역)은 자동 측정에서 row 비율로는 잡혔지만 시각적으로는 콘텐츠 위에 안 가도록 ~8% top buffer 권장.

#### (c) 테스트 (`CardContent.mindmap.test.tsx`, 6건)
1. render — `cards/v2/mindmap.png` 표면
2. Enter — 새 노드 추가, 포커스 이동
3. Tab — 자식 깊이로 (페이로드 `depth` 변화)
4. ↑↓ — 인접 노드 포커스
5. Backspace 빈 노드 — 제거 + 이전 노드 끝
6. Esc commit

#### (d) 라인 / (e) 수용 기준
- L1094~L1230 / 6건 통과 + 트리 구조 시각 QA

---

### P2-A · image 카드

**Owner**: 1명
**파일**: `CardContent.tsx` (`ImageCardContent`, L561~)
**현재 상태**: 파일 피커 + alt 메타 1줄. 카드 키보드 없음. `px-3 py-2`.

#### (a) 키보드 — 미디어성, 메타 편집 중심

| 키 | 동작 |
|---|---|
| `Esc` | commit |
| `Enter` | alt 텍스트 commit (현재 EditableLine 동작 유지) |
| `Tab` | alt → caption(있다면) 필드 이동 |
| `Space` | 이미지 영역 포커스일 때 파일 피커 열기 (현재 클릭과 동일) |

#### (b) inset (P0 측정값, 신뢰도 높음)
| 속성 | 값 |
|---|---|
| top | 10% (상단 클립 회피) |
| left | 6% |
| right | 7% |
| bottom | 7% |

> 측정 근거: PNG 941×1081, 중앙 회색 사진 박스 영역 raw bbox. 상단 클립이 회색 박스 위에 약간 걸치므로 시각 QA에서 ~13%로 보수 조정 가능.

#### (c) 테스트 (`CardContent.image.test.tsx`, 5건)
1. render — `cards/v2/image.png` + 이미지 placeholder
2. 파일 피커 Space — input.click() 호출 (mock)
3. alt 입력 — onChange 페이로드 `alt` 필드
4. Enter alt commit
5. Esc commit

#### (d) 라인 / (e) 수용 기준
- L561~L672 / 5건 통과

---

### P2-B · file 카드

**Owner**: 1명
**파일**: `CardContent.tsx` (`FileCardContent`, L673~)
**현재 상태**: 파일 피커 + 파일명 편집. 키보드 없음. `px-3.5 py-3`.

#### (a) 키보드

| 키 | 동작 |
|---|---|
| `Esc` | commit |
| `Enter` | 파일명 commit |
| `Tab` | 파일명 → 설명(있다면) |
| `Space` | 파일 아이콘 포커스일 때 파일 피커 |
| `Cmd/Ctrl+D` | (Phase 2, 본 PR 밖) 다운로드 트리거 |

#### (b) inset (P0 측정값, 신뢰도 중간)
| 속성 | 값 |
|---|---|
| top | 5% (폴더 탭 우측 시작점) |
| left | 1% |
| right | 3% |
| bottom | 4% |

> 측정 근거: PNG 1062×1064, 폴더 본체(creamy) raw bbox. 좌상단 폴더 탭(약 13% 폭 × 5% 높이)이 자동 측정에서는 본체로 포함되었으나 시각적으로 콘텐츠는 탭 아래에서 시작. top을 0%로 두고 좌상단 13% 폭만 회피하거나, 일괄 top:5%로 처리.

#### (c) 테스트 (`CardContent.file.test.tsx`, 5건)
1. render — `cards/v2/file.png` + 파일명 표시
2. 파일명 편집 — onChange `name` 필드
3. Enter commit
4. Space — 파일 피커 열기
5. Esc commit

#### (d) 라인 / (e) 수용 기준
- L673~L775 / 5건 통과

---

### P2-C · audio 카드

**Owner**: 1명
**파일**: `CardContent.tsx` (`AudioCardContent`, L776~)
**현재 상태**: MediaRecorder 위주. 재생/탐색 키보드 없음. `px-3.5 py-3`.

#### (a) 키보드 — 미디어 재생 표준

| 키 | 동작 |
|---|---|
| `Esc` | commit |
| `Space` | 재생/일시정지 토글 |
| `← / →` | -5초 / +5초 탐색 |
| `M` | 음소거 토글 |
| `Tab` | 재생 컨트롤 → 캡션 필드(있다면) |

#### (b) inset (P0 측정값, 신뢰도 높음)
| 속성 | 값 |
|---|---|
| top | 8% |
| left | 32% (좌측 검은 녹음기 그래픽 우측부터) |
| right | 3% |
| bottom | 6% |

> 측정 근거: PNG 933×521, 우측 흰 종이 영역 raw bbox. 좌측 32%는 녹음기 일러스트, 콘텐츠(녹음 상태/시간/버튼)는 우측 종이에 표시.

#### (c) 테스트 (`CardContent.audio.test.tsx`, 5건)
1. render — `cards/v2/audio.png` + waveform placeholder
2. Space — audio element `paused` 토글 (mock element)
3. ←→ — currentTime ±5
4. M — muted 토글
5. Esc commit

#### (d) 라인 / (e) 수용 기준
- L776~L961 / 5건 통과 + 실제 mp3 재생 시각 QA 1회

---

### P2-D · handwriting 카드

**Owner**: 1명
**파일**: `CardContent.tsx` (`HandwritingCardContent`, L962~)
**현재 상태**: Pointer 드로잉. 키보드는 Clear 버튼 클릭만. `py-1.5`.

#### (a) 키보드 — 드로잉 도구 단축키

| 키 | 동작 |
|---|---|
| `Esc` | commit |
| `Cmd/Ctrl+Z` | undo 마지막 stroke |
| `Cmd/Ctrl+Shift+Z` | redo |
| `Cmd/Ctrl+Backspace` | 전체 clear (현재 Clear 버튼과 동일) |
| `[` / `]` | 펜 굵기 -1 / +1 |
| `E` | 지우개 토글 |

#### (b) inset (P0 측정값, 신뢰도 중간)
| 속성 | 값 |
|---|---|
| top | 13% (상단 펜 그래픽 회피) |
| left | 1% |
| right | 8% (우측 펜 회피) |
| bottom | 9% |

> 측정 근거: PNG 1148×1171, 흰 종이 raw bbox. 우하단 펜이 큰 그래픽이라 right/bottom이 큼. 드로잉 영역은 펜에 가려지지 않는 안전 영역.

#### (c) 테스트 (`CardContent.handwriting.test.tsx`, 6건)
1. render — `cards/v2/handwriting.png` + canvas
2. Cmd+Z undo — strokes 배열 길이 -1
3. Cmd+Shift+Z redo — undo된 stroke 복원
4. Cmd+Backspace — strokes 빈 배열
5. `[` / `]` — 펜 굵기 state 변화
6. Esc commit

#### (d) 라인 / (e) 수용 기준
- L962~L1093 / 6건 통과 + 펜 드로잉 시각 QA 1회

---

## 7. 결정 사항

### D-1 · 컴포넌트 파일 분리 여부

**옵션 A** (권장): 단일 파일 유지 + 머지 순서로 충돌 회피. P0 0.5d. 단점: 9명 진짜 동시 머지는 어렵고 순차 머지.

**옵션 B**: P0에서 9개 컴포넌트를 `cards/{kind}/Content.tsx`로 분리. P0 1.5d. 9명 진짜 동시 머지 가능.

→ **P0 워커가 첫날 끝에 결정**. 9명을 정말 풀로 돌릴지 여부에 따라.

### D-2 · 기준점 checklist를 본 플랜에 포함할지

**제외**. checklist는 이미 `1fea4a0`에서 완성됨. 본 플랜은 9종만 다룬다. 다만 §4.4 테스트 패턴은 checklist 테스트 파일을 reference로 사용 — 본 PR에서 변경 금지.

### D-3 · Phase 2로 미루는 항목

- 카드 간 포커스 이동 (카드 ↔ 캔버스, 카드 ↔ 카드) → `useShortcuts.ts` 영역
- `Cmd+Enter`로 commit + 다음 카드 진행 → 전 카드 적용
- code 카드 라인 주석 토글, file 카드 다운로드 단축키
- 모바일 터치 환경에서의 키보드 대응 → FEAT-mobile 범위

---

## 8. 통합 후처리 (C 그룹)

P1+P2 9개 모두 머지 후:
1. 회귀 회귀: `pnpm test cards/` 전체 통과 (45~50건 신규 + checklist 6건 기존).
2. 시각 QA: 9개 카드 각각을 캔버스에 1개씩 띄워 inset 정합·키보드 단축키 모두 확인.
3. `docs/specs/_index.md`의 진척 현황 표에 "카드 UX v2" 항목 추가 (Status: ✅).
4. 본 문서를 `docs/plans/complete/SIDEBAR-CARDS-UX.md`로 이동.
5. 교훈 축적: `fm_append`에 카드 UX 표준화 패턴 기록.

---

## 9. 산출 메타

- 단위 수: 1 (P0) + 5 (P1) + 4 (P2) + 1 (C) = **11**
- 예상 총 인일: P0 0.5d + P1·P2 9개 평균 0.6d + C 0.5d = **약 6.4 인일** (9명 병렬 시 wall clock ~2일)
- 위험: 단일 파일 머지 충돌, PNG 종이 영역 측정 불일치, 카드별 키보드 모델 일관성 표류
- 완화: §5.4 머지 순서, P0에서 inset 일괄 측정, §4.1 공통 표준 표 준수
