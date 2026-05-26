export interface KeywordItem {
  token: string;
  count: number;
}

export type SignalsState =
  | { status: "opt-out" }
  | { status: "empty"; total: number }
  | { status: "ready"; total: number; keywords: KeywordItem[]; rhythm: number[] };
