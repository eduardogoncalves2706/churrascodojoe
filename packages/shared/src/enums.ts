export const STATUS_PEDIDO = ['rascunho', 'confirmado', 'em_preparo', 'pronto', 'saiu_entrega', 'entregue', 'retirado', 'cancelado'] as const;
export type StatusPedido = (typeof STATUS_PEDIDO)[number];
export const CANAIS = ['whatsapp', 'instagram', 'balcao', 'telefone', 'outro'] as const;
export const TIPOS_PEDIDO = ['entrega', 'retirada'] as const;
export const FORMAS_PAGAMENTO = ['pix', 'dinheiro', 'credito', 'debito', 'outro'] as const;
export const PAPEIS = ['admin', 'operador'] as const;

/** Próximo status no fluxo, conforme o tipo do pedido. */
export function proximoStatus(atual: StatusPedido, tipo: 'entrega' | 'retirada'): StatusPedido | null {
  const fluxo: StatusPedido[] = tipo === 'entrega'
    ? ['confirmado', 'em_preparo', 'pronto', 'saiu_entrega', 'entregue']
    : ['confirmado', 'em_preparo', 'pronto', 'retirado'];
  const i = fluxo.indexOf(atual);
  return i >= 0 && i < fluxo.length - 1 ? fluxo[i + 1] : null;
}
