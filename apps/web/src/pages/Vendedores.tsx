import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, brl, hoje, num, type Row } from '../api';
import { Campo, Carregando, Erro, SeletorPeriodo, Titulo, Vazio } from '../components/ui';

const STATUS_LABEL: Record<string, string> = { pendente: 'Pendente', paga: 'Paga', cancelada: 'Cancelada' };
const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

function Cadastro({ vendedores }: { vendedores: Row[] }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['vendedores'] });
  const [novo, setNovo] = useState({ nome: '', codigo: '', tipoComissao: 'percentual', valorComissao: '' });
  const criar = useMutation({
    mutationFn: () => api('/vendedores', { method: 'POST', body: { ...novo, valorComissao: Number(novo.valorComissao.replace(',', '.') || 0) } }),
    onSuccess: () => { setNovo({ nome: '', codigo: '', tipoComissao: 'percentual', valorComissao: '' }); refresh(); },
  });
  const patch = useMutation({ mutationFn: ({ id, body }: { id: string; body: Row }) => api(`/vendedores/${id}`, { method: 'PATCH', body }), onSuccess: refresh });

  return (
    <section className="card space-y-2">
      <h3 className="font-label font-bold uppercase text-gold">Vendedores</h3>
      <p className="text-xs text-cream/60">Cada vendedor tem um código próprio. Ao atribuir um pedido a ele (em "Pedidos"), a comissão é calculada sozinha — % sobre o subtotal (sem taxa de entrega) ou um valor fixo por venda, conforme o tipo escolhido aqui.</p>
      <div className="grid gap-2 sm:grid-cols-5 items-end">
        <Campo label="Nome"><input placeholder="Nome do vendedor" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></Campo>
        <Campo label="Código"><input placeholder="Código do vendedor" value={novo.codigo} onChange={(e) => setNovo({ ...novo, codigo: e.target.value.toUpperCase() })} /></Campo>
        <Campo label="Tipo"><select value={novo.tipoComissao} onChange={(e) => setNovo({ ...novo, tipoComissao: e.target.value })}><option value="percentual">% sobre a venda</option><option value="fixo">Valor fixo (R$)</option></select></Campo>
        <Campo label={novo.tipoComissao === 'fixo' ? 'Valor (R$)' : 'Percentual (%)'}><input inputMode="decimal" placeholder="Valor da comissão" value={novo.valorComissao} onChange={(e) => setNovo({ ...novo, valorComissao: e.target.value })} /></Campo>
        <button className="btn" disabled={!novo.nome || !novo.codigo || criar.isPending} onClick={() => criar.mutate()}>Adicionar</button>
      </div>
      {criar.isError && <Erro e={criar.error} />}
      {!vendedores.length ? <Vazio>Nenhum vendedor cadastrado ainda.</Vazio> : (
        <div className="overflow-x-auto"><table className="w-full"><thead><tr>
          <th className="th">Nome</th><th className="th">Código</th><th className="th">Tipo</th><th className="th">Valor</th><th className="th">Ativo</th>
        </tr></thead><tbody>
          {vendedores.map((v) => (
            <tr key={v.id}>
              <td className="td">{v.nome}</td>
              <td className="td text-cream/60">{v.codigo}</td>
              <td className="td"><select className="!w-auto" defaultValue={v.tipoComissao} onChange={(e) => patch.mutate({ id: v.id, body: { tipoComissao: e.target.value } })}><option value="percentual">%</option><option value="fixo">R$ fixo</option></select></td>
              <td className="td"><input className="!w-24" inputMode="decimal" defaultValue={v.valorComissao} onBlur={(e) => Number(e.target.value.replace(',', '.')) !== Number(v.valorComissao) && patch.mutate({ id: v.id, body: { valorComissao: Number(e.target.value.replace(',', '.')) } })} /></td>
              <td className="td"><input type="checkbox" className="!w-6 !min-h-0" aria-label="Ativo" checked={v.ativo} onChange={(e) => patch.mutate({ id: v.id, body: { ativo: e.target.checked } })} /></td>
            </tr>
          ))}
        </tbody></table></div>
      )}
    </section>
  );
}

/** Tela de acompanhamento: vê vendas por vendedor e ajusta manualmente quando precisar — o sistema
 * calcula e nunca fecha (marca "paga") sozinho, isso é sempre uma ação do admin. */
