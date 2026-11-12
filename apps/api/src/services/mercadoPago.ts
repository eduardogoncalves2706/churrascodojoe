import { createHmac, timingSafeEqual } from 'node:crypto';

// Chamada HTTP direta, sem SDK: a Orders API do Mercado Pago (que substituiu a Payments API) é
// recente e ainda em evolução — fetch dá controle total do payload exato, sem depender de quão
// atualizado o SDK oficial está em relação à documentação.
const ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET;
const BASE = 'https://api.mercadopago.com';

export class ErroPagamento extends Error { constructor(message: string, public status = 502) { super(message); } }

export interface PixCriado { orderId: string; qrCode: string; qrCodeBase64: string; ticketUrl: string | null; expiraEm: string }

/**
 * Cria uma order Pix (POST /v1/orders) pro pedido — expira em 30 min (mínimo aceito pela API).
 * `pedidoId` vai como external_reference, pra achar o pedido de volta quando o webhook chegar.
 * X-Idempotency-Key = pedidoId: reenviar a mesma criação (ex.: timeout + retry) não duplica a cobrança.
 */
export async function criarCobrancaPix(pedidoId: string, valorReais: number, emailPagador?: string): Promise<PixCriado> {
  if (!ACCESS_TOKEN) throw new ErroPagamento('Mercado Pago não configurado neste ambiente (falta MERCADOPAGO_ACCESS_TOKEN)', 501);
  const r = await fetch(`${BASE}/v1/orders`, {
    method: 'POST',
    headers: { authorization: `Bearer ${ACCESS_TOKEN}`, 'content-type': 'application/json', 'x-idempotency-key': pedidoId },
    body: JSON.stringify({
      type: 'online', total_amount: valorReais.toFixed(2), external_reference: pedidoId, processing_mode: 'automatic',
      transactions: { payments: [{ amount: valorReais.toFixed(2), payment_method: { id: 'pix', type: 'bank_transfer' }, expiration_time: 'PT30M' }] },
      payer: { email: emailPagador || 'pagador@example.com' },
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new ErroPagamento(data?.message ?? 'Erro ao criar cobrança Pix no Mercado Pago');
  const pagamento = data.transactions?.payments?.[0];
  return {
    orderId: data.id, qrCode: pagamento?.payment_method?.qr_code ?? '', qrCodeBase64: pagamento?.payment_method?.qr_code_base64 ?? '',
    ticketUrl: pagamento?.payment_method?.ticket_url ?? null, expiraEm: data.expiration_time ?? '',
  };
}

export interface OrderMercadoPago { id: string; status: string; status_detail?: string; external_reference?: string; total_amount: string }

/** Consulta os detalhes atuais da order — usado depois do webhook pra confirmar o status antes de creditar. */
export async function buscarOrder(orderId: string): Promise<OrderMercadoPago> {
  if (!ACCESS_TOKEN) throw new ErroPagamento('Mercado Pago não configurado neste ambiente (falta MERCADOPAGO_ACCESS_TOKEN)', 501);
  const r = await fetch(`${BASE}/v1/orders/${orderId}`, { headers: { authorization: `Bearer ${ACCESS_TOKEN}` } });
  const data = await r.json();
  if (!r.ok) throw new ErroPagamento(data?.message ?? 'Erro ao consultar pagamento no Mercado Pago');
  return data as OrderMercadoPago;
}

/**
 * Valida a assinatura do webhook (HMAC-SHA256) — nunca credita um pagamento a partir de uma
 * notificação sem verificar isso primeiro, senão qualquer um podia forjar "pagamento aprovado".
 * Formato oficial: header `x-signature: ts=<epoch-ms>,v1=<hmac-hex>`, manifest
 * `id:{dataId};request-id:{x-request-id};ts:{ts};` assinado com o segredo do painel.
 */
export function verificarAssinaturaWebhook(xSignature: string | undefined, xRequestId: string | undefined, dataId: string): boolean {
  if (!WEBHOOK_SECRET || !xSignature || !xRequestId || !dataId) return false;
  const partes = Object.fromEntries(xSignature.split(',').map((p) => p.trim().split('=').map((s) => s.trim())));
  const { ts, v1 } = partes;
  if (!ts || !v1) return false;
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const esperado = createHmac('sha256', WEBHOOK_SECRET).update(manifest).digest('hex');
  // timingSafeEqual exige buffers do mesmo tamanho — v1 forjado com tamanho diferente não deve explodir, só falhar.
  if (esperado.length !== v1.length) return false;
  return timingSafeEqual(Buffer.from(esperado), Buffer.from(v1));
}
