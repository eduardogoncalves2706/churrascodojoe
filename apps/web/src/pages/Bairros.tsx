import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type Row } from '../api';
import { Titulo } from '../components/ui';

export default function Bairros() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['bairros'], queryFn: () => api<Row[]>('/bairros') });
  const [novo, setNovo] = useState({ nome: '', cidade: 'Canoas', taxaEntrega: '' });
  const refresh = () => qc.invalidateQueries({ queryKey: ['bairros'] });
  const criar = useMutation({ mutationFn: () => api('/bairros', { method: 'POST', body: { ...novo, taxaEntrega: Number(novo.taxaEntrega.replace(',', '.') || 0) } }), onSuccess: () => { setNovo({ nome: '', cidade: 'Canoas', taxaEntrega: '' }); refresh(); } });
  const patch = useMutation({ mutationFn: ({ id, body }: { id: string; body: Row }) => api(`/bairros/${id}`, { method: 'PATCH', body }), onSuccess: refresh });
  return (
    <div className="space-y-4"><Titulo>Bairros e taxas</Titulo>
      <div className="card grid gap-2 sm:grid-cols-4 items-end"><div><label>Bairro</label><input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></div>
        <div><label>Cidade</label><input value={novo.cidade} onChange={(e) => setNovo({ ...novo, cidade: e.target.value })} /></div>
        <div><label>Taxa (R$)</label><input inputMode="decimal" value={novo.taxaEntrega} onChange={(e) => setNovo({ ...novo, taxaEntrega: e.target.value })} /></div>
        <button className="btn" disabled={!novo.nome} onClick={() => criar.mutate()}>Adicionar</button></div>
      <div className="card"><table className="w-full"><thead><tr><th className="th">Bairro</th><th className="th">Cidade</th><th className="th">Taxa</th><th className="th">Atende</th></tr></thead><tbody>
        {q.data?.map((b) => <tr key={b.id}><td className="td">{b.nome}</td><td className="td">{b.cidade}</td>
          <td className="td"><input className="!w-24" inputMode="decimal" defaultValue={b.taxaEntrega} onBlur={(e) => Number(e.target.value) !== Number(b.taxaEntrega) && patch.mutate({ id: b.id, body: { taxaEntrega: Number(e.target.value.replace(',', '.')) } })} /></td>
          <td className="td"><input type="checkbox" className="!w-6 !min-h-0" checked={b.atende} onChange={(e) => patch.mutate({ id: b.id, body: { atende: e.target.checked } })} /></td></tr>)}</tbody></table></div></div>
  );
}
