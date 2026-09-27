import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { proximoStatus, type StatusPedido } from '@joe/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, brl, hoje, hora, num, STATUS_LABEL, type Row } from '../api';
import { Carregando, Erro, Titulo, Vazio } from '../components/ui';

const COLUNAS: StatusPedido[] = ['confirmado', 'em_preparo', 'pronto', 'saiu_entrega', 'entregue'];

function espera(p: Row) {
  if (['entregue', 'retirado', 'cancelado'].includes(p.status)) return { min: 0, cls: '' };
  const min = Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 60000);
  return { min, cls: min > 45 ? 'text-brasa font-bold' : min > 30 ? 'text-primary-hover' : 'text-cream/60' };
}

export default function Pedidos() {
  const qc = useQueryClient();
  const [data, setData] = useState(hoje());
  const [filtro, setFiltro] = useState('');
  const q = useQuery({ queryKey: ['pedidos', data], queryFn: () => api<Row[]>(`/pedidos?data=${data}`), refetchInterval: 20_000 });
  const pendentesSite = useQuery({ queryKey: ['pedidos-pendentes-site'], queryFn: () => api<Row[]>('/pedidos/pendentes-site'), refetchInterval: 20_000 });
  const avancar = useMutation({
    mutationFn: ({ id, para }: { id: string; para: string }) => api(`/pedidos/${id}/status`, { method: 'POST', body: { para } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pedidos'] }),
  });
  const refreshTudo = () => { qc.invalidateQueries({ queryKey: ['pedidos'] }); qc.invalidateQueries({ queryKey: ['pedidos-pendentes-site'] }); };
  const confirmarSite = useMutation({ mutationFn: (id: string) => api(`/pedidos/${id}/confirmar-site`, { method: 'POST' }), onSuccess: refreshTudo });
  const recusarSite = useMutation({
    mutationFn: (id: string) => { const motivo = prompt('Motivo da recusa (obrigatório):'); if (!motivo) throw new Error('cancelado'); return api(`/pedidos/${id}/recusar-site`, { method: 'POST', body: { motivo } }); },
    onSuccess: refreshTudo,
  });

  const lista = (q.data ?? []).filter((p) => !filtro || p.tipo === filtro);
  const grupo = (st: StatusPedido) => lista.filter((p) => p.status === st || (st === 'entregue' && p.status === 'retirado'));
  const cancelados = lista.filter((p) => p.status === 'cancelado');
  const total = lista.filter((p) => p.status !== 'cancelado').reduce((a, p) => a + Number(p.total), 0);

  const Card = ({ p }: { p: Row }) => {
    const prox = proximoStatus(p.status, p.tipo);
    const e = espera(p);
    return (
      <div className="card space-y-1">
        <Link to={`/pedidos/${p.id}`} className="block">
          <div className="flex justify-between items-baseline"><span className="font-display text-3xl text-gold">#{num(p.numeroDia)}</span><span className="font-display text-2xl">{brl(p.total)}</span></div>
          <p className="leading-tight">{p.nomeClienteSnapshot ?? 'Balcão'}{p.bairro ? ` · ${p.bairro}` : ''}</p>
          <p className="text-xs flex gap-2 flex-wrap"><span>{p.tipo === 'entrega' ? '🛵 Entrega' : '🏪 Retirada'}</span><span>{p.agendadoPara ? `📅 ${hora(p.agendadoPara)}` : hora(p.createdAt)}</span>
            <span aria-label={p.statusPagamento}>{p.statusPagamento === 'pago' ? '✔ pago' : '✖ ' + p.statusPagamento}</span>{e.min > 0 && <span className={e.cls}>{e.min} min</span>}</p>
        </Link>
        {prox && <button className="btn w-full !min-h-[40px]" disabled={avancar.isPending} onClick={() => avancar.mutate({ id: p.id, para: prox })}>→ {STATUS_LABEL[prox]}</button>}
      </div>
    );
  };

  return (
    <div>
      <Titulo extra={<div className="flex gap-2 items-center"><input type="date" className="!w-auto" value={data} onChange={(e) => setData(e.target.value)} />
        <select className="!w-auto" value={filtro} onChange={(e) => setFiltro(e.target.value)}><option value="">Todos</option><option value="entrega">Entrega</option><option value="retirada">Retirada</option></select></div>}>Pedidos</Titulo>
      <p className="text-gold mb-3 font-label uppercase">{lista.filter((p) => p.status !== 'cancelado').length} pedidos · {brl(total)}</p>

      {(pendentesSite.data?.length ?? 0) > 0 && (
        <section className="card border-2 border-primary mb-4 space-y-2">
          <h3 className="font-label font-bold uppercase text-primary-hover">🔔 Do site — aguardando confirmação ({pendentesSite.data!.length})</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pendentesSite.data!.map((p) => (
              <div key={p.id} className="card space-y-1">
                <Link to={`/pedidos/${p.id}`} className="block">
                  <div className="flex justify-between items-baseline"><span className="font-display text-2xl text-gold">#{num(p.numeroDia)}</span><span className="font-display text-xl">{brl(p.total)}</span></div>
                  <p className="leading-tight">{p.nomeClienteSnapshot}{p.bairro ? ` · ${p.bairro}` : ''}</p>
                  <p className="text-xs text-cream/60">{p.dataOperacao} · {p.agendadoPara ? `agendado ${hora(p.agendadoPara)}` : 'hoje, o quanto antes'}</p>
                </Link>
                <div className="flex gap-2">
                  <button className="btn !min-h-[36px] flex-1" disabled={confirmarSite.isPending} onClick={() => confirmarSite.mutate(p.id)}>Confirmar</button>
                  <button className="btn-danger !min-h-[36px] flex-1" disabled={recusarSite.isPending} onClick={() => recusarSite.mutate(p.id)}>Recusar</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {q.isLoading && <Carregando />}{q.isError && <Erro e={q.error} />}
      {q.data && !lista.length && <Vazio>Nenhum pedido nesta data.</Vazio>}
      <div className="grid gap-4 md:grid-cols-5">
        {COLUNAS.map((st) => (
          <section key={st} className="space-y-2">
            <h3 className="font-label font-bold uppercase text-gold">{st === 'entregue' ? 'Entregue / Retirado' : STATUS_LABEL[st]} ({grupo(st).length})</h3>
            {grupo(st).map((p) => <Card key={p.id} p={p} />)}
          </section>
        ))}
      </div>
      {cancelados.length > 0 && <details className="mt-6"><summary className="text-brasa cursor-pointer">Cancelados ({cancelados.length})</summary><div className="grid gap-2 md:grid-cols-5 mt-2">{cancelados.map((p) => <Card key={p.id} p={p} />)}</div></details>}
    </div>
  );
}
