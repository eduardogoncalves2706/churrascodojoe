import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, hoje, type Row } from '../api';
import { Carregando, Titulo, Vazio } from '../components/ui';

export default function Producao() {
  const [sp] = useSearchParams();
  const [data, setData] = useState(sp.get('data') ?? hoje());
  const [estoque, setEstoque] = useState<Record<string, string>>({});
  const [copiado, setCopiado] = useState(false);
  const q = useQuery({ queryKey: ['producao', data], queryFn: () => api<Row>(`/producao?data=${data}`), refetchInterval: 30_000 });

  const compras = (q.data?.insumos ?? []).map((i: Row) => ({ ...i, comprar: Math.max(0, Math.ceil((i.quantidade - Number(estoque[i.insumoId] || 0)) * 10) / 10) })).filter((i: Row) => i.comprar > 0);
  const copiar = async () => {
    await navigator.clipboard.writeText(`Lista de compras — ${data}\n` + compras.map((i: Row) => `• ${i.nome}: ${i.comprar} ${i.unidade}`).join('\n'));
    setCopiado(true); setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div className="space-y-4"><Titulo extra={<input type="date" className="!w-auto" value={data} onChange={(e) => setData(e.target.value)} />}>Produção do dia</Titulo>
      {q.isLoading && <Carregando />}{q.data && !q.data.pedidos && <Vazio>Sem pedidos para esta data.</Vazio>}
      {q.data && q.data.pedidos > 0 && <>
        <section className="card"><h3 className="font-label font-bold uppercase text-gold mb-2">A preparar ({q.data.pedidos} pedidos)</h3>
          <table className="w-full"><tbody>{q.data.produtos.map((p: Row) => <tr key={p.produtoId}><td className="td">{p.nome}</td><td className="td text-right font-display text-3xl text-gold">{p.quantidade}</td><td className="td text-cream/60 w-20">{p.unidade}</td></tr>)}</tbody></table></section>
        <section className="card"><h3 className="font-label font-bold uppercase text-gold mb-2">Insumos necessários</h3>
          <table className="w-full"><thead><tr><th className="th">Insumo</th><th className="th text-right">Precisa</th><th className="th">Em estoque</th></tr></thead><tbody>
            {q.data.insumos.map((i: Row) => <tr key={i.insumoId}><td className="td">{i.nome}</td><td className="td text-right">{i.quantidade} {i.unidade}</td>
              <td className="td"><input className="!w-24" inputMode="decimal" value={estoque[i.insumoId] ?? ''} onChange={(e) => setEstoque({ ...estoque, [i.insumoId]: e.target.value.replace(',', '.') })} /></td></tr>)}</tbody></table></section>
        <section className="card space-y-2"><div className="flex justify-between items-center"><h3 className="font-label font-bold uppercase text-gold">Lista de compras</h3><button className="btn" onClick={copiar} disabled={!compras.length}>{copiado ? 'Copiado!' : 'Copiar'}</button></div>
          {compras.length ? compras.map((i: Row) => <p key={i.insumoId}>• {i.nome}: <b>{i.comprar}</b> {i.unidade}</p>) : <p className="text-cream/60">Nada a comprar.</p>}</section></>}
    </div>
  );
}
