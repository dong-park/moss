# poc의 공동 편집·로그인 작업을 moss로 옮기기

## 목표
`dong-park/poc`의 `moss/`에 쌓인 작업 40커밋을 `dong-park/moss` main에 합친다.
옮길 것: collab 백엔드, Yjs 원본 전환, 로그인·공유·실시간 편집 UI, 온보딩 라우트, 메일 로그인, OrbStack compose.

## 결정
- 두 저장소는 `531612d`(메모는 항상 정사각형, 9/23)에서 갈라졌다. 해시가 같다.
- `git subtree split --prefix=moss`로 poc 기록을 뽑았다. 기준이 `531612d`와 같아서 커밋을 다시 쓰지 않는다.
- 브랜치 `feat/collab-port`에서 `origin/main`을 합친다. 커밋 기록은 그대로 남는다.

## 진행
- [x] 기준점 확인, split, `feat/collab-port` 생성
- [x] 충돌 6파일 21군데 해결: page.tsx 2, Canvas.tsx 1, DraggableCard.tsx 1, liveSync.ts 7, storage.ts 2, workspace.ts 8
- [x] moss 쪽 새 기능을 Yjs 원본에 잇기 (아래)
- [x] 타입체크 통과
- [x] 테스트: 1372개 중 1363 통과, 8 건너뜀, 1 실패. 실패한 `Canvas.virtualization`은 합치기 전 양쪽 main에서도 이미 실패한다.
- [x] `next build` 통과
- [ ] PR

## 새 기능을 Yjs에 이은 곳
- 표 보기: 화면을 `WorkspaceShell`로 옮겼다. 보기 전환 버튼은 공유 버튼 줄에 둔다.
- 표 보기 제목 수정: `updateNoteTitle`이 보드 문서의 title·updatedAt 두 키도 쓴다.
- 표 보기 실시간 반영: 원격 메모 반영이 미러에 쓴 뒤 `notifyNoteChanges`를 부른다. 옛 탭 간 프로토콜 테스트 2개를 새 경로로 바꿨다.
- 표 보기 보드 전환: `setCurrentBoard`가 끝나면 주소도 따라 바꾼다. 표에서 연 보드를 새로고침해도 그 보드가 열린다.
- 글자 도구 빈 상자 삭제: `hardDeleteNotes`가 문서에서도 메모와 닿은 연결선을 지운다. 부르는 쪽이 보드를 넘긴다.
- 글자 도구·연결선 새 필드 4개를 문서 필드 목록에 더했다: textSize, autoWidth, sourceSide, targetSide.
- 연결선: 보드를 열 때 문서에서 읽는다. 다른 사람이 바꾼 선이 바로 화면에 뜬다.
- `storageBoardId()`는 온보딩 작업에서 없어졌다. moss 쪽 호출 8곳을 보드 id 그대로로 바꿨다.

## 남은 틈
- 표 보기는 미러를 읽는다. 열지 않은 보드에 다른 사람이 쓴 내용은 그 보드를 열기 전까지 표에 안 뜬다.
- 휴지통으로 보낸 메모에 닿은 연결선은 문서에 남는다. 공동 편집 쪽 원래 동작이고, 화면은 양 끝이 있는 선만 그린다.
- 테스트 수정: 표 보기 테스트는 시스템 보드 옛 값 `"system"`을 상수로 바꾸고 복귀 대상 보드를 만든다. 연결선 테스트는 Yjs 문서에 씨앗을 심는다.
- 휴지통에서 되돌린 연결선을 문서에도 다시 쓴다. 공동 편집 쪽 `restoreNote`는 미러에만 되돌렸다.
- 문서에 쓰는 카드 필드에 color·textSize·autoWidth를 더했다. 빠져 있어서 새로고침하면 글자 크기와 색이 사라졌다.
