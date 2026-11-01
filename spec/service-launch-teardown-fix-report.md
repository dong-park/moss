# 통합 웹테스트 종료 오류 고정 보고

수정 전 3회 중 1회 실패했고, mossBridge.test.ts의 afterEach 한 줄로 수정 후 5회 모두 exit0이다.

- 원인: real DB 블록의 afterEach가 DB를 닫을 때 300ms 디바운스 저장 타이머가 남아 있었다. 이 타이머가 DB 종료 뒤에 터져 DatabaseClosedError를 내거나, 다음 테스트의 새 DB에 메모를 써서 loadCards 길이 단언을 깼다.
- 후보였던 mossBridge.ts:473과 refreshTrashCount는 원인이 아니다. refreshTrashCount는 이미 catch가 있다.
- 수정: web/src/state/bridge/__tests__/mossBridge.test.ts의 real DB afterEach에서 resetDB 앞에 flushAll을 부른다. 제품 코드는 바꾸지 않았다.
- 복사본 실험: workspace.ts에 DatabaseClosed 묵인 catch만 넣었을 때는 6회 중 1회 실패했다. afterEach 수정만 넣었을 때는 8회 중 0회 실패했다. 그래서 workspace.ts는 수정하지 않았다.
- 원본 측정: 통합 명령 수정 전 3회 중 1회 exit1, 수정 후 5회 모두 exit0이다. bridge 단독 60개도 통과했다.
- 회귀 테스트: afterEach 자체가 회귀 방지 장치이므로 별도 테스트는 넣지 않았다. 레이스가 시간 의존이라 결정적 재현 테스트는 만들 수 없다.
- 확인 안 됨: 수정 전 실패율 1/3은 표본 3회라 정확하지 않다.
- 커밋, 설치, 전체 스위트는 하지 않았다.
