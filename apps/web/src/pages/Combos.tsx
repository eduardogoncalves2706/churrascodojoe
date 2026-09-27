import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, brlC, pct, type Row } from '../api';
import { Carregando, Erro, Titulo } from '../components/ui';

interface ItemLinha { produtoId: string; ehCarneEscolhida: boolean; quantidade: string; grupoEscolha: string }
interface VarianteLinha { carneProdutoId: string; preco: string; ativo: boolean; persistida: boolean }

function EditorCombo({ combo, onFechar }: { combo: Row; onFechar: () => void }) {
  const qc = useQueryClient();
  const produtos = useQuery({ queryKey: ['produtos'], queryFn: () => api<Row[]>('/produtos') });
  const [meta, setMeta] = useState({ nome: combo.nome, descricao: combo.descricao ?? '', pessoas: String(combo.pessoas), ativo: combo.ativo });
  const [itens, setItens] = useState<ItemLinha[]>(combo.itens.map((i: Row) => ({ produtoId: i.produtoId ?? '', ehCarneEscolhida: i.ehCarneEscolhida, quantidade: String(Number(i.quantidade)), grupoEscolha: i.grupoEscolha ?? '' })));
  const [variantes, setVariantes] = useState<VarianteLinha[]>(combo.variantes.map((v: Row) => ({ carneProdutoId: v.carneProdutoId, preco: String(v.precoCents / 100), ativo: v.ativo, persistida: true })));

  const refresh = () => qc.invalidateQueries({ queryKey: ['combos'] });
  const salvarMeta = useMutation({ mutationFn: () => api(`/combos/${combo.id}`, { method: 'PATCH', body: { nome: meta.nome, descricao: meta.descricao || null, pessoas: Number(meta.pessoas), ativo: meta.ativo } }), onSuccess: refresh });
  const salvarItens = useMutation({
    mutationFn: () => api(`/combos/${combo.id}/itens`, { method: 'PUT', body: itens.map((i) => ({
      produtoId: i.ehCarneEscolhida ? null : i.produtoId || null, ehCarneEscolhida: i.ehCarneEscolhida, quantidade: Number(i.quantidade.replace(',', '.') || 0), grupoEscolha: i.grupoEscolha || null,
    })) }),
    onSuccess: refresh,
  });
  const salvarVariantes = useMutation({
    mutationFn: () => api(`/combos/${combo.id}/variantes`, { method: 'PUT', body: variantes.map((v) => ({ carneProdutoId: v.carneProdutoId, preco: Number(v.preco.replace(',', '.') || 0), ativo: v.ativo })) }),
    onSuccess: refresh,
  });

  const nomeProduto = (id: string) => produtos.data?.find((p) => p.id === id)?.nome ?? '';

  return (
    <div className="card space-y-5 border border-primary/40">
      <div className="flex justify-between items-center"><h3 className="font-label font-bold uppercase text-gold">Editando — {combo.nome}</h3><button className="text-gold underline text-sm" onClick={onFechar}>fechar</button></div>

      <div className="space-y-2">
        <p className="text-xs font-label font-bold uppercase text-cream/60">Dados do combo</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <div><label>Nome</label><input value={meta.nome} onChange={(e) => setMeta({ ...meta, nome: e.target.value })} /></div>
          <div><label>Pessoas</label><input inputMode="numeric" value={meta.pessoas} onChange={(e) => setMeta({ ...meta, pessoas: e.target.value })} /></div>
          <div><label>Descrição</label><input value={meta.descricao} onChange={(e) => setMeta({ ...meta, descricao: e.target.value })} /></div>
        </div>
        <label className="flex items-center gap-2 normal-case"><input type="checkbox" className="!w-5 !min-h-0" checked={meta.ativo} onChange={(e) => setMeta({ ...meta, ativo: e.target.checked })} />Ativo</label>
        <button className="btn-ghost" disabled={salvarMeta.isPending} onClick={() => salvarMeta.mutate()}>Salvar dados</button>
        {salvarMeta.isError && <Erro e={salvarMeta.error} />}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-label font-bold uppercase text-cream/60">Composição (o que vem no combo)</p>
        {itens.map((i, idx) => (
          <div key={idx} className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 normal-case text-sm"><input type="checkbox" className="!w-5 !min-h-0" checked={i.ehCarneEscolhida} onChange={(e) => setItens(itens.map((x, j) => (j === idx ? { ...x, ehCarneEscolhida: e.target.checked, produtoId: '' } : x)))} />Carne escolhida</label>
            {!i.ehCarneEscolhida && <select className="!w-auto flex-1" value={i.produtoId} onChange={(e) => setItens(itens.map((x, j) => (j === idx ? { ...x, produtoId: e.target.value } : x)))}>
              <option value="">Produto…</option>{produtos.data?.filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>}
            <input className="!w-20" inputMode="decimal" placeholder="qtd" value={i.quantidade} onChange={(e) => setItens(itens.map((x, j) => (j === idx ? { ...x, quantidade: e.target.value } : x)))} />
            <input className="!w-32" placeholder="grupo (ex.: refrigerante)" value={i.grupoEscolha} onChange={(e) => setItens(itens.map((x, j) => (j === idx ? { ...x, grupoEscolha: e.target.value } : x)))} />
            <button className="btn-ghost !px-3" onClick={() => setItens(itens.filter((_, j) => j !== idx))}>×</button>
          </div>
        ))}
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setItens([...itens, { produtoId: '', ehCarneEscolhida: false, quantidade: '1', grupoEscolha: '' }])}>+ item</button>
          <button className="btn" disabled={salvarItens.isPending} onClick={() => salvarItens.mutate()}>Salvar composição</button>
        </div>
        {salvarItens.isError && <Erro e={salvarItens.error} />}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-label font-bold uppercase text-cream/60">Variantes (carne × preço)</p>
        {variantes.map((v, idx) => (
          <div key={idx} className="flex flex-wrap items-center gap-2">
            {v.persistida
              ? <span className="w-40">{nomeProduto(v.carneProdutoId)}</span>
              : <select className="!w-40" value={v.carneProdutoId} onChange={(e) => setVariantes(variantes.map((x, j) => (j === idx ? { ...x, carneProdutoId: e.target.value } : x)))}>
                  <option value="">Carne…</option>{produtos.data?.filter((p) => p.categoria === 'carne' && p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>}
            <input className="!w-28" inputMode="decimal" placeholder="preço" value={v.preco} onChange={(e) => setVariantes(variantes.map((x, j) => (j === idx ? { ...x, preco: e.target.value } : x)))} />
            <label className="flex items-center gap-1 normal-case text-sm"><input type="checkbox" className="!w-5 !min-h-0" checked={v.ativo} onChange={(e) => setVariantes(variantes.map((x, j) => (j === idx ? { ...x, ativo: e.target.checked } : x)))} />Ativa</label>
            {!v.persistida && <button className="btn-ghost !px-3" onClick={() => setVariantes(variantes.filter((_, j) => j !== idx))}>×</button>}
          </div>
        ))}
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setVariantes([...variantes, { carneProdutoId: '', preco: '', ativo: true, persistida: false }])}>+ variante</button>
          <button className="btn" disabled={salvarVariantes.isPending} onClick={() => salvarVariantes.mutate()}>Salvar variantes</button>
        </div>
        <p className="text-xs text-cream/50">Uma variante nunca é apagada (pedidos antigos referenciam ela) — para removê-la da venda, desmarque "Ativa".</p>
        {salvarVariantes.isError && <Erro e={salvarVariantes.error} />}
      </div>
    </div>
  );
}

export default function Combos({ admin }: { admin: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['combos'], queryFn: () => api<Row[]>('/combos') });
  const [editando, setEditando] = useState<string | null>(null);
  const [criandoNome, setCriandoNome] = useState('');
  const criar = useMutation({
    mutationFn: () => api<Row>('/combos', { method: 'POST', body: { nome: criandoNome, pessoas: 2 } }),
    onSuccess: (c) => { setCriandoNome(''); qc.invalidateQueries({ queryKey: ['combos'] }); setEditando(c.id); },
  });
  if (q.isLoading) return <Carregando />;
  return (
    <div className="space-y-4">
      <Titulo>Combos</Titulo>
      {admin && <div className="card flex gap-2 items-end"><div className="flex-1"><label>Novo combo (nome)</label><input value={criandoNome} onChange={(e) => setCriandoNome(e.target.value)} placeholder="ex.: Combo 3 – 6 pessoas" /></div>
        <button className="btn" disabled={!criandoNome.trim() || criar.isPending} onClick={() => criar.mutate()}>Criar</button></div>}
      {q.data?.map((c) => editando === c.id
        ? <EditorCombo key={c.id} combo={c} onFechar={() => setEditando(null)} />
        : (
          <section key={c.id} className={`card space-y-3 ${c.ativo ? '' : 'opacity-50'}`}>
            <div className="flex justify-between items-center"><h3 className="font-display text-3xl text-gold">{c.nome}{!c.ativo && <span className="text-brasa text-base"> · inativo</span>}</h3>
              {admin && <button className="text-gold underline text-sm" onClick={() => setEditando(c.id)}>editar</button>}</div>
            <p className="text-sm text-cream/70">{c.itens.map((i: Row) => `${Number(i.quantidade)}× ${i.nome}`).join(' · ')}</p>
            <div className="overflow-x-auto"><table className="w-full min-w-[480px]"><thead><tr><th className="th">Carne</th><th className="th text-right">Preço</th>{admin && <><th className="th text-right">Custo</th><th className="th text-right">Margem</th></>}<th className="th text-right">Avulso</th><th className="th text-right">Desconto</th></tr></thead>
              <tbody>{c.variantes.map((v: Row) => <tr key={v.id} className={v.ativo ? '' : 'opacity-50'}><td className="td">{v.carne}{!v.ativo && ' (inativa)'}</td><td className="td text-right font-display text-2xl text-gold">{brlC(v.precoCents)}</td>
                {admin && <><td className="td text-right">{brlC(v.custoCents)}</td><td className="td text-right">{v.margemCents == null ? '—' : `${brlC(v.margemCents)} · ${pct(v.margemPct)}`}</td></>}
                <td className="td text-right text-cream/60">{brlC(v.precoCheioAvulsoCents)}</td><td className="td text-right">{brlC(v.descontoCents)}</td></tr>)}</tbody></table></div>
          </section>
        ))}
    </div>
  );
}
