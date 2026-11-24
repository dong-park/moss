import { create } from "zustand";

/**
 * remote-mcp D9: 다른 멤버가 있는 최상위 보드를 지우기 전에 묻는 확인 창의 상태.
 * `others`는 소유자 말고 멤버 수, null이면 서버에서 멤버를 확인하지 못했다.
 */
interface MemberDeleteConfirmState {
  pending: { others: number | null; resolve: (ok: boolean) => void } | null;
}

export const useMemberDeleteConfirm = create<MemberDeleteConfirmState>(() => ({ pending: null }));

/** 확인 창을 띄우고 답을 기다린다. 이미 떠 있던 질문은 거절로 닫는다. */
export function askMemberDelete(others: number | null): Promise<boolean> {
  return new Promise((resolve) => {
    useMemberDeleteConfirm.getState().pending?.resolve(false);
    useMemberDeleteConfirm.setState({ pending: { others, resolve } });
  });
}

export function answerMemberDelete(ok: boolean): void {
  const pending = useMemberDeleteConfirm.getState().pending;
  useMemberDeleteConfirm.setState({ pending: null });
  pending?.resolve(ok);
}
