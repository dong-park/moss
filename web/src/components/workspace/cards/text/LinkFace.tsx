"use client";

import { useT } from "@/i18n/Provider";
import type { MemoFace } from "@/state/memoFace";
import { retryLinkPreview, useLinkPreviewStatus } from "../../linkMemo";

export function LinkFace({ cardId, face }: { cardId: string; face: Extract<MemoFace, { t: "link" }> }) {
  const t = useT();
  const preview = useLinkPreviewStatus((s) => s.byCard[cardId]);
  const status = preview?.url === face.url ? preview.status : null;
  return (
    <div className="moss-card-face" data-memo-face="link">
      <div className="card face link">
        <small><span className="fav" style={{ background: "#6a6c72" }}>{face.site[0]?.toUpperCase()}</span>{face.site}</small>
        <p>{face.title}</p>
        {status === "loading" && <small role="status">{t("reviewGuidance.link.loading")}</small>}
        {status === "failed" && <div onKeyDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <small role="status">{t("reviewGuidance.link.failed")}</small>
          <button type="button" className="min-h-8 rounded px-2 text-xs underline" onClick={() => retryLinkPreview(cardId)}>{t("reviewGuidance.link.retry")}</button>
        </div>}
      </div>
    </div>
  );
}
