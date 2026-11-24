import { describe, it, expect } from 'vitest';
import { samePost } from '../../supabase/functions/_shared/network.ts';

const post = 'Em dois anos reduzimos as perdas de água da nossa rede de 18 para 11 por cento. A maior alavanca não foram os sensores novos.';

describe('samePost', () => {
  it('recognizes the same post read from two pages (spacing, case, emoji and punctuation differ)', () => {
    expect(samePost(post, '  EM DOIS ANOS reduzimos as perdas de água 🚀 da nossa rede, de 18 para 11 por cento…')).toBe(true);
  });

  it('recognizes a reading that was cut short by the search page', () => {
    expect(samePost(post, 'Em dois anos reduzimos as perdas de água da nossa …more')).toBe(false);
    expect(samePost(post, 'Em dois anos reduzimos as perdas de água da nossa rede')).toBe(true);
  });

  it('tells two posts by the same author apart', () => {
    expect(samePost(post, 'Em dois anos reduzimos o consumo de energia das elevatórias em 12 por cento, e o que pesou foi a operação.')).toBe(false);
  });

  it('does not match on too little text', () => {
    expect(samePost('Bom dia a todos', 'Bom dia a todos')).toBe(false);
    expect(samePost('', post)).toBe(false);
    expect(samePost(null, undefined)).toBe(false);
  });

  it('works for scripts without spaces', () => {
    const ja = 'この2年間で、当社の配水網の漏水率を18%から11%に下げました。最大の要因は新しいセンサーではなく、現場チームです。';
    expect(samePost(ja, ja + ' 続きを読む')).toBe(true);
  });
});
