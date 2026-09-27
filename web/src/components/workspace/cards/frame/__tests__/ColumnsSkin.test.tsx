import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace, type Card } from "@/state/workspace";
import {
  decodeFrameConfig,
  encodeFrameContent,
  type FrameColumn,
} from "@/state/frameContent";
import { ColumnsSkin } from "@/components/workspace/cards/frame/skins/ColumnsSkin";

const COLUMNS: FrameColumn[] = [
  { id: "c0", name: "씨앗" },
  { id: "c1", name: "자라는 중" },
  { id: "c2", name: "묵힘" },
];

function seed(columns: FrameColumn[]) {
  const frame: Card = {
    id: "f1",
    kind: "frame",
    x: 0,
    y: 0,
    width: 960,
    height: 220,
    content: encodeFrameContent({ name: "판", skin: "columns", columns }),
  };
  useWorkspace.setState({ cards: [frame], selectedIds: [], editingId: null });
}

function wrap(ui: ReactNode) {
  return render(<I18nProvider locale="ko">{ui}</I18nProvider>);
}

const config = () =>
  decodeFrameConfig(useWorkspace.getState().cards.find((c) => c.id === "f1")!.content);

beforeEach(() => seed(COLUMNS));

describe("ColumnsSkin 경계·머리 (AC-5·AC-6·AC-8)", () => {
  it("AC-5: 칸 N개면 경계선이 N−1개다", () => {
    const { container } = wrap(<ColumnsSkin frameId="f1" columns={COLUMNS} />);
    expect(
      container.querySelectorAll('[data-frame-column-boundary="true"]'),
    ).toHaveLength(2);
  });

  it("AC-6: 칸이 8개 미만이면 '+'가 보이고 8개면 안 보인다", () => {
    const { container, unmount } = wrap(
      <ColumnsSkin frameId="f1" columns={COLUMNS} />,
    );
    expect(container.querySelector('[data-frame-column-add="true"]')).toBeTruthy();
    unmount();

    const many = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, name: `${i}` }));
    seed(many);
    const { container: c2 } = wrap(<ColumnsSkin frameId="f1" columns={many} />);
    expect(c2.querySelector('[data-frame-column-add="true"]')).toBeNull();
  });

  it("AC-8: 칸이 2개보다 많을 때만 지우기가 보인다", () => {
    const { container, unmount } = wrap(
      <ColumnsSkin frameId="f1" columns={COLUMNS} />,
    );
    expect(
      container.querySelectorAll('[data-frame-column-remove="true"]'),
    ).toHaveLength(3);
    unmount();

    const two = COLUMNS.slice(0, 2);
    seed(two);
    const { container: c2 } = wrap(<ColumnsSkin frameId="f1" columns={two} />);
    expect(c2.querySelectorAll('[data-frame-column-remove="true"]')).toHaveLength(0);
  });

  it("AC-7: 이름표를 두 번 눌러 Enter로 저장한다", () => {
    wrap(<ColumnsSkin frameId="f1" columns={COLUMNS} />);
    fireEvent.doubleClick(screen.getAllByText("씨앗")[0]);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  아이디어  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(config().columns[0].name).toBe("아이디어");
  });

  it("AC-7: Esc는 이름을 바꾸지 않는다", () => {
    wrap(<ColumnsSkin frameId="f1" columns={COLUMNS} />);
    fireEvent.doubleClick(screen.getAllByText("씨앗")[0]);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "버려질 이름" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(config().columns[0].name).toBe("씨앗");
  });

  it("AC-7: 빈 이름은 흐린 '이름 없는 칸'으로 보인다", () => {
    const withEmpty = [{ id: "c0", name: "" }, COLUMNS[1]];
    seed(withEmpty);
    wrap(<ColumnsSkin frameId="f1" columns={withEmpty} />);
    expect(screen.getByText("이름 없는 칸")).toBeTruthy();
  });

  it("AC-6: '+'를 누르면 칸이 오른쪽 끝에 하나 늘어난다", () => {
    const { container } = wrap(<ColumnsSkin frameId="f1" columns={COLUMNS} />);
    fireEvent.click(container.querySelector('[data-frame-column-add="true"]')!);
    expect(config().columns).toHaveLength(4);
    expect(config().columns[3].name).toBe("");
  });

  it("AC-8: 지우기를 누르면 가운데 칸이 사라진다", () => {
    const { container } = wrap(<ColumnsSkin frameId="f1" columns={COLUMNS} />);
    fireEvent.click(container.querySelectorAll('[data-frame-column-remove="true"]')[1]);
    expect(config().columns.map((c) => c.name)).toEqual(["씨앗", "묵힘"]);
  });
});
