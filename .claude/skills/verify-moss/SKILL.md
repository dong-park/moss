---
name: verify-moss
description: "moss 웹(web/)을 ego-browser로 몰아 cmd+z·편집기·캔버스 동작을 증거로 잡는 레시피. 로컬 dev 서버 localhost:3000 기준."
---

# verify-moss — 웹 UI 몰기

갱신 상태: 2026-11-10, 브랜치 feat/cmd-z-undo, HEAD 00a0d63에서 cmd-z-undo 기준 9개를 라이브로 돌려 얻었다. 아래 레시피는 그 실행에서 쓴 것만 적었다.

## 띄우기
- 사용자가 `web/`에서 next dev를 띄운다(포트 3000). 끄거나 다시 띄우지 않는다. `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`이 200이면 된다.
- 동기화 ws://localhost:1234, API http://localhost:8080은 로컬이다. 운영이 아니다.
- 로그인은 브라우저 프로필에 이미 있었다. 없으면 막힘으로 돌려준다. 계정 정보는 입력하지 않는다.

## 몰기 (ego-browser)
- `ego-browser skill`로 사용법을 받는다. 스크립트는 `ego-browser nodejs < 파일.mjs`로 돌린다. 줄 수 제한이 있는 환경에서는 파일로 쓴다. 파일끼리 import는 안 된다.
- 한 작업 공간 `taskSpace("moss cmd-z prove")`를 매 라운드 다시 불러 쓴다. 끝나면 `task.finish({keep: []})`.
- 키는 `page.keyboard.press("Meta+z")`, 다시 실행은 `"Meta+Shift+z"`. 페이지에서 keydown을 잡아 보면 `metaKey:true`로 온다. 편집기 안에서는 `defaultPrevented:true`다.
- 더블클릭은 `page.mouse.click` 두 번으로 안 된다. `page.dblclick(selector, {force:true})`를 쓴다. 파일함 카드는 `text="0개"`처럼 정확 일치 텍스트로 잡는다. 같은 텍스트가 둘이면 evaluate로 속성을 달고 `css:span[data-x=y]`로 잡는다.
- 카드는 `[data-card-id]` 요소이고 `style.left/top/width/height`가 좌표다. 이동·삭제·복원을 이 값으로 읽는다. 소속(frameId)은 DOM에 없다. 판을 끌어 안의 메모가 같이 움직이는지로 본다. 판은 좌측 가장자리 띠(판 왼쪽 안쪽 10px)를 잡고 끈다. 제목 글자는 안 끌린다.
- 카드 끌기: `mouse.move` → `mouse.down` → 10번 이상 `mouse.move` → `mouse.up`. 한 번 끌기가 1단계다.
- 새 파일함 만들기: dock `aria-label="파일함"` 클릭 → 새 카드를 dblclick하면 `/b/<새 id>` 보드로 들어간다. 시험용 보드로 쓴다. 비어 있던 보드가 다시 불릴 때 시드 카드(seed-todo·seed-preview·seed-empty)가 채워질 수 있다.
- 펼친 메모 창: 카드를 클릭해 고른 뒤 `button[aria-label="펼쳐서 편집"]`(호버에만 보여 `force:true`). 본문은 `[contenteditable=true]`의 innerText, 제목은 별개 입력이다. 닫기는 우상단 X를 좌표(1186,120)로 누른다.
- 블록 메뉴: `+ 블록 추가`를 누르면 메뉴가 DOM에 뜨지만 z-index 40이 오버레이 45 밑이라 마우스로 못 누른다. 키보드로 간다. 메뉴 열기 → ArrowDown 2번이 「링크」 → Enter → 주소 입력 → Enter. 이미지·파일 항목은 파일 선택기를 열어 막힌다.
- 파일 올리기: 판 우클릭 메뉴의 `[data-frame-bg-item=upload]`를 `page.waitForFileChooser()`를 먼저 걸고 누른다. 시험 PNG는 python3 zlib로 만든다.
- 휴지통: dock `aria-label="휴지통"`. 패널 행은 시각 문자열로 센다. 패널은 빈 캔버스를 눌러 닫는다. 영구 삭제 버튼은 `aria-label="영구 삭제"`다.

## 조심
- 선택 없이 빈 캔버스에서 Esc는 부모 보드로 올라간다. 보드를 떠나면 그 보드의 되돌리기 기록이 비워진다. cmd+z 시험 전에 카드를 고른 상태를 만든다.
- 편집기 창에서 블록을 넣은 직후 포커스가 BODY로 간다. 이 상태의 meta+z는 막 연 편집기에서 안 먹었다. 편집기를 클릭해 포커스를 주면 먹는다.
- 같은 시각 다른 작업이 `.next`를 건드리면 dev 화면이 전체 새로고침된다. 새로고침 뒤에는 「다른 계정의 보드」 카드(`이대로 계속`은 메모리 상태만 바꾼다)가 다시 뜨고 되돌리기 기록과 편집기 상태가 사라진다. 시험은 한 스크립트 안에서 `performance.timeOrigin`을 찍어 새로고침 여부를 확인한다.
- alert·confirm을 띄우는 동작은 피한다. 파일함 삭제는 대화상자 없이 3초 되돌리기 토스트만 뜬다.

## 정리
- 시험용 파일함 카드를 부모 보드에서 지운다(Delete). 토스트 3초가 지나면 확정된다.
- 휴지통에는 이번 실행이 만든 행만 영구 삭제한다. 사용자의 기존 행은 둔다.
- 지운 보드의 y-indexeddb는 남는다. 페이지에서 `indexedDB.deleteDatabase("moss-board-<시험 보드 id>")`로 지운다. 시험 보드 id만 지운다.
- OPFS 파일(`navigator.storage.getDirectory()`)에 시험 사진이 남았는지 본다. 이번 실행에서는 보드 삭제와 함께 사라졌다.
