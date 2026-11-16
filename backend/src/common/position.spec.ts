import { evenPositions, needsRebalance, positionBetween } from './position';

describe('position', () => {
  it('lista vazia começa no passo padrão', () => {
    expect(positionBetween(null, null)).toBe(1000);
  });

  it('no início fica entre 0 e o primeiro', () => {
    expect(positionBetween(null, 1000)).toBe(500);
  });

  it('no fim soma um passo ao último', () => {
    expect(positionBetween(3000, null)).toBe(4000);
  });

  it('no meio fica no ponto médio', () => {
    expect(positionBetween(1000, 2000)).toBe(1500);
  });

  it('pede renumeração quando os vizinhos estão colados', () => {
    expect(needsRebalance(1, 1 + 1e-7)).toBe(true);
    expect(needsRebalance(null, 1e-7)).toBe(true);
    expect(needsRebalance(1000, 2000)).toBe(false);
    expect(needsRebalance(1000, null)).toBe(false);
  });

  it('gera posições igualmente espaçadas', () => {
    expect(evenPositions(3)).toEqual([1000, 2000, 3000]);
  });
});
