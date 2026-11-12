import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verificarAssinaturaWebhook } from './mercadoPago';

const SECRET = 'segredo-de-teste';

function assinar(dataId: string, requestId: string, ts: string) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  return createHmac('sha256', SECRET).update(manifest).digest('hex');
}

describe('verificarAssinaturaWebhook', () => {
  it('aceita assinatura calculada corretamente', () => {
    const dataId = 'ORD123'; const requestId = 'req-abc'; const ts = '1700000000000';
    const v1 = assinar(dataId, requestId, ts);
    expect(verificarAssinaturaWebhook(`ts=${ts},v1=${v1}`, requestId, dataId, SECRET)).toBe(true);
  });

  it('rejeita hash forjado (secret errado)', () => {
    const dataId = 'ORD123'; const requestId = 'req-abc'; const ts = '1700000000000';
    const v1Errado = createHmac('sha256', 'secret-errado').update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex');
    expect(verificarAssinaturaWebhook(`ts=${ts},v1=${v1Errado}`, requestId, dataId, SECRET)).toBe(false);
  });

  it('rejeita se o request-id não bate com o usado na assinatura', () => {
    const dataId = 'ORD123'; const ts = '1700000000000';
    const v1 = assinar(dataId, 'req-original', ts);
    expect(verificarAssinaturaWebhook(`ts=${ts},v1=${v1}`, 'req-trocado', dataId, SECRET)).toBe(false);
  });

  it('rejeita hash de tamanho diferente sem lançar exceção (timingSafeEqual exige mesmo tamanho)', () => {
    expect(() => verificarAssinaturaWebhook('ts=123,v1=curto', 'req', 'ORD123', SECRET)).not.toThrow();
    expect(verificarAssinaturaWebhook('ts=123,v1=curto', 'req', 'ORD123', SECRET)).toBe(false);
  });

  it('rejeita quando falta header, dataId ou secret', () => {
    expect(verificarAssinaturaWebhook(undefined, 'req', 'ORD123', SECRET)).toBe(false);
    expect(verificarAssinaturaWebhook('ts=123,v1=abc', undefined, 'ORD123', SECRET)).toBe(false);
    expect(verificarAssinaturaWebhook('ts=123,v1=abc', 'req', '', SECRET)).toBe(false);
    const dataId = 'ORD123'; const requestId = 'req-abc'; const ts = '1700000000000';
    const v1 = assinar(dataId, requestId, ts);
    expect(verificarAssinaturaWebhook(`ts=${ts},v1=${v1}`, requestId, dataId, '')).toBe(false);
    expect(verificarAssinaturaWebhook(`ts=${ts},v1=${v1}`, requestId, dataId, null)).toBe(false);
  });
});
