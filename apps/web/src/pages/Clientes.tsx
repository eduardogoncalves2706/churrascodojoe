import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, brl, type Row } from '../api';
import { Campo, Carregando, Erro, Titulo, Vazio } from '../components/ui';

interface Form {
  id?: string; nome: string; telefone: string; instagram: string; observacoes: string; temEndereco: boolean;
  logradouro: string; numero: string; complemento: string; bairroId: string; referencia: string;
}
const FORM_VAZIO: Form = { nome: '', telefone: '', instagram: '', observacoes: '', temEndereco: false, logradouro: '', numero: '', complemento: '', bairroId: '', referencia: '' };

function FormCliente({ inicial, onSalvo, onCancelar }: { inicial: Form; onSalvo: () => void; onCancelar: () => void }) {
  const [f, setF] = useState(inicial);
  const [achou, setAchou] = useState(false);
  const up = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));
  const bairros = useQuery({ queryKey: ['bairros'], queryFn: () => api<Row[]>('/bairros') });

  // Sem edição em curso: se o telefone digitado já é de um cliente, passa a editar esse cliente (não duplica).
  const digitos = f.telefone.replace(/\D/g, '');
  useEffect(() => {
    if (inicial.id || digitos.length < 10) { setAchou(false); return; }
    const t = setTimeout(async () => {
      try {
        const c = await api<Row>(`/clientes/por-telefone/${digitos}`);
        const e = c.enderecos?.find((x: Row) => x.principal) ?? c.enderecos?.[0];
        setF({
          id: c.id, nome: c.nome, telefone: c.telefone ?? '', instagram: c.instagram ?? '', observacoes: c.observacoes ?? '',
          temEndereco: !!e, logradouro: e?.logradouro ?? '', numero: e?.numero ?? '', complemento: e?.complemento ?? '', bairroId: e?.bairroId ?? '', referencia: e?.referencia ?? '',
        });
        setAchou(true);
      } catch { setAchou(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [digitos, inicial.id]);

  const salvar = useMutation({
    mutationFn: async () => {
      const body = { nome: f.nome, telefone: f.telefone || undefined, instagram: f.instagram || null, observacoes: f.observacoes || null };
      const cliente = f.id
        ? await api<Row>(`/clientes/${f.id}`, { method: 'PATCH', body })
        : await api<Row>('/clientes', { method: 'POST', body });
      if (f.temEndereco && f.logradouro) {
        await api(`/clientes/${cliente.id}/enderecos`, { method: 'POST', body: {
          logradouro: f.logradouro, numero: f.numero || undefined, complemento: f.complemento || undefined, bairroId: f.bairroId || undefined, referencia: f.referencia || undefined, principal: true,
        } });
      }
      return cliente;
    },
    onSuccess: onSalvo,
  });

  return (
    <div className="card space-y-3">
      <h3 className="font-label font-bold uppercase text-gold">{f.id ? 'Editar cliente' : 'Novo cliente'}</h3>
      {achou && !inicial.id && <p className="text-sm text-primary-hover">Esse telefone já é de {f.nome} — os dados abaixo são dele, e salvar atualiza o cadastro (não duplica).</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <Campo label="Nome"><input value={f.nome} onChange={(e) => up({ nome: e.target.value })} /></Campo>
        <Campo label="Telefone (opcional)"><input inputMode="tel" placeholder="(51) 99999-9999" value={f.telefone} onChange={(e) => up({ telefone: e.target.value })} /></Campo>
        <Campo label="Instagram (opcional)"><input value={f.instagram} onChange={(e) => up({ instagram: e.target.value })} /></Campo>
        <Campo label="Observações (opcional)"><input value={f.observacoes} onChange={(e) => up({ observacoes: e.target.value })} placeholder="ex.: gosta mal passada" /></Campo>
      </div>
      <label className="flex items-center gap-2 normal-case"><input type="checkbox" className="!w-5 !min-h-0" checked={f.temEndereco} onChange={(e) => up({ temEndereco: e.target.checked })} />Cadastrar endereço</label>
      {f.temEndereco && <div className="grid gap-2 sm:grid-cols-2">
        <Campo label="Endereço"><input value={f.logradouro} onChange={(e) => up({ logradouro: e.target.value })} placeholder="Rua" /></Campo>
        <Campo label="Número"><input value={f.numero} onChange={(e) => up({ numero: e.target.value })} /></Campo>
        <Campo label="Complemento"><input value={f.complemento} onChange={(e) => up({ complemento: e.target.value })} /></Campo>
        <Campo label="Bairro"><select value={f.bairroId} onChange={(e) => up({ bairroId: e.target.value })}><option value="">Selecione…</option>{bairros.data?.map((b) => <option key={b.id} value={b.id}>{b.nome} — {b.cidade}</option>)}</select></Campo>
        <Campo label="Referência"><input value={f.referencia} onChange={(e) => up({ referencia: e.target.value })} /></Campo>
      </div>}
      <div className="flex gap-2">
        <button className="btn" disabled={!f.nome.trim() || salvar.isPending} onClick={() => salvar.mutate()}>{salvar.isPending ? 'Salvando…' : 'Salvar'}</button>
        <button className="btn-ghost" onClick={onCancelar}>Cancelar</button>
      </div>
      {salvar.isError && <Erro e={salvar.error} />}
    </div>
  );
}

export default function Clientes() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [inativos, setInativos] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const q = useQuery({ queryKey: ['clientes', busca, inativos], queryFn: () => api<Row[]>(`/clientes?busca=${encodeURIComponent(busca)}${inativos ? '&inativoDias=30' : ''}`) });
  const ped = useQuery({ queryKey: ['cliente-pedidos', aberto], queryFn: () => api<Row[]>(`/clientes/${aberto}/pedidos`), enabled: !!aberto });

  const editar = async (c: Row) => {
    const det = await api<Row>(`/clientes/${c.id}`);
    const e = det.enderecos?.find((x: Row) => x.principal) ?? det.enderecos?.[0];
    setForm({
      id: det.id, nome: det.nome, telefone: det.telefone ?? '', instagram: det.instagram ?? '', observacoes: det.observacoes ?? '',
      temEndereco: !!e, logradouro: e?.logradouro ?? '', numero: e?.numero ?? '', complemento: e?.complemento ?? '', bairroId: e?.bairroId ?? '', referencia: e?.referencia ?? '',
    });
  };
  const fechar = () => { setForm(null); qc.invalidateQueries({ queryKey: ['clientes'] }); };

  return (
    <div className="space-y-3">
      <Titulo extra={<button className="btn" onClick={() => setForm(FORM_VAZIO)}>+ Novo cliente</button>}>Clientes</Titulo>
      {form && <FormCliente inicial={form} onSalvo={fechar} onCancelar={() => setForm(null)} />}
      <div className="flex gap-2 flex-wrap"><input className="flex-1" placeholder="Buscar por nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <label className="flex items-center gap-2 normal-case"><input type="checkbox" className="!w-5 !min-h-0" checked={inativos} onChange={(e) => setInativos(e.target.checked)} />Sem pedir há +30 dias</label></div>
      {q.isLoading && <Carregando />}{q.data && !q.data.length && <Vazio>Nenhum cliente.</Vazio>}
      {q.data?.map((c) => (
        <div key={c.id} className="card">
          <div className="flex justify-between gap-2">
            <button className="flex-1 text-left" onClick={() => setAberto(aberto === c.id ? null : c.id)}>
              <span><b>{c.nome}</b> <span className="text-cream/60">{c.telefone ?? 'sem telefone'}</span></span><br />
              <span className="text-gold text-sm">{c.qtdPedidos} pedidos · {brl(c.totalGasto)}{c.ultimoPedido && ` · último ${c.ultimoPedido}`}</span>
            </button>
            <button className="text-gold underline text-sm shrink-0" onClick={() => editar(c)}>editar</button>
          </div>
          {c.observacoes && <p className="text-sm text-gold">{c.observacoes}</p>}
          {aberto === c.id && <div className="mt-2 border-t border-white/10 pt-2">{ped.data?.map((p) => <p key={p.id} className="text-sm">{p.dataOperacao} · #{p.numeroDia} · {brl(p.total)} · {p.status}</p>)}</div>}
        </div>))}
    </div>
  );
}
