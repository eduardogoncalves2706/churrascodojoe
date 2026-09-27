import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type Row } from '../api';
import { Campo, Carregando, Erro, Titulo, Vazio } from '../components/ui';

const STATUS_LABEL: Record<string, string> = {
  FORCE_CHANGE_PASSWORD: 'Aguardando 1º login', CONFIRMED: 'Ativo', UNCONFIRMED: 'Convite pendente', ARCHIVED: 'Arquivado', COMPROMISED: 'Comprometido', RESET_REQUIRED: 'Precisa redefinir senha',
};

export default function Usuarios() {
  const qc = useQueryClient();
  const [novo, setNovo] = useState({ nome: '', email: '', papel: 'operador' });
  const q = useQuery({ queryKey: ['usuarios'], queryFn: () => api<Row[]>('/usuarios') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['usuarios'] });
  const convidar = useMutation({ mutationFn: () => api('/usuarios', { method: 'POST', body: novo }), onSuccess: () => { setNovo({ nome: '', email: '', papel: 'operador' }); refresh(); } });
  const patch = useMutation({ mutationFn: ({ email, body }: { email: string; body: Row }) => api(`/usuarios/${encodeURIComponent(email)}`, { method: 'PATCH', body }), onSuccess: refresh });
  const [reenviado, setReenviado] = useState<string | null>(null);
  const reenviar = useMutation({ mutationFn: (email: string) => api(`/usuarios/${encodeURIComponent(email)}/reenviar`, { method: 'POST' }), onSuccess: (_r, email) => { setReenviado(email); setTimeout(() => setReenviado(null), 3000); } });

  return (
    <div className="space-y-4">
      <Titulo>Usuários</Titulo>
      <div className="card space-y-3">
        <h3 className="font-label font-bold uppercase text-gold">Convidar usuário</h3>
        <p className="text-sm text-cream/60">A pessoa recebe uma senha temporária por e-mail e troca no primeiro acesso.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <Campo label="Nome"><input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></Campo>
          <Campo label="E-mail"><input type="email" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} /></Campo>
          <Campo label="Papel"><select value={novo.papel} onChange={(e) => setNovo({ ...novo, papel: e.target.value })}><option value="operador">Operador (atendente)</option><option value="admin">Admin (sócio)</option></select></Campo>
        </div>
        <button className="btn" disabled={!novo.nome || !novo.email || convidar.isPending} onClick={() => convidar.mutate()}>{convidar.isPending ? 'Convidando…' : 'Convidar'}</button>
        {convidar.isError && <Erro e={convidar.error} />}
      </div>

      {q.isLoading && <Carregando />}
      {q.isError && <Erro e={q.error} />}
      {q.data && !q.data.length && <Vazio>Nenhum usuário ainda.</Vazio>}
      {q.data && q.data.length > 0 && <div className="card overflow-x-auto"><table className="w-full min-w-[560px]"><thead><tr><th className="th">Nome</th><th className="th">E-mail</th><th className="th">Papel</th><th className="th">Status</th><th className="th">Ativo</th><th className="th" /></tr></thead>
        <tbody>{q.data.map((u) => (
          <tr key={u.sub} className={u.ativo ? '' : 'opacity-50'}>
            <td className="td">{u.nome}</td><td className="td text-cream/60">{u.email}</td>
            <td className="td"><select value={u.papel} onChange={(e) => patch.mutate({ email: u.email, body: { papel: e.target.value } })}><option value="operador">Operador</option><option value="admin">Admin</option></select></td>
            <td className="td text-sm">{STATUS_LABEL[u.status] ?? u.status}</td>
            <td className="td"><input type="checkbox" className="!w-6 !min-h-0" checked={u.ativo} onChange={(e) => patch.mutate({ email: u.email, body: { ativo: e.target.checked } })} /></td>
            <td className="td">{u.status === 'FORCE_CHANGE_PASSWORD' && <button className="text-gold underline text-sm" onClick={() => reenviar.mutate(u.email)}>{reenviado === u.email ? 'enviado!' : 'reenviar convite'}</button>}</td>
          </tr>))}</tbody></table></div>}
    </div>
  );
}
