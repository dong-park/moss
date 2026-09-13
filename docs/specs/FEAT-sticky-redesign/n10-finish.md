# n10-finish — 옛 생성 경로 정리와 전체 검증

> 자기완결 브리프. runner는 [상위 spec](../FEAT-sticky-redesign.md) + [plan 공통 완료 기준](../FEAT-sticky-redesign.plan.md#공통-완료-기준) + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n3-fresh-db, n5-memo-front, n6-canvas-capture, n8-dock, n9-naming
**상태**: pending

## 문제

노드별로 기능이 들어와도 옛 image·link·audio·file·mindmap 카드를 새로 만드는 경로가 남아 있으면 "메모 한 종류" 원칙이 새고, 전체 흐름은 아무 노드도 끝까지 확인하지 않았다.

## 목표

옛 종류를 새로 만드는 경로가 코드에 없고, spec §10 DOD의 수동 시나리오·시안 대조가 끝나 결과가 기록돼 있다.

## 작업

1. 생성 경로 제거: `addCardAt`·단축키·붙여넣기·템플릿(`web/src/templates/`)에서 image·link·audio·file·mindmap 카드를 새로 만드는 분기를 찾아 지운다. `grep -rn '"image"\|"link"\|"audio"\|"file"\|"mindmap"' web/src --include='*.ts*'`로 후보 확인.
2. `web/src/components/workspace/cards/{image,link,audio,file,mindmap}/Content.tsx`와 관련 테스트(기준선 실패 중인 `CardContent.image`·`autoFocus` image 포함)를 삭제한다 — v5 초기화로 옛 데이터가 없다. 가져오기(export/import) 경로가 옛 종류를 받으면 거부하게 한다. `NoteKind` 값은 타입에 남긴다(spec §6).
3. 수동 시나리오 A: 빈 DB → 독에서 메모판·메모·파일함 생성 → 메모를 판에 넣고 판 이동 → 메모 창에서 이미지·링크·녹음·파일 블록 추가 → 앞면 배지 확인 → 새로고침.
4. 수동 시나리오 B: 옛 카드가 든 브라우저(v4)로 앱을 열어 빈 상태로 시작하는지, 첨부가 비었는지 확인.
5. 시안 대조: to-be 시안(https://claude.ai/code/artifact/d81cc26d-7e72-4c2f-ac1c-49054e923885) ①②③, 독 시안(https://claude.ai/code/artifact/46f2f5cb-4390-4fe5-a39f-604104b0309e) A1과 dev 서버 스크린샷을 나란히 두고 차이 목록 작성. 펜 툴바 위치(spec §9 후속)는 이 캡처로 판단 근거만 남긴다.
6. spec `Status`를 구현 완료로, `docs/moss.blueprint.json` features에 FEAT-sticky-redesign 추가(spec 머리말 "Blueprint" 항목).

## 완료 기준

- [ ] plan 공통 완료 기준 전부
- [ ] 1번 grep에서 옛 종류를 **생성**하는 분기 0건(타입 참조는 허용, 남긴 것 목록을 `구현 메모`에)
- [ ] `cd web && npx vitest run && npx tsc --noEmit && npm run build` 통과
- [ ] 시나리오 A·B 각 단계 스크린샷 경로와 통과/실패를 `구현 메모`에
- [ ] 시안 대조 차이 목록(허용/수정 필요 구분)을 `구현 메모`에
- [ ] 실경로: 위 시나리오는 `npm run build && npm run start` 프로덕션 빌드에서 수행

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/workspace.ts` | addCardAt·CAPTURE_TOOLS |
| `web/src/components/workspace/useShortcuts.ts` | 캡처 단축키 |
| `web/src/templates/` | 새 프로젝트 템플릿 카드 |
| `web/src/components/workspace/cards/` | 옛 종류 Content |
| `docs/specs/FEAT-sticky-redesign.md` | Status·DOD |
| `docs/moss.blueprint.json` | features 목록 |

## 구현 메모

