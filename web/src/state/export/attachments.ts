import type { Note } from "../db/schema";
import { getBlob } from "../db/opfs";
import type { ExportProgress } from "./types";

export interface CollectedAttachments {
  attachments: Map<string, Blob>;
  missingAttachments: string[];
}

/** notes의 attachmentRef를 OPFS에서 읽는다. 없으면 missing에 누적(AC-10). */
export async function collectAttachments(
  notes: Note[],
  onProgress?: (p: ExportProgress) => void,
): Promise<CollectedAttachments> {
  const refs = [...new Set(notes.map((n) => n.attachmentRef).filter(Boolean))] as string[];
  const attachments = new Map<string, Blob>();
  const missingAttachments: string[] = [];

  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i]!;
    onProgress?.({ phase: "attachments", current: i + 1, total: refs.length });
    try {
      const blob = await getBlob(ref);
      if (blob) attachments.set(ref, blob);
      else missingAttachments.push(ref);
    } catch {
      missingAttachments.push(ref);
    }
  }

  return { attachments, missingAttachments };
}

/** opfs:filename → zip 내부 경로 */
export function attachmentZipPath(ref: string): string {
  const filename = ref.startsWith("opfs:") ? ref.slice("opfs:".length) : ref;
  return `attachments/${filename}`;
}
