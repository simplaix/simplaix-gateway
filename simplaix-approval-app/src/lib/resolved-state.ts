type ResolvedState = { id: string; action: 'approved' | 'rejected' } | null;

let resolvedConfirmation: ResolvedState = null;

export function setResolvedConfirmation(state: ResolvedState) {
  resolvedConfirmation = state;
}

export function consumeResolvedConfirmation(): ResolvedState {
  const state = resolvedConfirmation;
  resolvedConfirmation = null;
  return state;
}
