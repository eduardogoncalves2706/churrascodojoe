import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api, brl, num, type Row } from '../api';

/** Comanda P&B, 80 mm (térmica). Sem cores; imprime só o conteúdo. */
export default function Comanda() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['comanda', id], queryFn: () => api<Row>(`/pedidos/${id}/comanda`) });
  if (!q.data) return <p className="p-4">Carregando…</p>;
  const p = q.data;
  const dt = new Date(p.agendadoPara ?? p.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  return (
    <div className="bg-white min-h-screen">
      <div className="no-print p-3 flex gap-2 bg-bg"><button className="btn" onClick={() => window.print()}>Imprimir</button></div>
      <div className="comanda mx-auto p-3 text-black bg-white" style={{ width: '80mm', fontSize: '13px', lineHeight: 1.3 }}>
        <p className="text-center font-bold text-lg tracking-widest">CHURRASCO DO JOE</p>
        <p className="text-center font-bold" style={{ fontSize: '44px', lineHeight: 1 }}>#{num(p.numeroDia)}</p>
        <p className="text-center">{dt}{p.agendadoPara ? ' (ENCOMENDA)' : ''}</p>
        <hr className="border-black my-2" />
        <p className="font-bold">{p.nomeClienteSnapshot ?? 'Balcão'}</p>{p.telefoneSnapshot && <p>{p.telefoneSnapshot}</p>}
        <p className="font-bold uppercase">{p.tipo}</p>
        {p.tipo === 'entrega' && <p>{p.enderecoTexto} — {p.bairro}{p.referencia ? ` (${p.referencia})` : ''}</p>}
        <hr className="border-black my-2" />
        {p.itens.map((i: Row) => <div key={i.id} className="mb-1"><p className="font-bold">{Number(i.quantidade)}× {i.descricaoSnapshot}</p>
          {i.escolhas?.composicao?.map((c: Row, idx: number) => <p key={idx}>&nbsp;&nbsp;· {c.quantidade}× {c.nome}</p>)}
          {i.observacao && <p>&nbsp;&nbsp;» {i.observacao}</p>}</div>)}
        <hr className="border-black my-2" />
        {Number(p.desconto) > 0 && <p>Desconto: −{brl(p.desconto)}</p>}{p.tipo === 'entrega' && <p>Entrega: {brl(p.taxaEntrega)}</p>}
        <p className="font-bold text-lg">TOTAL: {brl(p.total)}</p>
        <p>Pagamento: {p.statusPagamento === 'pago' ? `PAGO (${p.pagamentos.map((x: Row) => x.forma).join(', ')})` : 'A RECEBER'}</p>
        {p.trocoPara && <p>Troco para: {brl(p.trocoPara)}</p>}{p.observacoes && <p>Obs.: {p.observacoes}</p>}
        {p.tipo === 'entrega' && <p className="mt-3">Motoboy: ______________________</p>}
      </div>
    </div>
  );
}
