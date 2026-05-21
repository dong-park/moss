# FEAT-freemium · 프리미엄 (Stripe + AI 쿼터)

> Free 사용자에게 AI 쿼터 제한. 소진 시 메모 기능은 정상, AI만 graceful 안내 + Pro 결제 흐름.

**Status**: spec
**Estimated**: M
**Blueprint**: `features[id="FEAT-freemium"]`

---

## 1. 목표

moss는 사고 작업대 — 메모·캔버스·연결은 무료 사용자도 평생 무료. AI 기능(임베딩·요약·연결 제안)만 월 쿼터 100회 제한. 소진 시 잔잔한 안내 + Pro 결제 흐름. PRD §27-3 가격: Free $0 / Pro $8.

## 2. 범위

### 포함
- 사용자 플랜 관리 (`user.plan: "free" | "pro"`) — 서버 측 source of truth
- 쿼터 추적 (월 100회, Free): AI 호출마다 +1, 매월 1일 0시 리셋
- 90% 도달 soft warning — 모달 아닌 잔잔한 토스트
- 100% 도달 후 추가 호출 시도 → SCR-paywall `quota-exhausted` variant 모달
- Pro 전환 흐름:
  1. Pro 안내 모달에서 "Pro로 전환" 클릭
  2. Stripe Checkout 외부 redirect
  3. 결제 완료 → Stripe webhook → backend → `user.plan = "pro"`
  4. 클라이언트 polling 또는 push로 plan 변경 감지
  5. 토스트 "Pro로 전환되었어요" + 쿼터 해제
- Pro-only 기능 시도 시 SCR-paywall `pro-feature-blocked` variant (예: 여러 기기 동기화, 자동 백업)
- 결제 페이지: Stripe checkout (외부)
- 구독 관리 (취소·청구 내역) — Stripe customer portal로 위임
- 가격 토글 (월 / 연, 16% 할인)

### 제외 (다른 FEAT 담당)
- 메모 저장 자체 — [[FEAT-storage]] (쿼터와 무관, 항상 무료)
- AI 호출 게이트 — [[FEAT-ai-pipeline]] (본 feature의 쿼터 체크 호출)
- 옵트아웃 — [[FEAT-privacy]]
- 결제 후 Pro sync 활성화 — Phase 2 별도

## 3. 수용 기준

### AC-1 (REQ-11 충족) — graceful 안내
- **Given** Free 사용자, 쿼터 100/100 소진
- **When** [[FEAT-ai-pipeline]]에서 새 임베딩 호출 시도
- **Then** 클라이언트 단에서 차단. SCR-paywall `quota-exhausted` variant 모달 노출. **메모 저장·캔버스·홈 피드는 정상 동작**.

### AC-2 — 90% soft warning
- **Given** Free 사용자, 쿼터 90/100 도달
- **When** AI 호출 직후
- **Then** 우하단 토스트 "이번 달 AI 인사이트가 곧 소진돼요" + Pro 안내 작은 버튼. 모달 아님.

### AC-3 — Pro 전환 흐름
- **Given** 페이월 모달 표시 중
- **When** 사용자가 "Pro로 전환" 클릭
- **Then** Stripe Checkout 외부 redirect. 결제 완료 후 moss 복귀 시 토스트 "Pro로 전환되었어요". 쿼터 해제 즉시 반영.

### AC-4 — Pro-only 기능 시도
- **Given** Free 사용자, 여러 기기 동기화 시도 (Phase 2 시점)
- **When** 설정에서 동기화 토글
- **Then** SCR-paywall `pro-feature-blocked` variant. "동기화는 Pro 기능이에요. 메모와 캔버스는 그대로 작동합니다."

### AC-5 — 모달 dismiss
- **Given** 페이월 모달
- **When** "지금은 괜찮아요" 또는 ESC
- **Then** 24h 동안 같은 트리거의 모달 재노출 안 함. soft warning은 계속 표시 가능.

## 4. 의존성

### 블루프린트 참조
- requirements: REQ-11
- 등장 화면: SCR-paywall 3 variant 모두
- 등장 flow: FLOW-freemium-paywall (전체)

