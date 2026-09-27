import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, brl, brlC, pct, type Row } from '../api';
import { Carregando, Erro, Titulo } from '../components/ui';

export default function Cardapio({ admin }: { admin: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['produtos'], queryFn: () => api<Row[]>('/produtos') });
  const limite = useQuery({ queryKey: ['cfg-margem'], queryFn: () => api<number>('/configuracoes/margem_minima_pct'), enabled: admin });
  const [editando, setEditando] = useState<string | null>(null);
  const [preco, setPreco] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [reaj, setReaj] = useState({ percentual: '10', arredondar: 'nenhum' });
  const [previa, setPrevia] = useState<Row | null>(null);
  const [hist, setHist] = useState<Row[] | null>(null);
  const [mostrarNovo, setMostrarNovo] = useState(false);
  const CATEGORIAS = ['carne', 'acompanhamento', 'bebida', 'sobremesa', 'geleia', 'outros'];
  const vazio = { nome: '', categoria: 'carne', unidadeVenda: 'unidade', precoVenda: '', permiteFracionado: false, parceiro: '', vendidoAPrecoDeCusto: false };
  const [novo, setNovo] = useState(vazio);

  const refresh = () => qc.invalidateQueries({ queryKey: ['produtos'] });
  const patch = useMutation({ mutationFn: ({ id, body }: { id: string; body: Row }) => api(`/produtos/${id}`, { method: 'PATCH', body }), onSuccess: () => { setEditando(null); refresh(); } });
  const criar = useMutation({
    mutationFn: () => api('/produtos', { method: 'POST', body: {
      ...novo, precoVenda: Number(novo.precoVenda.replace(',', '.') || 0), parceiro: novo.parceiro || null,
    } }),
    onSuccess: () => { setNovo(vazio); setMostrarNovo(false); refresh(); },
  });
  const body = () => ({ percentual: Number(reaj.percentual.replace(',', '.')), arredondar: reaj.arredondar, produtoIds: [...sel] });
  const prever = useMutation({ mutationFn: () => api<Row>('/produtos/reajuste?dryRun=true', { method: 'POST', body: body() }), onSuccess: setPrevia });
  const aplicar = useMutation({ mutationFn: () => api('/produtos/reajuste', { method: 'POST', body: body() }), onSuccess: () => { setPrevia(null); setSel(new Set()); refresh(); } });

  if (q.isLoading) return <Carregando />;
  if (q.isError) return <Erro e={q.error} />;
  const min = limite.data ?? 40;
  const verHist = async (id: string) => setHist(await api<Row[]>(`/produtos/${id}/historico`));
  const csv = () => {
    const linhas = [['Produto', 'Categoria', 'Unidade', 'Preço', ...(admin ? ['Custo', 'Margem %'] : [])].join(';'),
      ...q.data!.map((p) => [p.nome, p.categoria, p.unidadeVenda, p.precoVenda, ...(admin ? [p.custoCents == null ? '' : (p.custoCents / 100).toFixed(2), p.margemPct?.toFixed(1) ?? ''] : [])].join(';'))];
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + linhas.join('\n')], { type: 'text/csv' })); a.download = 'tabela-de-precos.csv'; a.click();
  };

  return (
    <div className="space-y-4"><Titulo extra={<div className="flex gap-2">{admin && <button className="btn" onClick={() => setMostrarNovo(!mostrarNovo)}>{mostrarNovo ? 'Cancelar' : '+ Novo produto'}</button>}<button className="btn-ghost" onClick={csv}>Exportar CSV</button></div>}>Cardápio e preços</Titulo>
      {admin && mostrarNovo && <div className="card space-y-3">
        <h3 className="font-label font-bold uppercase text-gold">Novo produto</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <div><label>Nome</label><input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></div>
          <div><label>Categoria</label><select value={novo.categoria} onChange={(e) => setNovo({ ...novo, categoria: e.target.value })}>{CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label>Unidade de venda</label><input value={novo.unidadeVenda} onChange={(e) => setNovo({ ...novo, unidadeVenda: e.target.value })} placeholder="espeto, kg, unidade…" /></div>
          <div><label>Preço de venda (R$)</label><input inputMode="decimal" value={novo.precoVenda} onChange={(e) => setNovo({ ...novo, precoVenda: e.target.value })} disabled={novo.vendidoAPrecoDeCusto} /></div>
          <div><label>Parceiro (opcional)</label><input value={novo.parceiro} onChange={(e) => setNovo({ ...novo, parceiro: e.target.value })} placeholder="ex.: Doces by Nick" /></div>
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 normal-case"><input type="checkbox" className="!w-5 !min-h-0" checked={novo.permiteFracionado} onChange={(e) => setNovo({ ...novo, permiteFracionado: e.target.checked })} />Permite fracionado (ex.: 0,5)</label>
          <label className="flex items-center gap-2 normal-case"><input type="checkbox" className="!w-5 !min-h-0" checked={novo.vendidoAPrecoDeCusto} onChange={(e) => setNovo({ ...novo, vendidoAPrecoDeCusto: e.target.checked, precoVenda: e.target.checked ? '0' : novo.precoVenda })} />Vendido a preço de custo (parceiro)</label>
        </div>
        <button className="btn" disabled={!novo.nome || criar.isPending} onClick={() => criar.mutate()}>{criar.isPending ? 'Salvando…' : 'Salvar produto'}</button>
        {criar.isError && <Erro e={criar.error} />}
      </div>}
      {admin && sel.size > 0 && <div className="card flex flex-wrap items-end gap-2"><div><label>Reajuste %</label><input className="!w-24" value={reaj.percentual} onChange={(e) => setReaj({ ...reaj, percentual: e.target.value })} /></div>
        <div><label>Arredondar</label><select value={reaj.arredondar} onChange={(e) => setReaj({ ...reaj, arredondar: e.target.value })}><option value="nenhum">Não</option><option value="90">,90</option><option value="99">,99</option></select></div>
        <button className="btn" onClick={() => prever.mutate()}>Prévia ({sel.size})</button></div>}
      {previa && <div className="card space-y-1"><h3 className="font-label font-bold uppercase text-gold">Prévia do reajuste</h3>{previa.itens.map((i: Row) => <p key={i.id}>{i.nome}: {brl(i.de)} → <b>{brl(i.para)}</b></p>)}
        <div className="flex gap-2 mt-2"><button className="btn" onClick={() => aplicar.mutate()}>Aplicar</button><button className="btn-ghost" onClick={() => setPrevia(null)}>Cancelar</button></div></div>}
      {hist && <div className="card"><div className="flex justify-between"><h3 className="font-label font-bold uppercase text-gold">Histórico de preço</h3><button className="underline text-gold" onClick={() => setHist(null)}>fechar</button></div>{hist.map((h) => <p key={h.id} className="text-sm">{h.vigenteDesde} — {brl(h.preco)} <span className="text-cream/60">{h.motivo}</span></p>)}</div>}

      <div className="card overflow-x-auto"><table className="w-full min-w-[640px]"><thead><tr>{admin && <th className="th w-8" />}<th className="th">Produto</th><th className="th">Un.</th><th className="th text-right">Preço</th>{admin && <><th className="th text-right">Custo</th><th className="th text-right">Margem</th></>}<th className="th">Hoje</th></tr></thead>
        <tbody>{q.data!.filter((p) => p.ativo).map((p) => {
          const baixa = admin && !p.vendidoAPrecoDeCusto && p.margemPct != null && p.margemPct < min;
          return (<tr key={p.id} className={p.disponivelHoje ? '' : 'opacity-50'}>
            {admin && <td className="td"><input type="checkbox" className="!w-5 !min-h-0" checked={sel.has(p.id)} onChange={(e) => { const n = new Set(sel); e.target.checked ? n.add(p.id) : n.delete(p.id); setSel(n); }} /></td>}
            <td className="td">{p.nome}{p.parceiro && <span className="text-xs text-gold"> · {p.parceiro}</span>}</td><td className="td text-cream/60">{p.unidadeVenda}</td>
            <td className="td text-right">{admin && editando === p.id
              ? <input autoFocus className="!w-24 text-right" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} onBlur={() => Number(preco.replace(',', '.')) >= 0 && preco !== '' ? patch.mutate({ id: p.id, body: { precoVenda: Number(preco.replace(',', '.')) } }) : setEditando(null)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
              : <button disabled={!admin} className="font-display text-2xl text-gold" onClick={() => { setEditando(p.id); setPreco(String(p.precoVenda)); }}>{p.vendidoAPrecoDeCusto ? 'custo' : brl(p.precoVenda)}</button>}
              {admin && <button className="ml-1 text-xs text-cream/50" onClick={() => verHist(p.id)}>↺</button>}</td>
            {admin && <><td className="td text-right">{p.custoCents == null ? <span className="text-cream/50" title="Sem ficha técnica">sem ficha</span> : brlC(p.custoCents)}</td>
              <td className={`td text-right ${baixa ? 'text-brasa font-bold' : ''}`}>{p.margemCents == null ? '—' : `${brlC(p.margemCents)} · ${pct(p.margemPct)}`}{baixa && ' ⚠'}</td></>}
            <td className="td"><input type="checkbox" className="!w-6 !min-h-0" aria-label="Disponível hoje" checked={p.disponivelHoje} onChange={(e) => patch.mutate({ id: p.id, body: { disponivelHoje: e.target.checked } })} /></td></tr>);
        })}</tbody></table></div></div>
  );
}
