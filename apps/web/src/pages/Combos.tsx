import { useQuery } from '@tanstack/react-query';
import { api, brlC, pct, type Row } from '../api';
import { Carregando, Titulo } from '../components/ui';

export default function Combos({ admin }: { admin: boolean }) {
  const q = useQuery({ queryKey: ['combos'], queryFn: () => api<Row[]>('/combos') });
  if (q.isLoading) return <Carregando />;
  return (
    <div className="space-y-4"><Titulo>Combos</Titulo>
      {q.data?.map((c) => (
        <section key={c.id} className="card space-y-3"><h3 className="font-display text-3xl text-gold">{c.nome}</h3>
          <p className="text-sm text-cream/70">{c.itens.map((i: Row) => `${Number(i.quantidade)}× ${i.nome}`).join(' · ')}</p>
          <div className="overflow-x-auto"><table className="w-full min-w-[480px]"><thead><tr><th className="th">Carne</th><th className="th text-right">Preço</th>{admin && <><th className="th text-right">Custo</th><th className="th text-right">Margem</th></>}<th className="th text-right">Avulso</th><th className="th text-right">Desconto</th></tr></thead>
            <tbody>{c.variantes.map((v: Row) => <tr key={v.id}><td className="td">{v.carne}</td><td className="td text-right font-display text-2xl text-gold">{brlC(v.precoCents)}</td>
              {admin && <><td className="td text-right">{brlC(v.custoCents)}</td><td className="td text-right">{v.margemCents == null ? '—' : `${brlC(v.margemCents)} · ${pct(v.margemPct)}`}</td></>}
              <td className="td text-right text-cream/60">{brlC(v.precoCheioAvulsoCents)}</td><td className="td text-right">{brlC(v.descontoCents)}</td></tr>)}</tbody></table></div></section>))}
    </div>
  );
}
