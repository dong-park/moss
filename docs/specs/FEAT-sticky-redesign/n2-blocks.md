# n2-blocks — 블록 마크다운 문법 모듈

> 자기완결 브리프. runner는 [상위 spec](../FEAT-sticky-redesign.md) + [plan 공통 완료 기준](../FEAT-sticky-redesign.plan.md#공통-완료-기준) + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: 없음
**상태**: done

## 문제

이미지·링크·녹음·파일을 메모 본문 마크다운 안의 블록으로 두기로 했다(spec §6). 이관(n3)·창(n4)·앞면(n5)·붙여넣기(n6)가 모두 같은 문법을 읽고 써야 하는데, 지금은 이미지(`![](opfs://…)`)만 있다.

## 목표

UI 의존 없는 순수 모듈 하나가 네 블록을 만들고, 문단에서 알아보고, 본문의 블록 개수를 센다. 파싱→직렬화 왕복이 같은 문자열을 낸다.

## 작업

1. `web/src/state/blocks.ts` 신규. spec §11 "블록 마크다운 문법" 표 그대로:
   - 이미지 `![](opfs://<file>)` · 링크 `[<title|url>](<url> "moss-link")` · 녹음 `[녹음](opfs://<file> "moss-audio")` · 파일 `[<파일명>](opfs://<file> "moss-file")`
2. API: `serializeBlock(block)`, `parseBlock(paragraphText) → Block | null`(문단에 단독으로 있을 때만 블록), `countBlocks(markdown) → {image, link, audio, file}`, `firstBlockIsImage(markdown)`.
3. OPFS 참조 변환은 `web/src/components/workspace/cards/_shared/editor/imagePaste.ts`의 `toStorageRef`/`toMarkdownUrl`을 재사용한다(확인함: `toStorageRef`는 50행에 export 없는 함수 — export를 추가한다). `opfs:` vs `opfs://` 스킴 차이를 테스트로 고정한다.
4. 제목 비면 URL을 링크 제목으로(spec §4). 파일명·제목의 `]`, `"` 등 마크다운 특수문자 이스케이프.
5. 테스트 `web/src/state/__tests__/blocks.test.ts`: 네 블록 왕복, 문장 안 같은 링크는 블록 아님, 개수 세기, 특수문자 파일명, 빈 제목.

## 완료 기준

- [ ] plan 공통 완료 기준 전부
- [ ] `cd web && npx vitest run src/state/__tests__/blocks.test.ts` 통과
- [ ] 네 블록 모두 `serializeBlock(parseBlock(s)) === s` (spec §10 DOD "블록 마크다운 왕복")
- [ ] 문단 안에 섞인 `"moss-link"` 링크는 `parseBlock`이 null
- [ ] 실경로: imagePaste.ts의 실제 변환 함수를 import해 쓴다(복제 금지)

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/cards/_shared/editor/imagePaste.ts` | 기존 OPFS 이미지 문법·참조 변환 |
| `web/src/state/cardContent.ts` | 카드 content 인코딩 헬퍼(참고) |
| `web/src/state/__tests__/` | state 테스트 위치 |

## 구현 메모

- `web/src/state/blocks.ts` 신규: `Block`/`BlockType`/`BlockCounts` 타입, `serializeBlock`, `parseBlock`, `countBlocks`, `firstBlockIsImage`.
- `imagePaste.ts`의 `toStorageRef`/`toMarkdownUrl`에 `export` 추가(그대로 재사용, 복제 없음).
- 문단 경계는 `\n` 한 줄 단위로 잡았다(빈 줄 기준 아님) — 블록은 항상 한 줄을 통째로 차지하므로 이 정의로 "문장 안에 섞인 링크는 블록 아님"이 정확히 걸러진다.
- 라벨(파일명·링크 제목) 이스케이프는 `\`,`]`,`"` 세 문자를 역슬래시 1개로 감싸는 단일 정규식 왕복(`[\\\]"]` ↔ `\\(.)`)으로 처리.
- 테스트 `web/src/state/__tests__/blocks.test.ts` 17개: 네 블록 왕복, 특수문자 이스케이프 왕복, 문단 단독 조건, `countBlocks`, `firstBlockIsImage`, imagePaste.ts 스킴 변환 재사용 확인. 전부 통과.
- 커밋: `83702a8 feat(moss): n2 블록 마크다운 문법 모듈`.
- 갭 없음 — stub 없이 imagePaste.ts의 실제 변환 함수를 import해서 씀.
