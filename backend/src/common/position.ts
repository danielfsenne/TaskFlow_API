export const POSITION_STEP = 1000;
const MIN_GAP = 1e-6;

export function positionBetween(
  prev: number | null,
  next: number | null,
): number {
  if (prev === null && next === null) return POSITION_STEP;
  if (prev === null) return next! / 2;
  if (next === null) return prev + POSITION_STEP;
  return (prev + next) / 2;
}

export function needsRebalance(
  prev: number | null,
  next: number | null,
): boolean {
  const low = prev ?? 0;
  if (next === null) return false;
  return next - low < MIN_GAP;
}

export function evenPositions(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * POSITION_STEP);
}

export interface Positioned {
  id: string;
  position: number;
}

export type MovePlan =
  | { kind: 'single'; position: number }
  | { kind: 'rebalance'; updates: Positioned[] };

export function changedPositions(plan: MovePlan, movingId: string) {
  return plan.kind === 'single'
    ? [{ id: movingId, position: plan.position }]
    : plan.updates;
}

export function planMove(
  others: Positioned[],
  afterId: string | null,
  movingId: string,
): MovePlan | null {
  let index = 0;
  if (afterId !== null) {
    const afterIndex = others.findIndex((o) => o.id === afterId);
    if (afterIndex === -1) return null;
    index = afterIndex + 1;
  }

  const prev = others[index - 1]?.position ?? null;
  const next = others[index]?.position ?? null;
  if (!needsRebalance(prev, next)) {
    return { kind: 'single', position: positionBetween(prev, next) };
  }

  const ordered = others.map((o) => o.id);
  ordered.splice(index, 0, movingId);
  const positions = evenPositions(ordered.length);
  return {
    kind: 'rebalance',
    updates: ordered.map((id, i) => ({ id, position: positions[i] })),
  };
}
