# Spec: 화면에서 로그아웃하기
Started: 2026-10-02

## 목표

평소 화면에서 누를 수 있는 로그아웃 버튼을 만든다.
오른쪽 위 아이콘 줄에 계정 아이콘을 하나 둔다.
누르면 작은 메뉴가 열리고, 이름과 "로그아웃"이 보인다.

## 비목표

- 계정 설정과 프로필 편집은 만들지 않는다.
- 로그아웃할 때 이 기기의 보드를 지우지 않는다. 지금 규칙을 그대로 둔다.
- 서버에 토큰 폐기를 따로 요청하지 않는다. 지금 로그아웃 로직을 그대로 쓴다.
- 계정 전환 메뉴는 만들지 않는다.
- 확인 창과 되돌리기는 두지 않는다. 다시 로그인하면 보드가 그대로 있기 때문이다.

## 성공 기준

1. 로그인한 상태면 오른쪽 위 아이콘 줄에 계정 아이콘이 1개 보인다.
2. 계정 아이콘을 누르면 메뉴가 열리고, 로그인한 사람 이름과 "로그아웃" 항목 2개가 보인다.
3. "로그아웃"을 누르면 클릭 1번으로 로그인 첫 화면이 뜬다. 확인 창은 뜨지 않는다.
4. 로그아웃 뒤 공유 보드 연결이 끊긴다. 협업 스토어의 보드 id가 비어 있어야 한다.
5. 로그아웃 뒤 이 기기의 보드 수는 로그아웃 전과 같다.
6. 키보드만으로 메뉴를 열고 로그아웃할 수 있다. 탭으로 아이콘에 가고, 엔터로 열고, 화살표로 고르고, 엔터로 누른다.
7. 계정 아이콘에는 스크린리더가 읽을 이름이 붙어 있다.
8. 위 1~5를 확인하는 테스트가 통과한다.

## 경계 조건

- 이름이 비어 있으면 아이콘에 "?"를 그린다. 메뉴의 이름 줄도 "?"를 보인다.
- 이름이 길면 메뉴 안에서 한 줄로 자르고 말줄임표를 붙인다.
- 오프라인이어도 로그아웃은 된다. 지금 로직은 서버를 부르지 않는다.
- 로그아웃 버튼을 빠르게 두 번 눌러도 로그인 첫 화면은 한 번만 뜬다. 첫 클릭에서 메뉴가 닫히기 때문이다.
- 세션 만료 상태에서도 아이콘은 보인다. 이때 로그아웃은 만료 화면 대신 로그인 첫 화면으로 보낸다.
- 표 보기와 캔버스 보기 모두에서 아이콘이 같은 자리에 있다.

## 기술 결정

- 메뉴는 Radix 드롭다운으로 만든다. 이미 설치돼 있고 공유 메뉴가 같은 방식을 쓴다.
- 아이콘은 공유 화면의 원형 아바타를 다시 쓴다. 새 아바타 컴포넌트를 만들지 않는다.
- 공유 연결 끊기는 새 코드가 필요 없다. 협업 세션이 로그인 상태를 지켜보다가 로그인이 풀리면 스스로 끊는다.
- 확인 창을 두지 않는다. 로그아웃은 데이터를 잃지 않고, 다시 로그인하면 원래대로 돌아온다.

## 구현 메모

- 로그아웃 로직: `web/src/state/auth/store.ts:225` `logout()`. invalidateRefresh 후 clearSession, 그리고 status를 anonymous로 바꾼다. 서버 호출은 없다.
- 공유 연결: `web/src/components/collab/CollabSession.tsx:36-43`. status가 authenticated가 아니면 `useCollab.getState().disconnect()`를 부른다. 47행 언마운트 정리도 있다. 로그아웃하면 WorkspaceGate가 자식을 내리므로 두 길 모두 탄다. 테스트는 `useCollab.getState().boardId === null`로 확인한다.
- 넣을 자리: `web/src/components/workspace/WorkspaceShell.tsx` 약 186행 고정 div. 순서는 OfflineBadge, ShareControlMount, ViewToggle, 그다음 새 AccountMenu를 맨 오른쪽에 둔다.
- 새 파일 제안: `web/src/components/auth/AccountMenu.tsx`. 드롭다운 패턴은 `web/src/components/share/MemberMenu.tsx`를 따른다.
- 아바타: `web/src/components/share/MemberAvatar.tsx` `MemberAvatar`. prop 타입이 `BoardMember`다. auth 사용자 `{ id, name, avatar }`가 이 타입에 맞는지 확인한다. 안 맞으면 id·name만 받도록 prop 타입을 좁힌다.
- 문구: `collab.auth.account.logout` 키가 이미 있다. 아이콘 aria-label용 키 1개를 `web/src/i18n/messages/ko.json`에 새로 넣는다. 예: `collab.auth.account.menu` "계정".
- 기존 로그아웃 버튼: `web/src/components/auth/AccountOwnerGuard.tsx:53,76`. 그대로 둔다.
- 테스트: `web/src/components/auth/__tests__/AccountMenu.test.tsx`. 기존 WorkspaceGate 테스트의 스토어 세팅을 따라 한다.

## 진행

- 2026-10-02 구현 완료, 커밋 전. `AccountMenu.tsx` 새로 만들고 `WorkspaceShell` 우상단 줄 맨 끝에 붙였다. `MemberAvatar` prop을 `Pick<BoardMember, "id" | "name">`으로 좁혔다. 문구 키 `collab.auth.account.menu` "계정"을 더했다.
- 테스트 `AccountMenu.test.tsx` 3개 추가. 관련 78개 통과, tsc·eslint 0.
- Aside 브라우저 실화면: 아이콘 → 메뉴 2줄 → 로그아웃 → 로그인 첫 화면까지 확인.
- 미증명: pharos 브라우저 pane의 실제 계정 세션에서는 아이콘이 안 보였다. 원인 확인 전에 pane이 닫혔다.
