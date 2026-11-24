import { t as defaultT, type Translator } from "@/i18n";
import { SYSTEM_BOARD_ID } from "./boardIds";
import type { Board } from "./db/schema";

type BoardNames = readonly Pick<Board, "id" | "name">[] | ReadonlyMap<string, Pick<Board, "id" | "name">>;

/**
 * 첫 벽(시스템 보드)의 표시 이름. 저장된 이름이 있으면 그 이름, 비었으면 "내 벽".
 * 보드 선택기·경로·휴지통·메모 표·검색 결과가 모두 이 함수를 거친다 — 이름을
 * 바꾸면 어디서나 같은 글자가 나와야 하기 때문이다. `t`는 컴포넌트의 useT 결과를
 * 넘기면 언어 변경을 따라가고, 생략하면 모듈 번역기를 쓴다.
 */
export function systemBoardName(
  boards: BoardNames,
  t: Translator = defaultT,
): string {
  const row = Array.isArray(boards)
    ? (boards as readonly Pick<Board, "id" | "name">[]).find((b) => b.id === SYSTEM_BOARD_ID)
    : (boards as ReadonlyMap<string, Pick<Board, "id" | "name">>).get(SYSTEM_BOARD_ID);
  const stored = row?.name?.trim() ?? "";
  return stored !== "" ? stored : t("workspace.boardPicker.system");
}
