import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, diasAteVencer, type Row } from '../api';
import { Campo, Carregando, Erro, SeletorPeriodo, Titulo, Vazio } from '../components/ui';

/** Próximo sábado e domingo a partir de hoje (se hoje já for sáb/dom, usa o fim de semana atual). */
function proximoFimDeSemana() {
  const hoje = new Date();
  const dow = hoje.getDay(); // 0 dom .. 6 sáb
  const diasAteSab = dow === 0 ? 6 : (6 - dow) % 7;
  const sab = new Date(hoje); sab.setDate(hoje.getDate() + diasAteSab);
  const dom = new Date(sab); dom.setDate(sab.getDate() + 1);
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  return { de: fmt(sab), ate: fmt(dom) };
}

function NovaEntrada({ insumos, onSalvo }: { insumos: Row[]; onSalvo: () => void }) {
  const [insumoId, setInsumoId] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [validade, setValidade] = useState('');
  const [custoUnitario, setCustoUnitario] = useState('');
  const salvar = useMutation({
    mutationFn: () => api('/estoque/lotes', { method: 'POST', body: {
      insumoId, origem: 'compra', quantidade: Number(quantidade.replace(',', '.')),
      validade: validade || null, custoUnitario: custoUnitario ? Number(custoUnitario.replace(',', '.')) : null,
    } }),
    onSuccess: () => { setInsumoId(''); setQuantidade(''); setValidade(''); setCustoUnitario(''); onSalvo(); },
  });
  return (
    <section className="card space-y-2">
      <h3 className="font-label font-bold uppercase text-gold">Registrar compra</h3>
      <div className="grid gap-2 sm:grid-cols-4">
        <Campo label="Insumo"><select value={insumoId} onChange={(e) => setInsumoId(e.target.value)}><option value="">Escolha…</option>{insumos.map((i) => <option key={i.insumoId} value={i.insumoId}>{i.nome} ({i.unidadeCompra})</option>)}</select></Campo>
        <Campo label="Quantidade"><input inputMode="decimal" placeholder="0" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} /></Campo>
        <Campo label="Validade (opcional)"><input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} /></Campo>
        <Campo label="Custo unitário (opcional)"><input inputMode="decimal" placeholder="R$" value={custoUnitario} onChange={(e) => setCustoUnitario(e.target.value)} /></Campo>
      </div>
      <button className="btn" disabled={!insumoId || !quantidade || salvar.isPending} onClick={() => salvar.mutate()}>Registrar entrada</button>
      {salvar.isError && <Erro e={salvar.error} />}
    </section>
  );
}

/** Estoque de produto PRONTO pra vender (porções já prontas, ex.: maionese temperada) — diferente do
 * estoque de insumo acima: aqui não importa o que entra na receita, só "quanto temos pra vender".
 * estoqueTotal é só informativo (quanto existe no geral); estoqueVenda é o que fica liberado agora
 * pra vender — some de Novo pedido sozinho quando chega a zero, e volta se cancelar/editar pedido. */
