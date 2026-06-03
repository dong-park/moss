# FEAT-memo-autolink (W10)

**Status**: ✅ complete (2026-06-04) — feat/memo-editor-seams 합본 머지. **Squad**: [[_squad-memo-production]] · [[FEAT-memo-editor-seams]]
**심각도**: 🟢 중하.

## 1. 목표
본문에 URL을 타이핑·붙여넣으면 클릭 가능한 링크로 자동 변환한다.

## 2. 범위
**포함:** `editor/autolink.ts` — Milkdown 플러그인(입력/붙여넣기 시 URL 패턴 감지 → 링크 노드), `extensions.ts` `editorPlugins[]` 등록. 링크는 새 탭(`rel=noopener`)·hover 미리보기. 붙인 단독 URL은 link **카드** 생성 제안(선택).
**제외:** OG 메타 프리뷰 카드(별도), 위키링크(W5).

## 3. 수용 기준
- **AC-1** Given `https://...` 타이핑 후 공백, When 입력, Then 링크로 변환.
- **AC-2** Given URL 붙여넣기, When paste, Then 링크화(sanitize W6 통과 후 적용 — 순서 무해).
- **AC-3** 링크 클릭 시 새 탭, `rel="noopener noreferrer"`.
- **AC-4** 코드블록/인라인코드 안 URL은 변환 안 함.
- **AC-5** 잘못된/부분 URL은 평문 유지(거짓 양성 최소).

## 4. 의존성
P0(`editorPlugins` 슬롯). gfm가 일부 autolink 제공 — 중복 시 gfm 설정으로 충분한지 먼저 확인 후 보강만.

## 5. 데이터 모델
마크다운 `<url>` 또는 `[url](url)`로 인코딩(라운드트립 안정).

## 6. 인터페이스
```ts
// editor/autolink.ts
export const autolink: MilkdownPlugin;   // editorPlugins.push(autolink)
```

## 7. 시각·인터랙션
링크 ink-blue 밑줄, 외부 링크 아이콘. hover 시 전체 URL 툴팁.

## 8. 비기능
URL 정규식 보수적(ReDoS 안전). 펜 좌표계 불변.

## 9. 다음 iteration
링크 OG 프리뷰 카드, 붙인 URL → link 카드 자동 생성 토글.

## 10. DOD
- [ ] autolink 플러그인(입력·paste·코드 예외) + editorPlugins 등록 (gfm 중복 확인)
- [ ] AC-1~5, tsc 0, URL 감지 단위 테스트
