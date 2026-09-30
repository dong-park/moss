import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RemoteSelection } from "@/components/presence/RemoteSelection";
import type { PresenceParticipant } from "@/state/presence/types";

const selecting: PresenceParticipant = {
  clientId: 11,
  user: { name: "민지", color: "#ff9f0a" },
  selection: [
    { noteId: "b", x: 490, y: 230, width: 210, height: 210, rotation: 0.8 },
    { noteId: "d", x: 490, y: 470, width: 210, height: 210, rotation: -0.6 },
  ],
};

describe("RemoteSelection", () => {
  it("선택이 없으면 아무것도 렌더하지 않는다", () => {
    const { container } = render(
      <RemoteSelection
        participants={[{ clientId: 1, user: { name: "동환", color: "#5e5ce6" } }]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("선택된 카드마다 1.5px 참여자 색 테두리를 그린다", () => {
    render(<RemoteSelection participants={[selecting]} />);
    const first = screen.getByTestId("remote-selection-11-b");
    expect(first.style.boxShadow).toContain("1.5px");
    expect(first.style.boxShadow).toContain("#ff9f0a");
    expect(first.style.left).toBe("490px");
    expect(first.style.width).toBe("210px");
    expect(first.style.transform).toBe("rotate(0.8deg)");

    expect(screen.getByTestId("remote-selection-11-d")).toBeTruthy();
  });
});
