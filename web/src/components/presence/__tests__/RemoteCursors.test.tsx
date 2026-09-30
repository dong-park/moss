import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RemoteCursors } from "@/components/presence/RemoteCursors";
import type { PresenceParticipant } from "@/state/presence/types";

const minji: PresenceParticipant = {
  clientId: 11,
  user: { name: "민지", color: "#ff9f0a" },
  cursor: { x: 640, y: 300 },
};
const yujin: PresenceParticipant = {
  clientId: 22,
  user: { name: "유진", color: "#30d158" },
  cursor: { x: 1010, y: 560 },
};
const offline: PresenceParticipant = {
  clientId: 33,
  user: { name: "동환", color: "#5e5ce6" },
};

describe("RemoteCursors", () => {
  it("커서가 없으면 아무것도 렌더하지 않는다", () => {
    const { container } = render(<RemoteCursors participants={[offline]} />);
    expect(container.firstChild).toBeNull();
  });

  it("커서·이름표를 참여자 색으로 그린다", () => {
    render(<RemoteCursors participants={[minji, yujin]} />);
    expect(screen.getByTestId("remote-name-11").textContent).toBe("민지");
    expect(screen.getByTestId("remote-name-22").textContent).toBe("유진");

    const cursor = screen.getByTestId("remote-cursor-11");
    expect(cursor.style.left).toBe("640px");
    expect(cursor.style.top).toBe("300px");
    expect(cursor.querySelector("path")?.getAttribute("fill")).toBe("#ff9f0a");
    expect(screen.getByTestId("remote-name-11").style.background).toBe(
      "rgb(255, 159, 10)",
    );
  });

  it("커서 없는 참여자는 건너뛴다", () => {
    render(<RemoteCursors participants={[offline, minji]} />);
    expect(screen.queryByTestId("remote-name-33")).toBeNull();
    expect(screen.getByTestId("remote-name-11")).toBeTruthy();
  });
});
