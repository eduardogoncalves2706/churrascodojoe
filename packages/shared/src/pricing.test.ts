import { describe, expect, it } from 'vitest';
import { custoProdutoCents, margem, custoComboCents, arredondarPreco, aplicarPercentual, formatQtd } from './index';

describe('custo e margem (números da planilha)', () => {
  it('espeto de picanha: R$50/kg, 0,9 espeto/kg', () => {
    const custo = custoProdutoCents([{ quantidadeInsumo: 1 / 0.9, custoInsumoCents: 5000 }]);
    expect(custo).toBe(5556);
    expect(margem(10990, custo).margemPct).toBeCloseTo(49.4, 1);
  });
  it('sem ficha técnica não inventa custo', () => {
    expect(custoProdutoCents([])).toBeNull();
    expect(margem(399, null).margemPct).toBeNull();
  });
  it('combo 1 costela custa ~R$63,74 e rende ~54%', () => {
    const itens = [
      { quantidade: 1, custoUnitCents: null, ehCarneEscolhida: true },
      { quantidade: 0.5, custoUnitCents: 1333, ehCarneEscolhida: false }, // coração
      { quantidade: 1, custoUnitCents: 500, ehCarneEscolhida: false }, // pão de alho un.
      { quantidade: 0.5, custoUnitCents: 3000, ehCarneEscolhida: false }, // salsichão
      { quantidade: 1, custoUnitCents: 185, ehCarneEscolhida: false }, // arroz 500g
      { quantidade: 1, custoUnitCents: 300, ehCarneEscolhida: false }, // maionese 300g
      { quantidade: 1, custoUnitCents: 1000, ehCarneEscolhida: false }, // coca
    ];
    const custo = custoComboCents(itens, 2222)!;
    expect(custo).toBeGreaterThan(6370);
    expect(custo).toBeLessThan(6380);
    expect(margem(13999, custo).margemPct).toBeCloseTo(54.5, 0);
  });
});

describe('reajuste', () => {
  it('arredonda para ,90 e ,99', () => {
    expect(arredondarPreco(10990, '99')).toBe(10999);
    expect(arredondarPreco(11000, '90')).toBe(11090);
    expect(arredondarPreco(8990, '90')).toBe(8990);
  });
  it('aplica percentual em centavos', () => {
    expect(aplicarPercentual(8990, 10)).toBe(9889);
  });
});

describe('formatQtd', () => {
  it('mostra meio como fração', () => {
    expect(formatQtd(0.5)).toBe('1/2');
    expect(formatQtd(1.5)).toBe('1 1/2');
    expect(formatQtd(1)).toBe('1');
    expect(formatQtd(2)).toBe('2');
  });
});
