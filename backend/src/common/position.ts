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