function ProdutosProntos() {
  const qc = useQueryClient();
  const produtos = useQuery({ queryKey: ['produtos'], queryFn: () => api<Row[]>('/produtos') });
  const [edit, setEdit] = useState<Record<string, { total?: string; venda?: string }>>({});
  const salvar = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Row }) => api(`/produtos/${id}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['produtos'] }),
  });
  const controlados = (produtos.data ?? []).filter((p) => p.controlaEstoque);

  if (produtos.isLoading) return <Carregando />;
  return (
    <section className="card space-y-2">
      <h3 className="font-label font-bold uppercase text-gold">Produtos prontos pra vender</h3>
      <p className="text-xs text-cream/60">Todo início de fim de semana, atualiza quanto tem pra vender — o pedido desconta sozinho e some de Novo pedido quando zerar.</p>
      {!controlados.length && <Vazio>Nenhum produto com estoque controlado ainda. Liga em Cardápio → editar produto → "Controlar estoque pra venda".</Vazio>}
      {controlados.length > 0 && (
        <div className="overflow-x-auto"><table className="w-full min-w-[480px]"><thead><tr>
          <th className="th">Produto</th><th className="th text-right">Temos no geral</th><th className="th text-right">Liberado pra vender</th>
        </tr></thead><tbody>
          {controlados.map((p) => (
            <tr key={p.id}>
              <td className="td">{p.nome}</td>
              <td className="td text-right">
                <input className="!w-20 text-right" inputMode="decimal" value={edit[p.id]?.total ?? p.estoqueTotal}
                  onChange={(ev) => setEdit({ ...edit, [p.id]: { ...edit[p.id], total: ev.target.value } })}
                  onBlur={(ev) => { const v = Number(ev.target.value.replace(',', '.')); if (!Number.isNaN(v) && v !== Number(p.estoqueTotal)) salvar.mutate({ id: p.id, body: { estoqueTotal: v } }); }} />
              </td>
              <td className="td text-right">
                <input className="!w-20 text-right font-bold text-gold" inputMode="decimal" value={edit[p.id]?.venda ?? p.estoqueVenda}
                  onChange={(ev) => setEdit({ ...edit, [p.id]: { ...edit[p.id], venda: ev.target.value } })}
                  onBlur={(ev) => { const v = Number(ev.target.value.replace(',', '.')); if (!Number.isNaN(v) && v !== Number(p.estoqueVenda)) salvar.mutate({ id: p.id, body: { estoqueVenda: v } }); }} />
              </td>
            </tr>
          ))}
        </tbody></table></div>
      )}
      {salvar.isError && <Erro e={salvar.error} />}
    </section>
  );
}

export default function Estoque() {
  const qc = useQueryClient();
  const [periodo, setPeriodo] = useState(proximoFimDeSemana());
  const estoque = useQuery({ queryKey: ['estoque'], queryFn: () => api<Row[]>('/estoque') });
  const necessidade = useQuery({ queryKey: ['estoque-necessidade', periodo], queryFn: () => api<Row[]>(`/estoque/necessidade?de=${periodo.de}&ate=${periodo.ate}`) });
  const atualizarMinimo = useMutation({
    mutationFn: ({ id, valor }: { id: string; valor: number }) => api(`/insumos/${id}`, { method: 'PATCH', body: { estoqueMinimo: valor } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['estoque'] }),
  });
  const [minimoEdit, setMinimoEdit] = useState<Record<string, string>>({});
  const refresh = () => { qc.invalidateQueries({ queryKey: ['estoque'] }); qc.invalidateQueries({ queryKey: ['estoque-necessidade'] }); };

  const aComprar = (necessidade.data ?? []).filter((n) => n.aComprar > 0);

  return (
    <div className="space-y-4">
      <Titulo>Estoque</Titulo>

      <ProdutosProntos />

      <section className="card space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-label font-bold uppercase text-gold">O que comprar</h3>
          <SeletorPeriodo de={periodo.de} ate={periodo.ate} onChange={setPeriodo} />
        </div>
        <p className="text-xs text-cream/60">Calculado a partir dos pedidos já confirmados ou aguardando confirmação no período, descontando o que já tem em estoque.</p>
        {necessidade.isLoading && <Carregando />}
        {necessidade.data && !aComprar.length && <Vazio>Nada pra comprar nesse período — estoque cobre a demanda.</Vazio>}
        {aComprar.length > 0 && (
          <div className="overflow-x-auto"><table className="w-full min-w-[480px]"><thead><tr>
            <th className="th">Insumo</th><th className="th text-right">Necessário</th><th className="th text-right">Tem</th><th className="th text-right">Comprar</th>
          </tr></thead><tbody>
            {aComprar.map((n) => (
              <tr key={n.insumoId}><td className="td">{n.nome}</td>
                <td className="td text-right text-cream/60">{n.necessario.toFixed(2)}</td>
                <td className="td text-right text-cream/60">{n.estoqueAtual.toFixed(2)}</td>
                <td className="td text-right text-primary-hover font-bold">{n.aComprar.toFixed(2)} {n.unidadeCompra}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </section>

      <NovaEntrada insumos={estoque.data ?? []} onSalvo={refresh} />

      <section className="card space-y-2">
        <h3 className="font-label font-bold uppercase text-gold">O que temos</h3>
        {estoque.isLoading && <Carregando />}
        <div className="overflow-x-auto"><table className="w-full min-w-[640px]"><thead><tr>
          <th className="th">Insumo</th><th className="th text-right">Estoque atual</th><th className="th">Validade mais próxima</th><th className="th text-right">Mínimo de segurança</th>
        </tr></thead><tbody>
          {estoque.data?.map((e) => {
            const dias = diasAteVencer(e.validadeMaisProxima);
            return (
              <tr key={e.insumoId}>
                <td className="td">{e.nome}<br /><span className="text-cream/40 text-xs">{e.categoria}</span></td>
                <td className="td text-right">{e.estoqueAtual.toFixed(2)} {e.unidadeCompra}</td>
                <td className="td">
                  {!e.validadeMaisProxima ? <span className="text-cream/40">—</span> : (
                    <span className={dias != null && dias < 0 ? 'text-brasa font-bold' : dias != null && dias <= 3 ? 'text-primary-hover font-bold' : 'text-cream/70'}>
                      {new Date(e.validadeMaisProxima + 'T00:00:00').toLocaleDateString('pt-BR')}
                      {dias != null && dias < 0 && ' · vencido'}
                      {dias != null && dias >= 0 && dias <= 3 && ` · ${dias}d`}
                    </span>
                  )}
                </td>
                <td className="td text-right">
                  <input className="!w-20 text-right" inputMode="decimal" value={minimoEdit[e.insumoId] ?? e.estoqueMinimo}
                    onChange={(ev) => setMinimoEdit({ ...minimoEdit, [e.insumoId]: ev.target.value })}
                    onBlur={(ev) => { const v = Number(ev.target.value.replace(',', '.')); if (!Number.isNaN(v) && v !== e.estoqueMinimo) atualizarMinimo.mutate({ id: e.insumoId, valor: v }); }} />
                </td>
              </tr>
            );
          })}
        </tbody></table></div>
      </section>
    </div>
  );
}
