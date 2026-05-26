/**
 * 카드 컴포넌트 테스트 헬퍼.
 *
 * 사용:
 *   const { onChange, onCommit, rerender, ... } = renderCard("checklist", "initial content");
 *   // 또는 옵션과 함께:
 *   renderCard("text", { content: "", editing: false });
 *
 * 카드 종류만 다르고 boilerplate는 동일하므로 후속 워커가 자기 카드 테스트에서 그대로 차용.
 */
import { render } from "@testing-library/react";
import { vi, type Mock } from "vitest";
import { I18nProvider } from "@/i18n/Provider";
import { CardContent } from "@/components/workspace/cards/CardContent";
import type { Card } from "@/state/workspace";

export type OnChangeMock = Mock<(content: string) => void>;
export type OnCommitMock = Mock<() => void>;

export type RenderCardOptions = {
  content?: string;
  editing?: boolean;
  /** Card 기본값 위로 override할 필드 (id/kind/x/y/width/content 외 author 등). */
  card?: Partial<Card>;
  /** custom onChange / onCommit (없으면 vi.fn()). */
  onChange?: OnChangeMock;
  onCommit?: OnCommitMock;
};

function makeCard(kind: Card["kind"], content: string, override?: Partial<Card>): Card {
  return {
    id: "c1",
    kind,
    x: 0,
    y: 0,
    width: 300,
    content,
    ...override,
  } as Card;
}

/**
 * 카드 한 장을 I18nProvider로 감싸 렌더.
 * 두 번째 인자가 string이면 content로 해석, 객체면 옵션으로 해석.
 */
export function renderCard(
  kind: Card["kind"],
  contentOrOptions: string | RenderCardOptions = "",
) {
  const opts: RenderCardOptions =
    typeof contentOrOptions === "string"
      ? { content: contentOrOptions }
      : contentOrOptions;

  const onChange: OnChangeMock = opts.onChange ?? vi.fn<(content: string) => void>();
  const onCommit: OnCommitMock = opts.onCommit ?? vi.fn<() => void>();
  const editing = opts.editing ?? true;
  const card = makeCard(kind, opts.content ?? "", opts.card);

  const ui = render(
    <I18nProvider locale="ko">
      <CardContent
        card={card}
        editing={editing}
        onChange={onChange}
        onCommitEdit={onCommit}
      />
    </I18nProvider>,
  );

  /**
   * rerenderWith(nextContent) — onChange.mock.calls[0][0] 같은 새 content로 재렌더.
   * 카드/editing은 직전 호출과 동일하게 유지. 테스트에서 "입력 → 카드 컨텐츠 반영" 검증에 사용.
   */
  const rerenderWith = (
    next: string | RenderCardOptions,
  ) => {
    const nextOpts: RenderCardOptions =
      typeof next === "string" ? { content: next } : next;
    const nextCard = makeCard(kind, nextOpts.content ?? card.content, {
      ...opts.card,
      ...nextOpts.card,
    });
    ui.rerender(
      <I18nProvider locale="ko">
        <CardContent
          card={nextCard}
          editing={nextOpts.editing ?? editing}
          onChange={nextOpts.onChange ?? onChange}
          onCommitEdit={nextOpts.onCommit ?? onCommit}
        />
      </I18nProvider>,
    );
  };

  return { onChange, onCommit, rerenderWith, ...ui };
}
