import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ShareControlMount } from "../ShareControlMount";
import { useWorkspace } from "@/state/workspace";
import { SYSTEM_BOARD_ID } from "@/state/boardIds";

describe("ShareControlMount", () => {
  it("시스템 보드에는 공유 아이콘을 그리지 않는다", () => {
    useWorkspace.setState({
      currentBoardId: SYSTEM_BOARD_ID,
      boards: [{ id: SYSTEM_BOARD_ID, name: "", isSystem: true }] as never,
    });
    const { container } = render(<ShareControlMount />);
    expect(container.innerHTML).toBe("");
  });
});
