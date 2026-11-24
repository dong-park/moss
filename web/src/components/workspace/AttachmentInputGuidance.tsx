"use client";

import { useT } from "@/i18n/Provider";
import { IMAGE_FORMAT_LABELS, MAX_ATTACHMENT_BYTES, MAX_DROP_FILES, MAX_IMAGE_BYTES } from "@/state/attachmentLimits";

/** Shared copy for actual file entry points. Limits come from validation's source. */
export function AttachmentInputGuidance({ kind, id, includeDrop = false, location }: {
  kind: "photo" | "image" | "attachment";
  id?: string;
  includeDrop?: boolean;
  location?: "photo" | "memo" | "toolbar";
}) {
  const t = useT();
  const image = kind !== "attachment";
  return <div id={id} className="space-y-1 text-xs text-text-soft" data-attachment-guidance={kind}>
    <p>{t(`reviewGuidance.attachment.${image ? "image" : "file"}`, { formats: IMAGE_FORMAT_LABELS, mb: (image ? MAX_IMAGE_BYTES : MAX_ATTACHMENT_BYTES) / (1024 * 1024) })}</p>
    <p>{t(`reviewGuidance.attachment.${location ?? (kind === "photo" ? "photo" : "memo")}Location`)}</p>
    <p>{t("reviewGuidance.attachment.location")}</p>
    {includeDrop && <p>{t("reviewGuidance.attachment.drop", { count: MAX_DROP_FILES })}</p>}
  </div>;
}
