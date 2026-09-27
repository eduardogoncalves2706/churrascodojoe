import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { proximoStatus } from '@joe/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, brl, hora, num, STATUS_LABEL, type Row } from '../api';
import { Carregando, Erro } from '../components/ui';

export default function PedidoDetalhe() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [forma, setForma] = useState('pix');
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [copiado, setCopiado] = useState(false);
  const q = useQuery({ queryKey: ['pedido', id], queryFn: () => api<Row>(`/pedidos/${id}`) });
  const cols = useQuery({ queryKey: ['colaboradores'], queryFn: () => api<Row[]>('/colaboradores') });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['pedido', id] }); qc.invalidateQueries({ queryKey: ['pedidos'] }); };
  const status = useMutation({ mutationFn: (para: string) => api(`/pedidos/${id}/status`, { method: 'POST', body: { para } }), onSuccess: refresh });
  const pagar = useMutation({ mutationFn: () => api(`/pedidos/${id}/pagamentos`, { method: 'POST', body: { forma, valor: Number(valor.replace(',', '.')) } }), onSuccess: () => { setValor(''); refresh(); } });
  const cancelar = useMutation({ mutationFn: () => api(`/pedidos/${id}/cancelar`, { method: 'POST', body: { motivo } }), onSuccess: refresh });
  const motoboy = useMutation({ mutationFn: (motoboyId: string) => api(`/pedidos/${id}`, { method: 'PATCH', body: { motoboyId: motoboyId || null } }), onSuccess: refresh });

  if (q.isLoading) return <Carregando />;
  if (q.isError) return <Erro e={q.error} />;
  const p = q.data!;
  const prox = proximoStatus(p.status, p.tipo);
  const pago = p.pagamentos.reduce((a: number, x: Row) => a + Number(x.valor), 0);
  const admin = p.custoTotal !== undefined;
  const copiar = async () => { const r = await api<Row>(`/pedidos/${id}/resumo-whatsapp`); await navigator.clipboard.writeText(r.texto); setCopiado(true); setTimeout(() => setCopiado(false), 2000); };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap"><h2 className="text-5xl text-gold">Pedido #{num(p.numeroDia)}</h2>
        <span className={`chip ${p.status === 'cancelado' ? 'bg-brasa border-brasa' : 'chip-on'}`}>{STATUS_LABEL[p.status]}</span><Link to="/pedidos" className="ml-auto text-gold underline">voltar</Link></div>
      <div className="card space-y-1">
        <p className="text-lg">{p.nomeClienteSnapshot ?? 'Balcão'} <span className="text-cream/60">{p.telefoneSnapshot}</span></p>
        <p>{p.tipo === 'entrega' ? `🛵 ${p.enderecoTexto ?? ''} — ${p.bairro ?? ''}${p.referencia ? ` (${p.referencia})` : ''}` : '🏪 Retirada'} · {p.canal}</p>
        {p.agendadoPara && <p>📅 Agendado para {new Date(p.agendadoPara).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>}
        {p.observacoes && <p className="text-gold">Obs.: {p.observacoes}</p>}
        {p.motivoCancelamento && <p className="text-brasa">Cancelado: {p.motivoCancelamento}</p>}
      </div>
      <div className="card"><table className="w-full"><tbody>
        {p.itens.map((i: Row) => <tr key={i.id}><td className="td">{Number(i.quantidade)}× {i.descricaoSnapshot}{i.observacao && <span className="text-gold"> ({i.observacao})</span>}</td><td className="td text-right">{brl(i.subtotal)}</td></tr>)}
        <tr><td className="td text-cream/70">Subtotal</td><td className="td text-right">{brl(p.subtotal)}</td></tr>
        {Number(p.desconto) > 0 && <tr><td className="td text-cream/70">Desconto</td><td className="td text-right">−{brl(p.desconto)}</td></tr>}
        {p.tipo === 'entrega' && <tr><td className="td text-cream/70">Taxa de entrega</td><td className="td text-right">{brl(p.taxaEntrega)}</td></tr>}
        <tr><td className="td font-label font-bold uppercase text-gold">Total</td><td className="td text-right font-display text-3xl text-gold">{brl(p.total)}</td></tr>
        {admin && <tr><td className="td text-cream/60">Custo / margem 🔒</td><td className="td text-right text-cream/60">{p.custoTotal == null ? 'ficha incompleta' : `${brl(p.custoTotal)} / ${brl(Number(p.total) - Number(p.taxaEntrega) - Number(p.custoTotal))}`}</td></tr>}
      </tbody></table></div>

      {p.status !== 'cancelado' && <div className="flex gap-2 flex-wrap">
        {prox && <button className="btn" onClick={() => status.mutate(prox)}>→ {STATUS_LABEL[prox]}</button>}
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
