import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, brl, diasAteVencer, hoje, type Row } from '../api';
import { Vazio } from '../components/ui';

const STATUS_ORDEM = ['confirmado', 'em_preparo', 'pronto', 'saiu_entrega'] as const;
const STATUS_LABEL_CURTO: Record<string, string> = { confirmado: 'Confirmados', em_preparo: 'Em preparo', pronto: 'Prontos', saiu_entrega: 'Saiu p/ entrega' };

function Atalho({ to, children }: { to: string; children: React.ReactNode }) {
  return <Link to={to} className="card text-center font-label font-bold uppercase text-gold hover:border-primary !py-4">{children}</Link>;
}

export default function Dashboard({ admin }: { admin: boolean }) {
  const dataHoje = hoje();
  const status = useQuery({ queryKey: ['public-status'], queryFn: () => api<Row>('/public/status') });
  const pedidos = useQuery({ queryKey: ['pedidos', dataHoje], queryFn: () => api<Row[]>(`/pedidos?data=${dataHoje}`), refetchInterval: 30_000 });
  const pendentesSite = useQuery({ queryKey: ['pedidos-pendentes-site'], queryFn: () => api<Row[]>('/pedidos/pendentes-site'), refetchInterval: 30_000 });
  const estoque = useQuery({ queryKey: ['estoque'], queryFn: () => api<Row[]>('/estoque'), enabled: admin });

  const lista = (pedidos.data ?? []).filter((p) => p.status !== 'cancelado');
  const total = lista.reduce((a, p) => a + Number(p.total), 0);
  const porStatus = (st: string) => lista.filter((p) => p.status === st || (st === 'entregue' && p.status === 'retirado')).length;

  const vencendoOuVencido = (estoque.data ?? []).map((i: Row): Row => ({ ...i, dias: diasAteVencer(i.validadeMaisProxima) })).filter((i) => i.dias != null && i.dias <= 3);
  const vencidos = vencendoOuVencido.filter((i) => i.dias! < 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-4xl text-gold">Olá!</h2>
        {status.data && <p className={`font-label uppercase font-bold ${status.data.aberto ? 'text-ok' : 'text-cream/60'}`}>{status.data.aberto ? '🔥' : '🕒'} {status.data.mensagem}</p>}
      </div>

      {(pendentesSite.data?.length ?? 0) > 0 && (
        <Link to="/pedidos" className="card border-2 border-primary block hover:border-primary-hover">
          <p className="font-label font-bold uppercase text-primary-hover">🔔 {pendentesSite.data!.length} pedido{pendentesSite.data!.length > 1 ? 's' : ''} do site aguardando confirmação</p>
        </Link>
      )}

      {admin && vencendoOuVencido.length > 0 && (
        <Link to="/estoque" className={`card border-2 block ${vencidos.length ? 'border-brasa' : 'border-primary'} hover:opacity-90`}>
          <p className={`font-label font-bold uppercase ${vencidos.length ? 'text-brasa' : 'text-primary-hover'}`}>
            ⚠️ {vencendoOuVencido.length} insumo{vencendoOuVencido.length > 1 ? 's' : ''} {vencidos.length > 0 ? 'vencido(s) ou vencendo' : 'vencendo em até 3 dias'}
          </p>
          <p className="text-sm text-cream/70">{vencendoOuVencido.map((i) => i.nome).join(' · ')}</p>
        </Link>
      )}

      <div className="card">
        <div className="flex justify-between items-baseline mb-2"><h3 className="font-label font-bold uppercase text-gold">Hoje</h3><span className="font-display text-3xl text-gold">{brl(total)}</span></div>
        {pedidos.data && !lista.length && <Vazio>Nenhum pedido hoje ainda.</Vazio>}
        {lista.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            {STATUS_ORDEM.map((st) => (
              <div key={st} className="card !bg-bg/40">
                <p className="font-display text-3xl text-gold">{porStatus(st)}</p>
                <p className="text-xs text-cream/60 font-label uppercase">{STATUS_LABEL_CURTO[st]}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Atalho to="/novo">+ Novo pedido</Atalho>
        <Atalho to="/pedidos">Pedidos</Atalho>
        <Atalho to="/producao">Produção</Atalho>
        <Atalho to="/agenda">Agenda</Atalho>
        {admin && <Atalho to="/estoque">Estoque</Atalho>}
        {admin && <Atalho to="/financeiro">Financeiro</Atalho>}
      </div>
    </div>
  );
}
