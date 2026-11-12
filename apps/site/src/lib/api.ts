// Consome só /v1/public/* (sem login). Buscado no build (SSG) — preço e cardápio vêm do sistema
// interno sem digitar duas vezes; ver docs/SPEC_landing_page.md. `status` (aberto/fechado) é
// atualizado no cliente porque muda com a hora, o resto não precisa.
const API = import.meta.env.PUBLIC_API_URL ?? 'https://nai06jpd9k.execute-api.sa-east-1.amazonaws.com';

export interface ProdutoVariante { id: string; nome: string; precoCents: number }
export interface Produto {
  id: string; categoria: string; nome: string; descricaoCurta: string | null; unidadeVenda: string;
  precoCents: number; imagemKey: string | null; disponivelHoje: boolean; permiteFracionado: boolean;
  parceiro: string | null; vendidoAPrecoDeCusto: boolean; destaque: boolean; ordem: number;
  // Catálogo genérico (ex.: Certificado digital — "1 ano"/"2 anos", cada um com seu preço); vazio
  // pra produto simples (o caso comum do Churrasco do Joe).
  variantes: ProdutoVariante[];
}
export interface ComboVariante { id: string; carne: string; precoCents: number }
export interface ComboItem { nome: string; quantidade: number; grupoEscolha: string | null }
export interface Combo { id: string; nome: string; descricaoCurta: string | null; pessoas: number; imagemKey: string | null; itens: ComboItem[]; variantes: ComboVariante[] }
export interface Bairro { id: string; nome: string; cidade: string; taxaCents: number }
export interface FaqItem { pergunta: string; resposta: string }
export interface Parceiro { nome: string; instagram: string | null }
export interface SiteConfig {
  nome: string; whatsapp: string; instagram: string; horarioTexto: string;
  endereco: { modo: string; texto: string | null; mapsUrl: string | null };
  cnpj: string | null; razaoSocial: string | null; aceitaPedidosSite: boolean;
  regiaoEntregaTexto: string; faq: FaqItem[]; parceiros: Parceiro[];
}
export interface StatusOperacao { aberto: boolean; mensagem: string; horario: { inicio: number; fim: number }; diasOperacao: string[] }

async function get<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${API}/v1/public${path}`);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null; // build não quebra se a API estiver fora — ver requisito de fallback da SPEC
  }
}

export const buscarCardapio = () => get<{ produtos: Produto[]; combos: Combo[] }>('/cardapio');
export const buscarBairros = () => get<Bairro[]>('/bairros');
export const buscarSite = () => get<SiteConfig>('/site');
export const buscarStatus = () => get<StatusOperacao>('/status');

export const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
export const whatsappUrl = (numero: string, texto = '') => {
  const digitos = numero.replace(/\D/g, '');
  const alvo = digitos.startsWith('55') ? digitos : `55${digitos}`;
  return `https://wa.me/${alvo}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
};

/* ---------- Carrinho (pré-pedido pelo site — Configurações → "Aceitar pré-pedidos pelo site") ---------- */
export interface ItemCarrinhoPayload { produtoId?: string; comboVarianteId?: string; produtoVarianteId?: string; refrigeranteId?: string; quantidade: number }
export interface PedidoSitePayload {
  nome: string; telefone: string; tipo: 'entrega' | 'retirada'; bairroId?: string; enderecoTexto?: string;
  referencia?: string; observacoes?: string; site?: string; itens: ItemCarrinhoPayload[];
}
export interface PedidoSiteResultado { numero: number; dataOperacao: string; totalCents: number; totalFormatado: string; textoWhatsapp: string; whatsappUrl: string | null }

/** Cria o pré-pedido (POST /v1/public/pedidos) — vira "aguardando confirmação" no sistema interno;
 * a equipe confirma ou recusa, pagamento continua combinado (sem gateway nessa fase). */
export async function criarPedidoSite(payload: PedidoSitePayload): Promise<{ ok: true; dados: PedidoSiteResultado } | { ok: false; erro: string }> {
  try {
    const r = await fetch(`${API}/v1/public/pedidos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await r.json();
    if (!r.ok) return { ok: false, erro: data?.error?.message ?? 'Erro ao enviar pedido' };
    return { ok: true, dados: data as PedidoSiteResultado };
  } catch {
    return { ok: false, erro: 'Falha de conexão — tenta de novo ou chama no WhatsApp' };
  }
}
