import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, brl, brlC, type Row } from '../api';
import { Carregando, Titulo } from '../components/ui';

function Ficha() {
  const qc = useQueryClient();
  const prods = useQuery({ queryKey: ['produtos'], queryFn: () => api<Row[]>('/produtos') });
  const insumos = useQuery({ queryKey: ['insumos'], queryFn: () => api<Row[]>('/insumos') });
  const rend = useQuery({ queryKey: ['rendimentos'], queryFn: () => api<Row[]>('/rendimentos') });
  const [pid, setPid] = useState('');
  const [linhas, setLinhas] = useState<{ insumoId: string; quantidadeInsumo: number }[]>([]);
  const carregar = async (id: string) => { setPid(id); if (!id) return setLinhas([]); const f = await api<Row>(`/produtos/${id}/ficha-tecnica`); setLinhas(f.linhas.map((l: Row) => ({ insumoId: l.insumoId, quantidadeInsumo: l.quantidadeInsumo }))); };
  const salvar = useMutation({ mutationFn: () => api(`/produtos/${pid}/ficha-tecnica`, { method: 'PUT', body: linhas.filter((l) => l.insumoId && l.quantidadeInsumo > 0) }), onSuccess: () => qc.invalidateQueries({ queryKey: ['produtos'] }) });
  const custoIns = new Map(insumos.data?.map((i) => [i.id, i.custoCents]));
  const custo = linhas.reduce((a, l) => a + Math.round(l.quantidadeInsumo * (custoIns.get(l.insumoId) ?? 0)), 0);
  const sugerir = () => { const r = rend.data?.filter((x) => x.r.produtoId === pid); if (r?.length) setLinhas(r.map((x) => ({ insumoId: x.r.insumoId, quantidadeInsumo: Math.round((1 / Number(x.r.fator)) * 10000) / 10000 }))); };
  return (
    <section className="card space-y-3"><h3 className="font-label font-bold uppercase text-gold">Ficha técnica</h3>
      <select value={pid} onChange={(e) => carregar(e.target.value)}><option value="">Escolha o produto…</option>{prods.data?.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
      {pid && <>{linhas.map((l, i) => <div key={i} className="flex gap-2"><select value={l.insumoId} onChange={(e) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, insumoId: e.target.value } : x)))}><option value="">Insumo…</option>{insumos.data?.map((n) => <option key={n.id} value={n.id}>{n.nome} ({n.unidadeCompra})</option>)}</select>
        <input className="!w-28" inputMode="decimal" value={l.quantidadeInsumo || ''} onChange={(e) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, quantidadeInsumo: Number(e.target.value.replace(',', '.')) || 0 } : x)))} />
        <button className="btn-ghost" onClick={() => setLinhas(linhas.filter((_, j) => j !== i))}>×</button></div>)}
        <div className="flex gap-2 flex-wrap items-center"><button className="btn-ghost" onClick={() => setLinhas([...linhas, { insumoId: '', quantidadeInsumo: 0 }])}>+ linha</button><button className="btn-ghost" onClick={sugerir}>Sugerir pelo rendimento</button>
          <button className="btn" onClick={() => salvar.mutate()}>Salvar</button><span className="ml-auto text-gold font-display text-2xl">Custo {linhas.length ? brlC(custo) : '—'}</span></div></>}
    </section>
  );
}

export default function Insumos() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['insumos'], queryFn: () => api<Row[]>('/insumos') });
  const forn = useQuery({ queryKey: ['fornecedores'], queryFn: () => api<Row[]>('/fornecedores') });
  const [novoCusto, setNovoCusto] = useState<Record<string, string>>({});
  const custo = useMutation({ mutationFn: ({ id, valor }: { id: string; valor: number }) => api(`/insumos/${id}/custo`, { method: 'POST', body: { custo: valor } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['insumos'] }); qc.invalidateQueries({ queryKey: ['produtos'] }); qc.invalidateQueries({ queryKey: ['combos'] }); } });
  if (q.isLoading) return <Carregando />;
  return (
    <div className="space-y-4"><Titulo>Insumos, fornecedores e ficha</Titulo>
      <div className="card overflow-x-auto"><table className="w-full min-w-[560px]"><thead><tr><th className="th">Insumo</th><th className="th">Unidade</th><th className="th text-right">Custo atual</th><th className="th text-right">Variação</th><th className="th">Novo custo</th></tr></thead><tbody>
        {q.data?.map((i) => { const v = i.custoAnteriorCents ? ((i.custoCents - i.custoAnteriorCents) / i.custoAnteriorCents) * 100 : null;
          return (<tr key={i.id}><td className="td">{i.nome}</td><td className="td text-cream/60">{i.unidadeCompra}</td><td className="td text-right text-gold">{brl(i.custoAtual)}</td>
            <td className={`td text-right ${v && v > 0 ? 'text-primary-hover' : ''}`}>{v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}</td>
            <td className="td"><input className="!w-24" inputMode="decimal" value={novoCusto[i.id] ?? ''} placeholder="R$" onChange={(e) => setNovoCusto({ ...novoCusto, [i.id]: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter' && novoCusto[i.id]) { custo.mutate({ id: i.id, valor: Number(novoCusto[i.id].replace(',', '.')) }); setNovoCusto({ ...novoCusto, [i.id]: '' }); } }} /></td></tr>); })}</tbody></table>
        <p className="text-xs text-cream/60 mt-2">Digite o novo custo e pressione Enter. Margens de produtos e combos recalculam; pedidos antigos não mudam.</p></div>
      <Ficha />
      <section className="card"><h3 className="font-label font-bold uppercase text-gold mb-2">Fornecedores</h3>{forn.data?.map((f) => <p key={f.id}>{f.nome} — pagamento em {f.prazoPagamentoDias} dias ({f.formaPagamentoPadrao ?? '—'})</p>)}</section>
    </div>
  );
}
