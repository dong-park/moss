import type { NoteKind } from "@/state/db/schema";
import type { Translator } from "@/i18n";

export type TemplateId = "free" | "mindmap" | "project" | "research" | "diary";

export interface TemplateInitialCard {
  kind: NoteKind;
  x: number;
  y: number;
  width: number;
  content: string;
  placeholderContent?: boolean;
}

export interface Template {
  id: TemplateId;
  nameKey: string;
  descriptionKey: string;
  buildInitialCards: (t: Translator, now?: Date) => TemplateInitialCard[];
}

/**
 * FEAT-templates spec §1: 빈 캔버스 외 4개 시작점을 제시. 정답이 아니라 흐름 제안.
 * 좌표는 새 보드의 viewport 원점(0,0) 근방에서 자연스럽게 보이게 배치.
 */
export const TEMPLATES: readonly Template[] = [
  {
    id: "free",
    nameKey: "templates.free.name",
    descriptionKey: "templates.free.description",
    buildInitialCards: () => [],
  },
  {
    id: "mindmap",
    nameKey: "templates.mindmap.name",
    descriptionKey: "templates.mindmap.description",
    buildInitialCards: (t) => [
      {
        kind: "mindmap",
        x: 360,
        y: 260,
        width: 320,
        content: t("templates.mindmap.cards.root"),
        placeholderContent: true,
      },
    ],
  },
  {
    id: "project",
    nameKey: "templates.project.name",
    descriptionKey: "templates.project.description",
    buildInitialCards: (t) => [
      { kind: "text", x: 180, y: 120, width: 260, content: t("templates.project.cards.ideas") },
      { kind: "text", x: 540, y: 120, width: 260, content: t("templates.project.cards.execute") },
      {
        kind: "text",
        x: 180,
        y: 240,
        width: 260,
        content: t("templates.project.cards.ideaHint"),
        placeholderContent: true,
      },
      {
        kind: "text",
        x: 540,
        y: 240,
        width: 260,
        content: t("templates.project.cards.executeHint"),
        placeholderContent: true,
      },
    ],
  },
  {
    id: "research",
    nameKey: "templates.research.name",
    descriptionKey: "templates.research.description",
    buildInitialCards: (t) => [
      { kind: "text", x: 280, y: 100, width: 280, content: t("templates.research.cards.collect") },
      {
        kind: "text",
        x: 280,
        y: 380,
        width: 280,
        content: t("templates.research.cards.insight"),
      },
    ],
  },
  {
    id: "diary",
    nameKey: "templates.diary.name",
    descriptionKey: "templates.diary.description",
    buildInitialCards: (t, now = new Date()) => {
      const dateText = t("templates.diary.cards.dateFormat", {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate(),
      });
      return [
        { kind: "text", x: 300, y: 140, width: 280, content: dateText },
        {
          kind: "text",
          x: 300,
          y: 280,
          width: 280,
          content: t("templates.diary.cards.feelingSlot"),
          placeholderContent: true,
        },
      ];
    },
  },
];

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((tpl) => tpl.id === id);
}

export function isTemplateId(id: string): id is TemplateId {
  return TEMPLATES.some((tpl) => tpl.id === id);
}
