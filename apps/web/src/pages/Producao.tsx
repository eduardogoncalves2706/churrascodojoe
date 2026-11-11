import { useQuery } from '@tanstack/react-query';
import { formatQtd } from '@joe/shared';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, hoje, type Row } from '../api';
import { Carregando, SeletorData, Titulo, Vazio } from '../components/ui';

export default function Producao() {
  const [sp] = useSearchParams();
  const [data, setData] = useState(sp.get('data') ?? hoje());
  const [copiado, setCopiado] = useState(false);
  const q = useQuery({ queryKey: ['producao', data], queryFn: () => api<Row>(`/producao?data=${data}`), refetchInterval: 30_000 });

  // "Em estoque" e "a comprar" vêm do módulo Estoque de verdade (lotes registrados lá) — não é
  // mais digitado na hora e perdido ao recarregar a página.
  const compras = (q.data?.insumos ?? []).filter((i: Row) => i.aComprar > 0);
  const copiar = async () => {
    await navigator.clipboard.writeText(`Lista de compras — ${data}\n` + compras.map((i: Row) => `• ${i.nome}: ${i.aComprar} ${i.unidade}`).join('\n'));
    setCopiado(true); setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div className="space-y-4"><Titulo extra={<SeletorData value={data} onChange={setData} />}>Produção do dia</Titulo>
      {q.isLoading && <Carregando />}{q.data && !q.data.pedidos && <Vazio>Sem pedidos para esta data.</Vazio>}
      {q.data && q.data.pedidos > 0 && <>
        <section className="card"><h3 className="font-label font-bold uppercase text-gold mb-2">A preparar ({q.data.pedidos} pedidos)</h3>
          <table className="w-full"><tbody>{q.data.produtos.map((p: Row) => <tr key={p.produtoId}><td className="td">{p.nome}</td><td className="td text-right font-display text-3xl text-gold">{formatQtd(p.quantidade)}</td><td className="td text-cream/60 w-20">{p.unidade}</td></tr>)}</tbody></table></section>
        <section className="card"><div className="flex justify-between items-center mb-2"><h3 className="font-label font-bold uppercase text-gold">Insumos necessários</h3><Link to="/estoque" className="text-gold underline text-sm">registrar compra</Link></div>
          <table className="w-full"><thead><tr><th className="th">Insumo</th><th className="th text-right">Precisa</th><th className="th text-right">Em estoque</th></tr></thead><tbody>
            {q.data.insumos.map((i: Row) => <tr key={i.insumoId}><td className="td">{i.nome}</td><td className="td text-right">{i.quantidade} {i.unidade}</td>
              <td className={`td text-right ${i.aComprar > 0 ? 'text-brasa' : 'text-ok'}`}>{i.estoqueAtual} {i.unidade}</td></tr>)}</tbody></table></section>
        <section className="card space-y-2"><div className="flex justify-between items-center"><h3 className="font-label font-bold uppercase text-gold">Lista de compras</h3><button className="btn" onClick={copiar} disabled={!compras.length}>{copiado ? 'Copiado!' : 'Copiar'}</button></div>
          {compras.length ? compras.map((i: Row) => <p key={i.insumoId}>• {i.nome}: <b>{i.aComprar}</b> {i.unidade}</p>) : <p className="text-cream/60">Nada a comprar — estoque cobre a necessidade do dia.</p>}</section></>}
    </div>
  );
}
