import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api';
import { BotaoSalvar, Campo, Carregando, Titulo, useSalvarSecao } from '../components/ui';

/** Lê/grava uma config pela chave genérica (GET/PUT /configuracoes/:chave) — sem schema próprio no
 * backend, então toda tela de Configurações passa por aqui. 404 (chave nunca gravada) cai no padrão. */
function useConfig<T>(chave: string, padrao: T) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['config', chave],
    queryFn: async () => { try { return await api<T>(`/configuracoes/${chave}`); } catch { return padrao; } },
  });
  const mut = useMutation({ mutationFn: (valor: T) => api(`/configuracoes/${chave}`, { method: 'PUT', body: valor }), onSuccess: () => qc.invalidateQueries({ queryKey: ['config', chave] }) });
  return { valor: q.data ?? padrao, isLoading: q.isLoading, mutateAsync: mut.mutateAsync };
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <section className="card space-y-3"><h3 className="font-label font-bold uppercase text-gold">{titulo}</h3>{children}</section>;
}

/** Chave sensível (credencial) — GET nunca devolve o valor real, só {configurado: boolean} (ver
 * CHAVES_SENSIVEIS em routes/config.ts). Por isso não reaproveita useConfig: o shape de leitura é
 * diferente do de escrita (escreve a string crua, lê só um booleano). */
function useCredencial(chave: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['config-sensivel', chave],
    queryFn: async () => { try { return await api<{ configurado: boolean }>(`/configuracoes/${chave}`); } catch { return { configurado: false }; } },
  });
  const mut = useMutation({ mutationFn: (valor: string) => api(`/configuracoes/${chave}`, { method: 'PUT', body: valor }), onSuccess: () => qc.invalidateQueries({ queryKey: ['config-sensivel', chave] }) });
  return { configurado: q.data?.configurado ?? false, isLoading: q.isLoading, mutateAsync: mut.mutateAsync };
}

const DIAS = [['dom', 'Dom'], ['seg', 'Seg'], ['ter', 'Ter'], ['qua', 'Qua'], ['qui', 'Qui'], ['sex', 'Sex'], ['sab', 'Sáb']] as const;

/** White-label: nome do negócio usado no cabeçalho do sistema, aba do navegador e no site público
 * (/v1/public/site). Primeiro campo a editar num cliente novo — ver docs/checklist-cliente-novo.md. */
function SecaoIdentidade() {
  const nome = useConfig('negocio_nome', 'Churrasco do Joe');
  const [n, setN] = useState(nome.valor);
  useEffect(() => { if (!nome.isLoading) setN(nome.valor); }, [nome.isLoading]); // eslint-disable-line react-hooks/exhaustive-deps
  const { salvar, ...estado } = useSalvarSecao(() => [nome.mutateAsync(n)]);
  if (nome.isLoading) return <Carregando />;

  return (
    <Secao titulo="Identidade do negócio">
      <p className="text-xs text-cream/60">Nome que aparece no cabeçalho do sistema, na aba do navegador e no site público.</p>
      <Campo label="Nome do negócio"><input value={n} onChange={(e) => setN(e.target.value)} /></Campo>
      <BotaoSalvar onClick={salvar} {...estado} />
    </Secao>
  );
}

