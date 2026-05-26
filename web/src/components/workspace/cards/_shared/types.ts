import type { Card } from "@/state/workspace";

export type CardContentProps = {
  card: Card;
  editing: boolean;
  onChange: (content: string) => void;
  onCommitEdit: () => void;
};