function Acompanhamento({ vendedores }: { vendedores: Row[] }) {
  const qc = useQueryClient();
  const [de, setDe] = useState(diasAtras(30));
  const [ate, setAte] = useState(hoje());
  const [vendedorId, setVendedorId] = useState('');
  const [status, setStatus] = useState('');
  const qs = () => { const p = new URLSearchParams({ de, ate }); if (vendedorId) p.set('vendedorId', vendedorId); if (status) p.set('status', status); return p.toString(); };
  const resumo = useQuery({ queryKey: ['comissoes', 'resumo', de, ate], queryFn: () => api<Row[]>(`/comissoes/resumo?de=${de}&ate=${ate}`) });
  const lista = useQuery({ queryKey: ['comissoes', de, ate, vendedorId, status], queryFn: () => api<Row[]>(`/comissoes?${qs()}`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['comissoes'] }); };
  const ajustar = useMutation({ mutationFn: ({ id, body }: { id: string; body: Row }) => api(`/comissoes/${id}`, { method: 'PATCH', body }), onSuccess: refresh });

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-label font-bold uppercase text-gold">Acompanhamento de comissões</h3>
        <SeletorPeriodo de={de} ate={ate} onChange={({ de, ate }) => { setDe(de); setAte(ate); }} />
      </div>
      <div className="flex gap-2 flex-wrap">
        <select className="!w-auto" value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}><option value="">Todos os vendedores</option>{vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}</select>
        <select className="!w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos os status</option>{Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>

      {!!resumo.data?.length && (
        <div className="grid gap-2 sm:grid-cols-3">
          {resumo.data.map((r) => (
            <div key={r.vendedorId} className="rounded-lg bg-surface/60 p-3">
              <p className="font-label font-bold uppercase text-gold text-sm">{r.vendedorNome} <span className="text-cream/50">({r.vendedorCodigo})</span></p>
              <p className="text-sm text-cream/70">{r.qtd} venda(s)</p>
              <p className="text-sm">A pagar: <span className="text-primary-hover font-bold">{brl(r.pendente)}</span></p>
              <p className="text-sm text-cream/60">Já pago: {brl(r.pago)}</p>
            </div>
          ))}
        </div>
      )}

      {lista.isLoading && <Carregando />}
      {lista.data && !lista.data.length && <Vazio>Nenhuma comissão no período/filtro.</Vazio>}
      {!!lista.data?.length && (
        <div className="overflow-x-auto"><table className="w-full min-w-[800px]"><thead><tr>
          <th className="th">Data</th><th className="th">Pedido</th><th className="th">Cliente</th><th className="th">Vendedor</th>
          <th className="th text-right">Base</th><th className="th text-right">Calculado</th><th className="th text-right">Final</th>
          <th className="th">Status</th><th className="th">Motivo do ajuste</th>
        </tr></thead><tbody>
          {lista.data.map((c) => (
            <tr key={c.id}>
              <td className="td text-cream/60">{new Date(c.dataOperacao).toLocaleDateString('pt-BR')}</td>
              <td className="td">#{num(c.numeroDia)}</td>
              <td className="td text-cream/60">{c.cliente ?? '—'}</td>
              <td className="td">{c.vendedorNome}</td>
              <td className="td text-right text-cream/60">{brl(c.valorBase)}</td>
              <td className="td text-right">{brl(c.valorCalculado)}</td>
              <td className="td text-right">
                <input className="!w-20 text-right" inputMode="decimal" placeholder={brl(c.valorCalculado)} defaultValue={c.valorFinal ?? ''}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    const novo = v === '' ? null : Number(v.replace(',', '.'));
                    if (novo !== (c.valorFinal == null ? null : Number(c.valorFinal))) ajustar.mutate({ id: c.id, body: { valorFinal: novo } });
                  }} />
              </td>
              <td className="td"><select className="!w-auto" defaultValue={c.status} onChange={(e) => ajustar.mutate({ id: c.id, body: { status: e.target.value } })}>
                {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select></td>
              <td className="td"><input className="!w-40" placeholder="opcional" defaultValue={c.motivoAjuste ?? ''}
                onBlur={(e) => e.target.value !== (c.motivoAjuste ?? '') && ajustar.mutate({ id: c.id, body: { motivoAjuste: e.target.value || null } })} /></td>
            </tr>
          ))}
        </tbody></table></div>
      )}
      {ajustar.isError && <Erro e={ajustar.error} />}
    </section>
  );
}

export default function Vendedores() {
  const vends = useQuery({ queryKey: ['vendedores'], queryFn: () => api<Row[]>('/vendedores') });
  if (vends.isLoading) return <Carregando />;
  return (
    <div className="space-y-4">
      <Titulo>Vendedores e comissão</Titulo>
      <Cadastro vendedores={vends.data ?? []} />
      <Acompanhamento vendedores={vends.data ?? []} />
    </div>
  );
}
