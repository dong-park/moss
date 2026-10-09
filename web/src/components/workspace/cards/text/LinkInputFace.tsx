"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/Provider";
import { fillLinkMemo } from "../../linkMemo";

/**
 * 빈 링크 카드 앞면 (spec/card-faces.md) — 도크 링크 버튼이 만든다. 카드 안 입력칸을 눌러
 * 주소를 넣고 Enter면 링크 앞면이 된다. http·https·mailto가 아니면 안내만 띄운다.
 * 주소 없이 나가도 카드는 남는다 — 빈 메모와 같다.
 */
export function LinkInputFace({ cardId, editing, onCommitEdit }: { cardId: string; editing: boolean; onCommitEdit: () => void }) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);

  // 도크에서 막 만든 카드는 편집 상태로 온다 — 바로 붙여넣게 포커스.
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  return (
    <div className="moss-card-face" data-memo-face="linkEmpty">
      <div className="card face link">
        <small>
          <span className="fav" style={{ background: "#c9c5bc" }} />
          {t("workspace.tool.link")}
        </small>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim() === "") return;
            if (fillLinkMemo(cardId, value)) onCommitEdit();
            else setInvalid(true);
          }}
        >
          <input
            ref={inputRef}
            data-link-input
            type="url"
            value={value}
            placeholder={t("workspace.tool.linkPlaceholder")}
            aria-label={t("workspace.tool.link")}
            aria-invalid={invalid || undefined}
            onChange={(e) => {
              setValue(e.target.value);
              setInvalid(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") e.currentTarget.blur();
            }}
            onBlur={() => {
              if (editing) onCommitEdit();
            }}
          />
        </form>
        {invalid && <small role="alert">{t("workspace.tool.linkInvalid")}</small>}
      </div>
    </div>
  );
}