### 다른 feature
- **의존**: [[FEAT-storage]] (사용자 메타 + 토큰), [[FEAT-privacy]] (옵트아웃과 쿼터는 독립)
- **의존받음**: [[FEAT-ai-pipeline]] (호출 직전 쿼터 체크)

### 외부 API·라이브러리
- `stripe` (백엔드)
- `@stripe/stripe-js` (클라이언트 — checkout redirect만)
- Supabase Auth (사용자 식별)

## 5. 데이터 모델

```ts
// 서버 측 (Supabase)
interface UserPlan {
  userId: string;
  plan: "free" | "pro";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: "active" | "canceled" | "past_due";
  currentPeriodEnd?: number;
}

interface AIQuotaUsage {
  userId: string;
  periodStart: number;      // 매월 1일 0시
  periodEnd: number;
  used: number;             // 호출 횟수
  limit: number;            // Free=100, Pro=Infinity (fair use)
}

// 클라이언트 캐시 (settings 또는 별도)
interface PlanState {
  plan: "free" | "pro";
  quota: { used: number; limit: number; periodEnd: number };
  syncedAt: number;
  paywallDismissed: Record<string, number>;  // 트리거별 dismissedAt
}
```

## 6. 인터페이스

### 백엔드 endpoints
```
POST /api/billing/create-checkout
  body: { plan: "pro-monthly" | "pro-yearly" }
  res: { sessionUrl: string }   // Stripe Checkout URL

POST /api/billing/webhook
  Stripe webhook signature 검증
  처리: customer.subscription.{created,updated,deleted}
  → user.plan 업데이트

GET /api/plan
  res: { plan: "free" | "pro"; quota: { used, limit, periodEnd } }
```

### 클라이언트 hooks
- `usePlan(): PlanState` — 1분 polling 또는 SWR
- `useQuotaGate(): { canCall: boolean; remaining: number; openPaywall: () => void }`

### Store actions
- `useWorkspace.openPaywall(reason: "quota" | "pro-feature" | "warning"): void`
- `useWorkspace.dismissPaywall(reason: string): void`

## 7. 시각·인터랙션

- PRD 참조: §17 SCR-paywall 3 variant, §27 Auth & Payments
- 페이월 모달 톤 (PRD §17): "이번 달 AI 인사이트가 소진되었어요. **메모와 캔버스는 그대로 작동합니다.**" — 안심 카피 핵심
- 비교 표: Free vs Pro, 차이만 강조 (5-6개 bullet)
- Pro 가격: 월 $8 / 연 $80 (16% 절약). 월/연 토글
- soft warning 토스트: 우하단, 잔잔, 3초 dismiss
- 결제 진행 중: Stripe로 외부 이동 (별도 UI 불필요)

## 8. 비기능 요구사항

- **신뢰성**: Stripe webhook 멱등 처리. 같은 이벤트 중복 시 plan 변경 1회만.
- **사용자 보호**: 결제 실패 시 명확 안내, 환불 정책 링크
- **모달 압박 없음**: dismiss 후 24h 침묵. soft warning만 90% 시점에 잔잔하게.
- **i18n**: 모든 카피 i18n 키. 가격 표시는 한국어 ("월 $8" 그대로 — Phase 2에 ₩ 환산 검토)

## 9. 다음 iteration

- **국내 결제** — 토스페이먼츠 통합 (PRD §27-2, 국내 사용자 비율 50%+ 시점)
- **프로모션 / 쿠폰** — 신규 사용자 첫 달 무료 등
- **연 결제 할인 강조** — 16% → 더 큰 인센티브 실험
- **사용량 시각화** — 사용자가 직접 "내가 이번 달 N% 썼다" 확인 (옵션)
- **Pro 무료 체험 7일** — 가입 친화도 측정

## 10. 검증 방법 (DOD)

- [ ] Stripe Checkout 흐름 e2e (test mode)
- [ ] Webhook 멱등성 (같은 이벤트 2회 → 변경 1회)
- [ ] 쿼터 90% / 100% 트리거 정확
- [ ] 페이월 dismiss 24h 재노출 안 함
- [ ] Pro 전환 후 쿼터 해제 즉시 반영
- [ ] PRD §17 3 variant 시각 대조
