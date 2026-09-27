import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, brl, type Row } from '../api';
import { Carregando, Titulo, Vazio } from '../components/ui';

export default function Clientes() {
  const [busca, setBusca] = useState('');
  const [inativos, setInativos] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['clientes', busca, inativos], queryFn: () => api<Row[]>(`/clientes?busca=${encodeURIComponent(busca)}${inativos ? '&inativoDias=30' : ''}`) });
  const ped = useQuery({ queryKey: ['cliente-pedidos', aberto], queryFn: () => api<Row[]>(`/clientes/${aberto}/pedidos`), enabled: !!aberto });
  return (
    <div className="space-y-3"><Titulo>Clientes</Titulo>
      <div className="flex gap-2 flex-wrap"><input className="flex-1" placeholder="Buscar por nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <label className="flex items-center gap-2 normal-case"><input type="checkbox" className="!w-5 !min-h-0" checked={inativos} onChange={(e) => setInativos(e.target.checked)} />Sem pedir há +30 dias</label></div>
      {q.isLoading && <Carregando />}{q.data && !q.data.length && <Vazio>Nenhum cliente.</Vazio>}
      {q.data?.map((c) => (
        <div key={c.id} className="card"><button className="w-full text-left flex justify-between gap-2" onClick={() => setAberto(aberto === c.id ? null : c.id)}>
          <span><b>{c.nome}</b> <span className="text-cream/60">{c.telefone}</span></span><span className="text-gold text-sm">{c.qtdPedidos} pedidos · {brl(c.totalGasto)}{c.ultimoPedido && ` · último ${c.ultimoPedido}`}</span></button>
          {c.observacoes && <p className="text-sm text-gold">{c.observacoes}</p>}
          {aberto === c.id && <div className="mt-2 border-t border-white/10 pt-2">{ped.data?.map((p) => <p key={p.id} className="text-sm">{p.dataOperacao} · #{p.numeroDia} · {brl(p.total)} · {p.status}</p>)}</div>}</div>))}
    </div>
  );
}