function SecaoOperacao() {
  const horario = useConfig('horario_pico', { inicio: 11, fim: 14 });
  const dias = useConfig<string[]>('dias_operacao', ['sab', 'dom']);
  const margem = useConfig('margem_minima_pct', 40);
  const [h, setH] = useState(horario.valor);
  const [d, setD] = useState(dias.valor);
  const [m, setM] = useState(String(margem.valor));
  const carregando = horario.isLoading || dias.isLoading || margem.isLoading;
  useEffect(() => { if (!carregando) { setH(horario.valor); setD(dias.valor); setM(String(margem.valor)); } }, [carregando]); // eslint-disable-line react-hooks/exhaustive-deps
  const { salvar, ...estado } = useSalvarSecao(() => [horario.mutateAsync(h), dias.mutateAsync(d), margem.mutateAsync(Number(m.replace(',', '.')))]);
  if (carregando) return <Carregando />;

  const alternarDia = (chave: string) => setD(d.includes(chave) ? d.filter((x) => x !== chave) : [...d, chave]);
  return (
    <Secao titulo="Operação">
      <div className="grid gap-2 sm:grid-cols-3">
        <Campo label="Horário de pico — início"><input inputMode="numeric" value={h.inicio} onChange={(e) => setH({ ...h, inicio: Number(e.target.value) || 0 })} /></Campo>
        <Campo label="Horário de pico — fim"><input inputMode="numeric" value={h.fim} onChange={(e) => setH({ ...h, fim: Number(e.target.value) || 0 })} /></Campo>
        <Campo label="Margem mínima (%)"><input inputMode="decimal" value={m} onChange={(e) => setM(e.target.value)} /></Campo>
      </div>
      <div>
        <label>Dias de operação</label>
        <div className="flex gap-2 flex-wrap mt-1">{DIAS.map(([chave, label]) => <button key={chave} type="button" className={`chip ${d.includes(chave) ? 'chip-on' : ''}`} onClick={() => alternarDia(chave)}>{label}</button>)}</div>
      </div>
      <BotaoSalvar onClick={salvar} {...estado} />
    </Secao>
  );
}

function SecaoPagamento() {
  const taxas = useConfig('taxas_maquininha', { pix: 0, debito: 0, credito: 0, dinheiro: 0 });
  const msg = useConfig('mensagem_whatsapp_confirmacao', '');
  const [t, setT] = useState(taxas.valor);
  const [m, setM] = useState(msg.valor);
  const carregando = taxas.isLoading || msg.isLoading;
  useEffect(() => { if (!carregando) { setT(taxas.valor); setM(msg.valor); } }, [carregando]); // eslint-disable-line react-hooks/exhaustive-deps
  const { salvar, ...estado } = useSalvarSecao(() => [taxas.mutateAsync(t), msg.mutateAsync(m)]);
  if (carregando) return <Carregando />;

  return (
    <Secao titulo="Pagamento">
      <div className="grid gap-2 sm:grid-cols-4">
        {(['pix', 'debito', 'credito', 'dinheiro'] as const).map((f) => (
          <Campo key={f} label={`Taxa ${f} (%)`}><input inputMode="decimal" value={t[f]} onChange={(e) => setT({ ...t, [f]: Number(e.target.value.replace(',', '.')) || 0 })} /></Campo>
        ))}
      </div>
      <Campo label="Mensagem padrão de confirmação (WhatsApp)"><input value={m} onChange={(e) => setM(e.target.value)} /></Campo>
      <BotaoSalvar onClick={salvar} {...estado} />
    </Secao>
  );
}

interface Faq { pergunta: string; resposta: string }
interface Parceiro { nome: string; instagram: string | null }

