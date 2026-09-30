import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DRAG_GHOST_SIZE, DragGhost } from "@/components/presence/DragGhost";
import type { PresenceParticipant } from "@/state/presence/types";

const dragging: PresenceParticipant = {
  clientId: 22,
  user: { name: "유진", color: "#30d158" },
  dragging: { noteId: "d", x: 860, y: 470, rotation: -4 },
};

describe("DragGhost", () => {
  it("끄는 참여자가 없으면 아무것도 렌더하지 않는다", () => {
    const { container } = render(
      <DragGhost
        participants={[{ clientId: 1, user: { name: "동환", color: "#5e5ce6" } }]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("끄는 좌표·회전·참여자 색 잔상을 그린다", () => {
    render(<DragGhost participants={[dragging]} />);
    const ghost = screen.getByTestId("drag-ghost-22-d");
    expect(ghost.style.left).toBe("860px");
    expect(ghost.style.top).toBe("470px");
    expect(ghost.style.width).toBe(`${DRAG_GHOST_SIZE}px`);
    expect(ghost.style.height).toBe(`${DRAG_GHOST_SIZE}px`);
    expect(ghost.style.transform).toBe("rotate(-4deg) scale(1.04)");
    expect(ghost.style.boxShadow).toContain("1.5px");
    expect(ghost.style.boxShadow).toContain("#30d158");
  });

  it("두 참여자가 같은 메모를 끌면 잔상이 둘 다 그려진다(AC-8)", () => {
    const other: PresenceParticipant = {
      clientId: 7,
      user: { name: "민지", color: "#ff9f0a" },
      dragging: { noteId: "d", x: 100, y: 100, rotation: 2 },
    };
    const { rerender } = render(<DragGhost participants={[dragging, other]} />);
    expect(screen.getByTestId("drag-ghost-22-d").style.left).toBe("860px");
    expect(screen.getByTestId("drag-ghost-7-d").style.left).toBe("100px");
    rerender(<DragGhost participants={[other]} />);
    expect(screen.queryByTestId("drag-ghost-22-d")).toBeNull();
    expect(screen.getByTestId("drag-ghost-7-d").style.left).toBe("100px");
  });
});
