"use client";

import { useState } from "react";
import { useT } from "@/i18n/Provider";
import { isUrlOnly } from "@/state/cardContent";
import { useShare } from "@/state/share/store";
import { useWorkspace } from "@/state/workspace";
import { loadLinkPreview } from "../../linkMemo";

/**
 * 링크 앞면의 "미리보기 가져오기" (local-promise D1) — 공유하지 않은 벽의 주소는 이 버튼을 누를 때만
 * moss 서버를 거친다. 공유 중인 벽은 저절로 가져오므로 보이지 않는다. 제목이 이미 있으면 보이지 않는다.
 */
export function LinkPreviewAction({ cardId, url, title }: { cardId: string; url: string; title: string }) {
  const t = useT();
  const boardId = useWorkspace((s) => s.currentBoardId);
  const shared = useShare((s) => s.byBoard[boardId]?.status === "shared");
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");

  // 제목이 없으면 memoFace가 주소를 제목으로 돌려준다. mailto 등은 미리보기 대상이 아니다.
  if (shared || title !== url || !isUrlOnly(url)) return null;

  return (
    <div className="preview-act">
      <button
        type="button"
        data-link-input
        disabled={state === "busy"}
        onClick={(e) => {
          e.stopPropagation();
          setState("busy");
          void loadLinkPreview(cardId).then((ok) => setState(ok ? "idle" : "failed"));
        }}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {state === "busy" ? t("workspace.tool.linkPreviewBusy") : t("workspace.tool.linkPreview")}
      </button>
      <small>{t("workspace.tool.linkPreviewNote")}</small>
      {state === "failed" && <small role="alert">{t("workspace.tool.linkPreviewFailed")}</small>}
    </div>
  );
}
