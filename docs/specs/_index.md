# moss 기능 스펙 인덱스

> 블루프린트 `features[]` 14개. 완료본은 `complete/`로 이동, 잔여·미시작 8개는 본 디렉토리에 유지.

## 진척 현황 (2026-05-21 기준)

| 상태 | 수 | 비고 |
|---|---|---|
| ✅ complete | 6 | `complete/` 디렉토리 |
| ◐ in-progress | 4 | 잔여 작업 명확화됨 |
| ⏸ pending | 4 | 아직 미시작 |
| **합계** | **14** | |

## ✅ Complete (`complete/` 디렉토리)

| FEAT | 차수 | 완료일 | 핵심 산출 |
|---|---|---|---|
| [storage](complete/FEAT-storage.md) | 1차 | 2026-05-21 | Dexie v1 + OPFS + SW + persist + quota watcher |
| [i18n](complete/FEAT-i18n.md) | 1차 | 2026-05-21 | Pretendard + Provider + `t()` + ko.json 119 keys |
| [privacy](complete/FEAT-privacy.md) | 1차 | 2026-05-21 | aiGate 진리표 + AICallPreview + LockIcon |
| [capture](complete/FEAT-capture.md) | 2차 | 2026-05-21 | 10종 도구 + 단축키 + 클립보드 paste + CardContent |
| [boards](complete/FEAT-boards.md) | 3차 | 2026-05-21 | BoardPicker 동적화 + CRUD + Cmd+P/B/N + undo |
| [templates](complete/FEAT-templates.md) | 3차 | 2026-05-21 | 5종 시작 템플릿 + Picker + Preview |

## ◐ In-progress (잔여 작업 명확화됨, 각 스펙 §0 참조)

| FEAT | 차수 | 충족도 | 잔여 작업 요약 |
|---|---|---|---|
| [canvas](FEAT-canvas.md) | 2차 | 5/6 | AC-3 가상화 (200+ 메모 컬링 또는 Canvas2D fallback) |
| [ai-pipeline](FEAT-ai-pipeline.md) | 2차 | 코어 완성 | `/api/ai/{summarize,connection-label}` endpoint + 연결 점수 계산 + 클러스터링 |
| [home](FEAT-home.md) | 3차 | 1/4 큐레이팅 | `resurfacing` / `today-connection` / `flow-timeline` 카드 3종 + 도구 drop·dismiss·삭제 가드 |
| [signals](FEAT-signals.md) | 3차 | 2/4 섹션 | **lint 3 fix** + `Cluster` / `FlowSummary` 섹션 + 키워드 필터·dismiss 동작 |

## ⏸ Pending (4차 미시작)

| FEAT | 추정 | 의존 (모두 완료/in-progress) |
|---|---|---|
| [extras](FEAT-extras.md) | S | home (큐레이팅과 위젯이 같은 시스템 보드에) |
| [freemium](FEAT-freemium.md) | M | storage, privacy, ai-pipeline (쿼터 게이트 교체) |
| [mobile](FEAT-mobile.md) | M | home, capture, boards |
| [export](FEAT-export.md) | M | storage, canvas |

## 다음 단계 권장 순서

**Phase 3.5 (마무리)** — 4차 시작 전 in-progress 4개 닫기:

1. **signals 작업자**: lint 3 fix (즉시), 그 후 Cluster / FlowSummary 섹션 + `/api/ai/summarize` endpoint 신설
2. **home 작업자**: 큐레이팅 3종 카드 (`/api/ai/connection-label`은 ai-pipeline 작업자와 협업)
3. **ai-pipeline 작업자**: home·signals 잔여에 필요한 endpoint 동시 보강 (summarize + connection-label + 연결 점수 + 클러스터링)
4. **canvas 작업자**: AC-3 가상화는 분리 가능 — 4차와 병렬

**Phase 4** — 위 마무리 후 4차 병렬:
- extras / freemium / mobile / export 4개 모두 독립

## 1차 잔여 마이너 (배경 정리)

- `quota-watcher.test.tsx`의 `act() 환경` 경고 (테스트는 통과)
- `useClipboardWatch.test.tsx` 후 `DatabaseClosedError` unhandled rejection (테스트는 통과)
- i18n 빌드 검증 스크립트 (`scripts/check-i18n.mjs`)는 dev 단계에서만 작동, prod build에 통합 X

## 스펙 작성·갱신 규칙

- **§0 잔여 작업** 섹션: in-progress 스펙은 본문 §1~10 위에 잔여 작업만 압축한 §0 두기
- complete로 이동 시: 헤더 Status를 `✅ complete (날짜) — 검증 통과, AC 모두 충족`으로
- 4차 진입 시점에 본 인덱스 재갱신
