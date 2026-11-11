import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type Row } from '../api';
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

function diasAteVencer(validade: string | null) {
  if (!validade) return null;
  return Math.ceil((new Date(validade + 'T00:00:00').getTime() - Date.now()) / 86_400_000);
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
