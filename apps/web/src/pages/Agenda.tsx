import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, brl, hoje, hora, num, type Row } from '../api';
import { Carregando, Titulo, Vazio } from '../components/ui';

const somaDias = (d: string, n: number) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

export default function Agenda() {
  const de = hoje(); const ate = somaDias(de, 30);
  const q = useQuery({ queryKey: ['agenda', de], queryFn: () => api<Row[]>(`/agenda?de=${de}&ate=${ate}`) });
  return (
    <div><Titulo>Agenda de encomendas</Titulo>
      {q.isLoading && <Carregando />}{q.data && !q.data.length && <Vazio>Nenhuma encomenda nos próximos 30 dias.</Vazio>}
      <div className="space-y-4">{q.data?.map((d) => (
        <section key={d.data} className="card"><div className="flex justify-between mb-2"><h3 className="font-display text-3xl text-gold">{new Date(`${d.data}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</h3>
          <span className="font-display text-2xl">{brl(d.totalPrevisto)}</span></div>
          {d.pedidos.map((p: Row) => <Link key={p.id} to={`/pedidos/${p.id}`} className="flex justify-between py-2 border-t border-white/5"><span>{hora(p.agendadoPara)} · #{num(p.numeroDia)} {p.nomeClienteSnapshot}</span><span>{brl(p.total)}</span></Link>)}
          <Link to={`/producao?data=${d.data}`} className="text-gold underline text-sm">ver produção do dia</Link></section>))}</div></div>
  );
}
