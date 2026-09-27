import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatQtd, proximoStatus } from '@joe/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, brl, hora, num, STATUS_LABEL, type Row } from '../api';
import { Carregando, Erro } from '../components/ui';

interface ItemEdit { key: string; produtoId?: string; comboVarianteId?: string; refrigeranteId?: string; nome: string; quantidade: number; observacao: string }
const BLOQUEADO = ['saiu_entrega', 'entregue', 'retirado', 'cancelado'];

export default function PedidoDetalhe() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [forma, setForma] = useState('pix');
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [editandoItens, setEditandoItens] = useState(false);
  const [itensEdit, setItensEdit] = useState<ItemEdit[]>([]);
  const [addProdutoId, setAddProdutoId] = useState('');
  const [comboSel, setComboSel] = useState({ comboId: '', varianteId: '', refrigeranteId: '' });
  const q = useQuery({ queryKey: ['pedido', id], queryFn: () => api<Row>(`/pedidos/${id}`) });
  const cols = useQuery({ queryKey: ['colaboradores'], queryFn: () => api<Row[]>('/colaboradores') });
  const prods = useQuery({ queryKey: ['produtos'], queryFn: () => api<Row[]>('/produtos'), enabled: editandoItens });
  const combos = useQuery({ queryKey: ['combos'], queryFn: () => api<Row[]>('/combos'), enabled: editandoItens });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['pedido', id] }); qc.invalidateQueries({ queryKey: ['pedidos'] }); };
  const status = useMutation({ mutationFn: (para: string) => api(`/pedidos/${id}/status`, { method: 'POST', body: { para } }), onSuccess: refresh });
  const pagar = useMutation({ mutationFn: () => api(`/pedidos/${id}/pagamentos`, { method: 'POST', body: { forma, valor: Number(valor.replace(',', '.')) } }), onSuccess: () => { setValor(''); refresh(); } });
  const cancelar = useMutation({ mutationFn: () => api(`/pedidos/${id}/cancelar`, { method: 'POST', body: { motivo } }), onSuccess: refresh });
  const confirmarSite = useMutation({ mutationFn: () => api(`/pedidos/${id}/confirmar-site`, { method: 'POST' }), onSuccess: refresh });
  const recusarSite = useMutation({ mutationFn: () => api(`/pedidos/${id}/recusar-site`, { method: 'POST', body: { motivo } }), onSuccess: refresh });
  const motoboy = useMutation({ mutationFn: (motoboyId: string) => api(`/pedidos/${id}`, { method: 'PATCH', body: { motoboyId: motoboyId || null } }), onSuccess: refresh });
  const [buscaCliente, setBuscaCliente] = useState('');
  const [sugestoesCliente, setSugestoesCliente] = useState<Row[]>([]);
  const buscarClienteParaLigar = async (nome: string) => { setBuscaCliente(nome); setSugestoesCliente(nome.trim().length >= 2 ? (await api<Row[]>(`/clientes?busca=${encodeURIComponent(nome.trim())}`)).slice(0, 5) : []); };
  const religar = useMutation({ mutationFn: (clienteId: string) => api(`/pedidos/${id}`, { method: 'PATCH', body: { clienteId } }), onSuccess: () => { setBuscaCliente(''); setSugestoesCliente([]); refresh(); } });
  const salvarItens = useMutation({
    mutationFn: () => api(`/pedidos/${id}/itens`, { method: 'PUT', body: itensEdit.map((i) => ({
      ...(i.comboVarianteId ? { comboVarianteId: i.comboVarianteId, refrigeranteId: i.refrigeranteId || undefined } : { produtoId: i.produtoId }),
      quantidade: i.quantidade, observacao: i.observacao || undefined,
    })) }),
    onSuccess: () => { setEditandoItens(false); refresh(); },
  });

  if (q.isLoading) return <Carregando />;
  if (q.isError) return <Erro e={q.error} />;
  const p = q.data!;
  const prox = proximoStatus(p.status, p.tipo);
  const pago = p.pagamentos.reduce((a: number, x: Row) => a + Number(x.valor), 0);
  const admin = p.custoTotal !== undefined;
  const copiar = async () => { const r = await api<Row>(`/pedidos/${id}/resumo-whatsapp`); await navigator.clipboard.writeText(r.texto); setCopiado(true); setTimeout(() => setCopiado(false), 2000); };

  const abrirEdicaoItens = () => {
    setItensEdit(p.itens.map((i: Row) => ({
      key: crypto.randomUUID(), produtoId: i.produtoId ?? undefined, comboVarianteId: i.comboVarianteId ?? undefined,
      refrigeranteId: i.escolhas?.refrigeranteId ?? undefined, nome: i.descricaoSnapshot, quantidade: Number(i.quantidade), observacao: i.observacao ?? '',
    })));
    setEditandoItens(true);
  };
  const passoItem = (i: ItemEdit, dir: 1 | -1) => {
    const fracionado = i.produtoId ? prods.data?.find((x) => x.id === i.produtoId)?.permiteFracionado : false;
    const step = fracionado ? 0.5 : 1;
    const q2 = Math.round((i.quantidade + dir * step) * 2) / 2;
    setItensEdit(q2 <= 0 ? itensEdit.filter((x) => x.key !== i.key) : itensEdit.map((x) => (x.key === i.key ? { ...x, quantidade: q2 } : x)));
  };
  const addProduto = () => {
    const prod = prods.data?.find((x) => x.id === addProdutoId);
    if (!prod) return;
    setItensEdit([...itensEdit, { key: crypto.randomUUID(), produtoId: prod.id, nome: prod.nome, quantidade: 1, observacao: '' }]);
    setAddProdutoId('');
  };
  const addCombo = () => {
    const combo = combos.data?.find((c) => c.id === comboSel.comboId);
    const variante = combo?.variantes.find((v: Row) => v.id === comboSel.varianteId);
    if (!combo || !variante) return;
    const refri = prods.data?.find((x) => x.id === comboSel.refrigeranteId);
    setItensEdit([...itensEdit, { key: crypto.randomUUID(), comboVarianteId: variante.id, refrigeranteId: comboSel.refrigeranteId || undefined, nome: `${combo.nome} – ${variante.carne}${refri ? ` · ${refri.nome}` : ''}`, quantidade: 1, observacao: '' }]);
    setComboSel({ comboId: '', varianteId: '', refrigeranteId: '' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap"><h2 className="text-5xl text-gold">Pedido #{num(p.numeroDia)}</h2>
        <span className={`chip ${p.status === 'cancelado' ? 'bg-brasa border-brasa' : 'chip-on'}`}>{STATUS_LABEL[p.status]}</span><Link to="/pedidos" className="ml-auto text-gold underline">voltar</Link></div>
      <div className="card space-y-1">
        <p className="text-lg">{p.nomeClienteSnapshot ?? 'Balcão'} <span className="text-cream/60">{p.telefoneSnapshot}</span></p>
        {admin && !p.clienteId && (
          <div className="relative">
            <p className="text-xs text-brasa">Sem cadastro de cliente vinculado — busque e religue:</p>
            <input value={buscaCliente} onChange={(e) => buscarClienteParaLigar(e.target.value)} placeholder="Nome do cliente" className="!w-64" />
            {sugestoesCliente.length > 0 && <ul className="absolute z-10 left-0 right-0 mt-1 card p-1 space-y-1 !w-64">{sugestoesCliente.map((s) => (
              <li key={s.id}><button type="button" className="w-full text-left px-2 py-1 rounded hover:bg-primary/20" onClick={() => religar.mutate(s.id)}>
                <span className="font-label font-bold">{s.nome}</span>{s.telefone && <span className="text-cream/60 text-sm"> · {s.telefone}</span>}</button></li>
            ))}</ul>}
          </div>
        )}
        <p>{p.tipo === 'entrega' ? `🛵 ${p.enderecoTexto ?? ''} — ${p.bairro ?? ''}${p.referencia ? ` (${p.referencia})` : ''}` : '🏪 Retirada'} · {p.canal}</p>
        {p.agendadoPara && <p>📅 Agendado para {new Date(p.agendadoPara).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>}
        {p.observacoes && <p className="text-gold">Obs.: {p.observacoes}</p>}
        {p.motivoCancelamento && <p className="text-brasa">Cancelado: {p.motivoCancelamento}</p>}
      </div>
      {editandoItens ? (
        <div className="card space-y-3">
          <h3 className="font-label font-bold uppercase text-gold">Editar itens</h3>
          <ul className="divide-y divide-white/10">{itensEdit.map((i) => (
            <li key={i.key} className="py-2 flex items-center gap-2">
              <p className="flex-1 leading-tight">{i.nome}</p>
              <button className="btn-ghost !px-3" aria-label="menos" onClick={() => passoItem(i, -1)}>−</button>
              <span className="w-10 text-center font-display text-2xl">{formatQtd(i.quantidade)}</span>
              <button className="btn-ghost !px-3" aria-label="mais" onClick={() => passoItem(i, 1)}>+</button>
              <button className="btn-ghost !px-3" onClick={() => setItensEdit(itensEdit.filter((x) => x.key !== i.key))}>×</button>
            </li>))}</ul>
          <div className="flex flex-wrap gap-2 items-center">
            <select className="!w-auto" value={addProdutoId} onChange={(e) => setAddProdutoId(e.target.value)}><option value="">+ produto…</option>{prods.data?.filter((x) => x.ativo && x.disponivelHoje).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
            <button className="btn-ghost" disabled={!addProdutoId} onClick={addProduto}>Adicionar</button>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <select className="!w-auto" value={comboSel.comboId} onChange={(e) => setComboSel({ comboId: e.target.value, varianteId: '', refrigeranteId: '' })}><option value="">+ combo…</option>{combos.data?.filter((c) => c.ativo).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
            {comboSel.comboId && <select className="!w-auto" value={comboSel.varianteId} onChange={(e) => setComboSel({ ...comboSel, varianteId: e.target.value })}><option value="">carne…</option>{combos.data?.find((c) => c.id === comboSel.comboId)?.variantes.filter((v: Row) => v.ativo).map((v: Row) => <option key={v.id} value={v.id}>{v.carne}</option>)}</select>}
            {comboSel.varianteId && <select className="!w-auto" value={comboSel.refrigeranteId} onChange={(e) => setComboSel({ ...comboSel, refrigeranteId: e.target.value })}><option value="">refri (opcional)…</option>{prods.data?.filter((x) => x.categoria === 'bebida').map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>}
            <button className="btn-ghost" disabled={!comboSel.varianteId} onClick={addCombo}>Adicionar</button>
          </div>
          <div className="flex gap-2">
            <button className="btn" disabled={!itensEdit.length || salvarItens.isPending} onClick={() => salvarItens.mutate()}>{salvarItens.isPending ? 'Salvando…' : 'Salvar itens'}</button>
            <button className="btn-ghost" onClick={() => setEditandoItens(false)}>Cancelar</button>
          </div>
          {salvarItens.isError && <Erro e={salvarItens.error} />}
        </div>
      ) : (
        <div className="card"><table className="w-full"><tbody>
          {p.itens.map((i: Row) => <tr key={i.id}><td className="td">{formatQtd(Number(i.quantidade))}× {i.descricaoSnapshot}{i.observacao && <span className="text-gold"> ({i.observacao})</span>}
            {i.escolhas?.composicao && <p className="text-xs text-cream/60">{i.escolhas.composicao.map((c: Row) => `${formatQtd(c.quantidade)}× ${c.nome}`).join(' · ')}</p>}</td><td className="td text-right">{brl(i.subtotal)}</td></tr>)}
          <tr><td className="td text-cream/70">Subtotal</td><td className="td text-right">{brl(p.subtotal)}</td></tr>
          {Number(p.desconto) > 0 && <tr><td className="td text-cream/70">Desconto</td><td className="td text-right">−{brl(p.desconto)}</td></tr>}
          {p.tipo === 'entrega' && <tr><td className="td text-cream/70">Taxa de entrega</td><td className="td text-right">{brl(p.taxaEntrega)}</td></tr>}
          <tr><td className="td font-label font-bold uppercase text-gold">Total</td><td className="td text-right font-display text-3xl text-gold">{brl(p.total)}</td></tr>
          {admin && <tr><td className="td text-cream/60">Custo / margem 🔒</td><td className="td text-right text-cream/60">{p.custoTotal == null ? 'ficha incompleta' : `${brl(p.custoTotal)} / ${brl(Number(p.total) - Number(p.taxaEntrega) - Number(p.custoTotal))}`}</td></tr>}
        </tbody></table></div>
      )}

      {p.status === 'aguardando_confirmacao' && (
        <div className="card border-2 border-primary space-y-2">
          <p className="text-primary-hover font-label font-bold uppercase">🔔 Pedido feito pelo site — confirme ou recuse</p>
          <div className="flex gap-2 flex-wrap">
            <button className="btn" disabled={confirmarSite.isPending} onClick={() => confirmarSite.mutate()}>Confirmar pedido</button>
            <input className="flex-1 min-w-[160px]" placeholder="Motivo se for recusar" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            <button className="btn-danger" disabled={!motivo.trim() || recusarSite.isPending} onClick={() => recusarSite.mutate()}>Recusar</button>
          </div>
          {(confirmarSite.isError || recusarSite.isError) && <Erro e={confirmarSite.error ?? recusarSite.error} />}
        </div>
      )}

      {p.status !== 'cancelado' && <div className="flex gap-2 flex-wrap">
        {prox && <button className="btn" onClick={() => status.mutate(prox)}>→ {STATUS_LABEL[prox]}</button>}
        {!BLOQUEADO.includes(p.status) && !editandoItens && <button className="btn-ghost" onClick={abrirEdicaoItens}>Editar itens</button>}
        <Link className="btn-ghost" to={`/pedidos/${id}/comanda`} target="_blank">Comanda</Link>
        <button className="btn-ghost" onClick={copiar}>{copiado ? 'Copiado!' : 'Resumo WhatsApp'}</button>
        {p.tipo === 'entrega' && <select className="!w-auto" value={p.motoboyId ?? ''} onChange={(e) => motoboy.mutate(e.target.value)}><option value="">Motoboy…</option>{cols.data?.filter((c) => c.tipo === 'motoboy').map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>}
      </div>}
      {(status.isError || pagar.isError || cancelar.isError) && <Erro e={status.error ?? pagar.error ?? cancelar.error} />}

      <div className="card space-y-2"><h3 className="font-label font-bold uppercase text-gold">Pagamento: {p.statusPagamento} · recebido {brl(pago)}</h3>
        {p.pagamentos.map((x: Row) => <p key={x.id} className="text-sm">+ {brl(x.valor)} {x.forma} · {hora(x.recebidoEm)}</p>)}
        {p.status !== 'cancelado' && pago < Number(p.total) && <div className="flex gap-2 flex-wrap"><select className="!w-auto" value={forma} onChange={(e) => setForma(e.target.value)}>{['pix', 'dinheiro', 'credito', 'debito'].map((f) => <option key={f}>{f}</option>)}</select>
          <input className="!w-32" inputMode="decimal" placeholder={String(Number(p.total) - pago)} value={valor} onChange={(e) => setValor(e.target.value)} /><button className="btn" disabled={!valor} onClick={() => pagar.mutate()}>Registrar</button></div>}</div>

      <div className="card"><h3 className="font-label font-bold uppercase text-gold mb-1">Histórico</h3>{p.historico.map((h: Row) => <p key={h.id} className="text-sm text-cream/70">{hora(h.em)} — {h.de ? `${STATUS_LABEL[h.de] ?? h.de} → ` : ''}{STATUS_LABEL[h.para] ?? h.para}{h.nota && ` (${h.nota})`}</p>)}</div>

      {!['cancelado', 'entregue', 'retirado'].includes(p.status) && <div className="card flex gap-2 flex-wrap"><input className="flex-1" placeholder="Motivo do cancelamento" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <button className="btn-danger" disabled={!motivo.trim()} onClick={() => confirm('Cancelar este pedido?') && cancelar.mutate()}>Cancelar pedido</button></div>}
    </div>
  );
}
