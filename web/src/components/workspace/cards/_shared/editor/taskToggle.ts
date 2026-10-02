import { Plugin } from "@milkdown/prose/state";
import { $prose } from "@milkdown/utils";

/** 체크박스가 그려지는 왼쪽 폭(px) — globals.css `.moss-md li[data-item-type="task"]` padding과 같다. */
export const TASK_BOX_HIT_WIDTH = 24;

/**
 * 체크리스트 항목 왼쪽 상자를 누르면 체크를 켜고 끈다. gfm 프리셋은 list_item에
 * checked 속성만 두고 클릭 토글은 주지 않는다. 상자 밖을 누르면 평소처럼 글을 고친다.
 */
export const taskTogglePlugin = $prose(
  () =>
    new Plugin({
      props: {
        handleClickOn(view, _pos, node, nodePos, event) {
          if (node.type.name !== "list_item" || node.attrs.checked == null) return false;
          if (!view.editable) return false;
          const dom = view.nodeDOM(nodePos);
          if (!(dom instanceof HTMLElement)) return false;
          if (event.clientX - dom.getBoundingClientRect().left > TASK_BOX_HIT_WIDTH) return false;
          view.dispatch(
            view.state.tr.setNodeMarkup(nodePos, undefined, { ...node.attrs, checked: !node.attrs.checked }),
          );
          return true;
        },
      },
    }),
);
