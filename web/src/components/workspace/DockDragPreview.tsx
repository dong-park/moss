"use client";

import {
  aspectForKind,
  CARD_MAX_HEIGHT,
  CARD_MIN_HEIGHT,
  kindForTool,
  useWorkspace,
  widthForKind,
  PHOTO_DEFAULT_WIDTH,
  FRAME_DEFAULT_HEIGHT,
  FRAME_DEFAULT_WIDTH,
} from "@/state/workspace";
import { useT } from "@/i18n/Provider";

/**
 * FEAT-sticky-redesign n8: 독(Dock) 도구를 끄는 동안 커서를 따라다니는 카드 프리뷰.
 * (구 SidebarDragPreview — 사이드바가 걷히고 독으로 이관되며 이름을 바꿨다.)
 * Dock의 onMouseDown이 setDockDrag로 좌표를 갱신하면 본 컴포넌트가 즉시 따라간다.
 * 표면은 실제 카드 surface와 동일한 PNG(`/cards/v2/{kind}.png`)를 사용 — drop 후 생성되는
 * 카드와 같은 비주얼이라 "그걸로 만들어지는 컴포넌트가 마우스 끝에 달려있다"는 의도와 일치.
 *
 * 2단계 리뷰 P2: 메모판(frame)은 `/cards/v2/frame.png`가 없다(틀 렌더). 드래그
 * 프리뷰는 그 대신 독 아이콘(`/icons/dock/memoboard.png`)을 쓴다 — 빈 상자 대신
 * 무엇이 만들어지는지 알아볼 수 있게. 파일함(board)은 2026-09-23 마닐라 폴더 개선으로
 * `/cards/v2/board.png`(닫힌 폴더)가 생겨 이제 그 사진을 그대로 쓴다.
 */
/**
 * 2026-09-22: 프리뷰를 "놓으면 생길 카드 그 자체"로 맞췄다. 예전에는 카드 폭의
 * 55%짜리 그림을 커서 오른쪽 아래 14px에 달아두고, 정작 카드는 커서를 가로
 * 중심으로 삼아 생겼다 — 손을 떼는 순간 카드가 왼쪽 위로 튀었다. 이제 프리뷰의
 * 좌표·크기는 Dock.tsx `tryDrop`의 계산과 같은 식을 쓴다:
 *   카드 왼쪽 위 = (커서x − 폭/2, 커서y − 20) 월드 좌표.
 * 캔버스 배율도 곱해 줌 상태에서도 놓일 크기 그대로 보인다.
 */
/** tryDrop의 `wy = ... - 20`과 같은 값이어야 한다. 바꿀 때 함께 바꾼다. */
const DROP_TOP_OFFSET = 20;


/** 집어 든 종이 느낌 — 아래 PNG 프리뷰와 같은 값. */
const LIFT = {
  transform: "rotate(-2deg) scale(1.02)",
  filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.18)) drop-shadow(0 2px 4px rgba(0,0,0,0.12))",
  opacity: 0.92,
} as const;

export function DockDragPreview() {
  const drag = useWorkspace((s) => s.dockDrag);
  const scale = useWorkspace((s) => s.viewport.scale);
  const t = useT();
  if (!drag) return null;

  /*
   * spec/card-faces.md: 흰 카드로 그려지는 것들은 PNG 대신 놓으면 생길 빈 카드 모양을 그대로 띄운다.
   * 월드 크기로 그리고 배율만큼 줄인다 — 왼쪽 위는 tryDrop과 같은 (커서x − 폭/2, 커서y − 20).
   */
  const isTextbox = kindForTool(drag.toolId) === "textbox";
  const isFrame = kindForTool(drag.toolId) === "frame";
  if (drag.face || isTextbox || isFrame) {
    const w = drag.face === "photo" ? PHOTO_DEFAULT_WIDTH : widthForKind(kindForTool(drag.toolId));
    const body = isFrame ? (
      // 메모판 Content와 같은 9-slice 화이트보드 — 놓으면 생길 빈 판 그대로.
      <div
        style={{
          width: FRAME_DEFAULT_WIDTH,
          height: FRAME_DEFAULT_HEIGHT,
          boxSizing: "border-box",
          borderStyle: "solid",
          borderWidth: 18,
          borderImage: 'url("/cards/v2/whiteboard.png") 50 fill / 18px stretch',
        }}
      />
    ) : drag.face === "photo" ? (
        <div
          className="flex items-center justify-center rounded-[6px] border border-dashed border-border bg-panel"
          style={{ width: w, height: w }}
        >
          <span className="rounded-full border border-border bg-bg px-3 py-1.5 text-xs text-text-soft">
            {t("cards.photo.pick")}
          </span>
        </div>
      ) : (
        <div className="moss-card-face" style={{ width: isTextbox ? undefined : w }}>
          {drag.face === "todo" ? (
            <div className="card face check">
              <b className="text-text-muted">{t("workspace.todo.titlePlaceholder")}</b>
              <ul className="m-0 list-none p-0">
                <li className="text-text-muted">{t("workspace.todo.itemPlaceholder")}</li>
              </ul>
            </div>
          ) : drag.face === "link" ? (
            <div className="card face link">
              <small>
                <span className="fav" style={{ background: "#c9c5bc" }} />
                {t("workspace.tool.link")}
              </small>
              <p className="text-text-muted">{t("workspace.tool.linkPlaceholder")}</p>
            </div>
          ) : (
            <div className="card hand whitespace-nowrap">
              <p>{t("workspace.tool.textbox")}</p>
            </div>
          )}
        </div>
      );
    return (
      <div
        aria-hidden
        className="pointer-events-none fixed z-[var(--z-toast)]"
        style={{
          left: drag.screenX - (w / 2) * scale,
          top: drag.screenY - DROP_TOP_OFFSET * scale,
          transform: `scale(${scale}) ${LIFT.transform}`,
          transformOrigin: "top left",
          filter: LIFT.filter,
          opacity: LIFT.opacity,
        }}
      >
        {body}
      </div>
    );
  }

  const kind = kindForTool(drag.toolId);
  const baseW = widthForKind(kind);
  const baseH = Math.min(
    CARD_MAX_HEIGHT,
    Math.max(CARD_MIN_HEIGHT, baseW / aspectForKind(kind)),
  );
  const width = baseW * scale;
  const height = baseH * scale;
  const imageSrc = `/cards/v2/${kind}.png`;
  const backgroundSize = "contain";

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[var(--z-toast)]"
      style={{
        left: drag.screenX - width / 2,
        top: drag.screenY - DROP_TOP_OFFSET * scale,
        width,
        height,
        background: `url("${imageSrc}") center/${backgroundSize} no-repeat`,
        // 살짝 기울이고 키워 "집어 든 종이"처럼 보이게 한다. 놓으면 카드가 제자리에
        // 반듯이 앉는다 — 위치는 이미 같으므로 기울기만 펴진다.
        transform: "rotate(-2deg) scale(1.02)",
        transformOrigin: "center",
        filter:
          "drop-shadow(0 10px 18px rgba(0,0,0,0.18)) drop-shadow(0 2px 4px rgba(0,0,0,0.12))",
        opacity: 0.92,
      }}
    />
  );
}
