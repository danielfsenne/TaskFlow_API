/**
 * Ordenação por posição fracionária: mover um item só altera a posição dele,
 * calculada entre os vizinhos. Quando o espaço entre dois vizinhos fica pequeno
 * demais para a precisão do float, a lista precisa ser renumerada.
 */
export const POSITION_STEP = 1000;
const MIN_GAP = 1e-6;

/** Posição entre `prev` e `next` (null = início ou fim da lista). */
export function positionBetween(
  prev: number | null,
  next: number | null,
): number {
  if (prev === null && next === null) return POSITION_STEP;
  if (prev === null) return next! / 2;
  if (next === null) return prev + POSITION_STEP;
  return (prev + next) / 2;
}

/** true se a posição calculada já não cabe com folga entre os vizinhos. */
export function needsRebalance(
  prev: number | null,
  next: number | null,
): boolean {
  const low = prev ?? 0;
  if (next === null) return false;
  return next - low < MIN_GAP;
}

/** Posições igualmente espaçadas para `count` itens: 1000, 2000, ... */
export function evenPositions(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * POSITION_STEP);
}

export interface Positioned {
  id: string;
  position: number;
}

/** Resultado de um movimento: só a nova posição, ou a lista inteira renumerada. */
export type MovePlan =
  | { kind: 'single'; position: number }
  | { kind: 'rebalance'; updates: Positioned[] };

/** Todas as posições que o movimento altera (para avisar os clientes). */
export function changedPositions(plan: MovePlan, movingId: string) {
  return plan.kind === 'single'
    ? [{ id: movingId, position: plan.position }]
    : plan.updates;
}

/**
 * Planeja colocar `movingId` logo depois de `afterId` (null = início) numa
 * lista que não contém o item movido, ordenada por posição.
 * Retorna null se `afterId` não estiver na lista.
 */
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