function SecaoSite() {
  const whatsapp = useConfig('site_whatsapp', '');
  const instagram = useConfig('site_instagram', '');
  const horarioTexto = useConfig('site_horario_texto', '');
  const enderecoModo = useConfig('site_endereco_modo', 'completo');
  const enderecoTexto = useConfig('site_endereco_texto', '');
  const enderecoMaps = useConfig('site_endereco_maps_url', '');
  const cnpj = useConfig('site_cnpj', '');
  const razaoSocial = useConfig('site_razao_social', '');
  const aceitaPedidos = useConfig('site_aceita_pedidos_site', true);
  const regiaoEntrega = useConfig('site_regiao_entrega_texto', '');
  const faq = useConfig<Faq[]>('site_faq', []);
  const parceiros = useConfig<Parceiro[]>('site_parceiros', []);
  const todas = [whatsapp, instagram, horarioTexto, enderecoModo, enderecoTexto, enderecoMaps, cnpj, razaoSocial, aceitaPedidos, regiaoEntrega, faq, parceiros];
  const carregando = todas.some((c) => c.isLoading);

  const [f, setF] = useState({
    whatsapp: '', instagram: '', horarioTexto: '', enderecoModo: 'completo', enderecoTexto: '', enderecoMaps: '',
    cnpj: '', razaoSocial: '', aceitaPedidos: true, regiaoEntrega: '',
  });
  const [listaFaq, setListaFaq] = useState<Faq[]>([]);
  const [listaParceiros, setListaParceiros] = useState<Parceiro[]>([]);
  useEffect(() => {
    if (carregando) return;
    setF({
      whatsapp: whatsapp.valor, instagram: instagram.valor, horarioTexto: horarioTexto.valor, enderecoModo: enderecoModo.valor,
      enderecoTexto: enderecoTexto.valor, enderecoMaps: enderecoMaps.valor, cnpj: cnpj.valor, razaoSocial: razaoSocial.valor,
      aceitaPedidos: aceitaPedidos.valor, regiaoEntrega: regiaoEntrega.valor,
    });
    setListaFaq(faq.valor); setListaParceiros(parceiros.valor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregando]);

  const { salvar, ...estado } = useSalvarSecao(() => [
    whatsapp.mutateAsync(f.whatsapp), instagram.mutateAsync(f.instagram), horarioTexto.mutateAsync(f.horarioTexto),
    enderecoModo.mutateAsync(f.enderecoModo), enderecoTexto.mutateAsync(f.enderecoTexto), enderecoMaps.mutateAsync(f.enderecoMaps),
    cnpj.mutateAsync(f.cnpj), razaoSocial.mutateAsync(f.razaoSocial), aceitaPedidos.mutateAsync(f.aceitaPedidos), regiaoEntrega.mutateAsync(f.regiaoEntrega),
    faq.mutateAsync(listaFaq.filter((x) => x.pergunta.trim() && x.resposta.trim())),
    parceiros.mutateAsync(listaParceiros.filter((x) => x.nome.trim())),
  ]);
  if (carregando) return <Carregando />;

  return (
    <Secao titulo="Site público">
      <p className="text-xs text-cream/60">Esses textos aparecem direto em churrascodojoe.com.br — o site busca eles ao vivo, sem precisar de novo deploy.</p>
      <label className="flex items-center gap-2 normal-case"><input type="checkbox" className="!w-5 !min-h-0" checked={f.aceitaPedidos} onChange={(e) => setF({ ...f, aceitaPedidos: e.target.checked })} />Aceitar pré-pedidos pelo site</label>
      <div className="grid gap-2 sm:grid-cols-2">
        <Campo label="WhatsApp (só números, com DDI)"><input inputMode="tel" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} placeholder="5551999999999" /></Campo>
        <Campo label="Instagram"><input value={f.instagram} onChange={(e) => setF({ ...f, instagram: e.target.value })} placeholder="@churrascodojoe" /></Campo>
        <Campo label="CNPJ (deixa em branco se ainda não tiver)"><input value={f.cnpj} onChange={(e) => setF({ ...f, cnpj: e.target.value })} /></Campo>
        <Campo label="Razão social"><input value={f.razaoSocial} onChange={(e) => setF({ ...f, razaoSocial: e.target.value })} /></Campo>
        <Campo label="Área de entrega (texto)"><input value={f.regiaoEntrega} onChange={(e) => setF({ ...f, regiaoEntrega: e.target.value })} /></Campo>
        <Campo label="Modo de exibição do endereço"><select value={f.enderecoModo} onChange={(e) => setF({ ...f, enderecoModo: e.target.value })}><option value="completo">Endereço completo + mapa</option><option value="bairro">Só bairro/cidade</option><option value="combinado">Combinado pelo WhatsApp</option></select></Campo>
      </div>
      <Campo label="Horário (texto livre, aparece no site)"><input value={f.horarioTexto} onChange={(e) => setF({ ...f, horarioTexto: e.target.value })} /></Campo>
      {f.enderecoModo === 'completo' && <>
        <Campo label="Endereço de retirada"><input value={f.enderecoTexto} onChange={(e) => setF({ ...f, enderecoTexto: e.target.value })} /></Campo>
        <Campo label="Link do Google Maps"><input value={f.enderecoMaps} onChange={(e) => setF({ ...f, enderecoMaps: e.target.value })} /></Campo>
      </>}

      <div className="space-y-2 pt-2 border-t border-white/10">
        <p className="text-xs font-label font-bold uppercase text-cream/60">FAQ do site</p>
        {listaFaq.map((item, i) => (
          <div key={i} className="flex gap-2 items-start flex-wrap">
            <input className="flex-1 min-w-[140px]" placeholder="Pergunta" value={item.pergunta} onChange={(e) => setListaFaq(listaFaq.map((x, j) => (j === i ? { ...x, pergunta: e.target.value } : x)))} />
            <input className="flex-[2] min-w-[200px]" placeholder="Resposta" value={item.resposta} onChange={(e) => setListaFaq(listaFaq.map((x, j) => (j === i ? { ...x, resposta: e.target.value } : x)))} />
            <button className="btn-ghost !px-3" onClick={() => setListaFaq(listaFaq.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button className="btn-ghost" onClick={() => setListaFaq([...listaFaq, { pergunta: '', resposta: '' }])}>+ pergunta</button>
      </div>

      <div className="space-y-2 pt-2 border-t border-white/10">
        <p className="text-xs font-label font-bold uppercase text-cream/60">Parceiros do site</p>
        {listaParceiros.map((item, i) => (
          <div key={i} className="flex gap-2 items-start flex-wrap">
            <input className="flex-1 min-w-[140px]" placeholder="Nome" value={item.nome} onChange={(e) => setListaParceiros(listaParceiros.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} />
            <input className="flex-1 min-w-[140px]" placeholder="@instagram (opcional)" value={item.instagram ?? ''} onChange={(e) => setListaParceiros(listaParceiros.map((x, j) => (j === i ? { ...x, instagram: e.target.value || null } : x)))} />
            <button className="btn-ghost !px-3" onClick={() => setListaParceiros(listaParceiros.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button className="btn-ghost" onClick={() => setListaParceiros([...listaParceiros, { nome: '', instagram: null }])}>+ parceiro</button>
      </div>

      <BotaoSalvar onClick={salvar} {...estado} />
    </Secao>
  );
}

/** Credenciais do gateway (Mercado Pago) pra cada cliente conectar a própria conta sem precisar de
 * mim — nunca pede de volta o valor salvo (é escrito uma vez, só mostra se já está configurado).
 * Pra funcionar de verdade também precisa de saída de internet na Lambda — ver docs/DEPLOY.md. */
function SecaoGatewayPagamento() {
  const token = useCredencial('mercadopago_access_token');
  const secret = useCredencial('mercadopago_webhook_secret');
  const [novoToken, setNovoToken] = useState('');
  const [novoSecret, setNovoSecret] = useState('');
  const carregando = token.isLoading || secret.isLoading;
  const { salvar, ...estado } = useSalvarSecao(() => {
    const acoes: Promise<unknown>[] = [];
    if (novoToken.trim()) acoes.push(token.mutateAsync(novoToken.trim()));
    if (novoSecret.trim()) acoes.push(secret.mutateAsync(novoSecret.trim()));
    return acoes;
  });
  if (carregando) return <Carregando />;
  const base = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
  const webhookUrl = `${base}/v1/public/webhooks/mercadopago`;

  return (
    <Secao titulo="Pagamento online (Mercado Pago)">
      <p className="text-xs text-cream/60">Cole as credenciais da sua conta Mercado Pago (painel de desenvolvedores → sua aplicação). Deixe em branco pra manter o valor já salvo — por segurança, ele nunca aparece de volta aqui.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Campo label={`Access Token${token.configurado ? ' · configurado ✓' : ' · não configurado'}`}>
          <input type="password" autoComplete="off" placeholder={token.configurado ? '••••••••••••' : 'APP_USR-...'} value={novoToken} onChange={(e) => setNovoToken(e.target.value)} />
        </Campo>
        <Campo label={`Segredo do webhook${secret.configurado ? ' · configurado ✓' : ' · não configurado'}`}>
          <input type="password" autoComplete="off" placeholder={secret.configurado ? '••••••••••••' : ''} value={novoSecret} onChange={(e) => setNovoSecret(e.target.value)} />
        </Campo>
      </div>
      <Campo label="URL do webhook (cole no painel do Mercado Pago → Webhooks)"><input readOnly value={webhookUrl} onFocus={(e) => e.target.select()} /></Campo>
      <BotaoSalvar onClick={salvar} {...estado} />
    </Secao>
  );
}

export default function Configuracoes() {
  return (
    <div className="space-y-4">
      <Titulo>Configurações</Titulo>
      <SecaoIdentidade />
      <SecaoOperacao />
      <SecaoPagamento />
      <SecaoGatewayPagamento />
      <SecaoSite />
    </div>
  );
}
