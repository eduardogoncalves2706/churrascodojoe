import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api, brl, brlC, hoje, pct, type Row } from '../api';
import { Campo, Carregando, Erro, SeletorPeriodo, Titulo, Vazio } from '../components/ui';

const GRUPO_LABEL: Record<string, string> = {
  receita_vendas: 'Receita de vendas', outras_receitas: 'Outras receitas', cmv: 'CMV (custo direto)', custo_indireto: 'Custo indireto (rateado)',
  pessoal: 'Pessoal', entrega: 'Entrega', ocupacao: 'Ocupação', utilidades: 'Utilidades', marketing: 'Marketing', taxas: 'Taxas',
  impostos: 'Impostos', investimento: 'Investimento', aporte_socio: 'Aporte de sócio', retirada_socio: 'Retirada de sócio',
  reserva: 'Reserva', transferencia: 'Transferência', nao_classificado: 'A classificar',
};

function mesAtual() { return hoje().slice(0, 7); }
function primeiroDiaDoMes() { return `${mesAtual()}-01`; }

function Conciliacao({ contas }: { contas: Row[] }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [contaId, setContaId] = useState('');
  const [resultado, setResultado] = useState<Row | null>(null);
  const importar = useMutation({
    mutationFn: async (ofx: string) => api<Row>('/importar-extrato', { method: 'POST', body: { ofx, contaId } }),
    onSuccess: (r) => { setResultado(r); qc.invalidateQueries({ queryKey: ['lancamentos'] }); },
  });
  const escolherArquivo = async (file: File) => importar.mutate(await file.text());

  return (
    <section className="card space-y-2">
      <h3 className="font-label font-bold uppercase text-gold">Conciliar extrato (ex.: Stone)</h3>
      <p className="text-xs text-cream/60">Exporta o extrato em formato OFX no app do banco/maquininha e importa aqui — cada movimentação vira um lançamento "a classificar" (não entra no DRE até você escolher a categoria certa). Reimportar o mesmo arquivo não duplica.</p>
      <div className="flex gap-2 flex-wrap items-center">
        <select className="!w-auto" value={contaId} onChange={(e) => setContaId(e.target.value)}><option value="">Conta…</option>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
        <input ref={fileRef} type="file" accept=".ofx,.xml,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && escolherArquivo(e.target.files[0])} />
        <button className="btn-ghost" disabled={!contaId || importar.isPending} onClick={() => fileRef.current?.click()}>{importar.isPending ? 'Importando…' : 'Escolher arquivo OFX'}</button>
      </div>
      {importar.isError && <Erro e={importar.error} />}
      {resultado && <p className="text-sm text-gold">{resultado.importados} lançamento(s) novo(s) importado(s){resultado.duplicados > 0 && ` · ${resultado.duplicados} já existiam`}.</p>}
    </section>
  );
}

function AClassificar({ categorias }: { categorias: Row[] }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['lancamentos', 'a-classificar'], queryFn: () => api<Row[]>('/lancamentos?status=realizado') });
  const pendentes = (q.data ?? []).filter((l) => l.grupoDre === 'nao_classificado');
  const reclassificar = useMutation({
    mutationFn: ({ id, categoriaId }: { id: string; categoriaId: string }) => api(`/lancamentos/${id}`, { method: 'PATCH', body: { categoriaId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lancamentos'] }),
  });
  if (!pendentes.length) return null;
  return (
    <section className="card space-y-2 border-2 border-primary">
      <h3 className="font-label font-bold uppercase text-primary-hover">🔔 A classificar ({pendentes.length})</h3>
      <div className="space-y-2">
        {pendentes.map((l) => (
          <div key={l.id} className="flex gap-2 items-center flex-wrap border-t border-white/5 pt-2">
            <span className="flex-1 min-w-[160px]">{l.descricao} <span className="text-cream/60 text-sm">· {new Date(l.dataCompetencia).toLocaleDateString('pt-BR')} · {l.tipo === 'entrada' ? '+' : '-'}{brl(l.valor)}</span></span>
            <select className="!w-auto" defaultValue="" onChange={(e) => e.target.value && reclassificar.mutate({ id: l.id, categoriaId: e.target.value })}>
              <option value="">Escolher categoria…</option>
              {categorias.filter((c) => c.tipo === l.tipo && c.grupoDre !== 'nao_classificado').map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
        ))}
      </div>
    </section>
  );
}

function NovoLancamento({ categorias, contas, onSalvo }: { categorias: Row[]; contas: Row[]; onSalvo: () => void }) {
  const [f, setF] = useState({ tipo: 'saida', categoriaId: '', contaId: '', descricao: '', valor: '', dataVencimento: hoje(), status: 'previsto' });
  const salvar = useMutation({
    mutationFn: () => api('/lancamentos', { method: 'POST', body: {
      tipo: f.tipo, categoriaId: f.categoriaId, contaId: f.contaId, descricao: f.descricao,
      valor: Number(f.valor.replace(',', '.')), dataCompetencia: f.dataVencimento, dataVencimento: f.dataVencimento, status: f.status,
    } }),
    onSuccess: () => { setF({ tipo: 'saida', categoriaId: '', contaId: '', descricao: '', valor: '', dataVencimento: hoje(), status: 'previsto' }); onSalvo(); },
  });
  const categoriasDoTipo = categorias.filter((c) => c.tipo === f.tipo && c.grupoDre !== 'nao_classificado');
  return (
    <section className="card space-y-2">
      <h3 className="font-label font-bold uppercase text-gold">Novo lançamento</h3>
      <div className="grid gap-2 sm:grid-cols-3">
        <Campo label="Tipo"><select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value, categoriaId: '' })}><option value="saida">Saída</option><option value="entrada">Entrada</option></select></Campo>
        <Campo label="Categoria"><select value={f.categoriaId} onChange={(e) => setF({ ...f, categoriaId: e.target.value })}><option value="">Escolha…</option>{categoriasDoTipo.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
        <Campo label="Conta"><select value={f.contaId} onChange={(e) => setF({ ...f, contaId: e.target.value })}><option value="">Escolha…</option>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
        <Campo label="Descrição"><input value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></Campo>
        <Campo label="Valor"><input inputMode="decimal" placeholder="R$" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></Campo>
        <Campo label="Vencimento"><input type="date" value={f.dataVencimento} onChange={(e) => setF({ ...f, dataVencimento: e.target.value })} /></Campo>
        <Campo label="Status"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="previsto">Previsto</option><option value="realizado">Já pago/recebido</option></select></Campo>
      </div>
      <button className="btn" disabled={!f.categoriaId || !f.contaId || !f.descricao || !f.valor || salvar.isPending} onClick={() => salvar.mutate()}>Salvar</button>
      {salvar.isError && <Erro e={salvar.error} />}
    </section>
  );
}

function FluxoCaixa({ categorias, contas }: { categorias: Row[]; contas: Row[] }) {
  const qc = useQueryClient();
  const [de, setDe] = useState(primeiroDiaDoMes());
  const [ate, setAte] = useState(hoje());
  const q = useQuery({ queryKey: ['lancamentos', de, ate], queryFn: () => api<Row[]>(`/lancamentos?de=${de}&ate=${ate}`) });
  const pagar = useMutation({ mutationFn: (id: string) => api(`/lancamentos/${id}/pagar`, { method: 'POST', body: {} }), onSuccess: () => qc.invalidateQueries({ queryKey: ['lancamentos'] }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['lancamentos'] });

  const total = (lista: Row[], tipo: string) => lista.filter((l) => l.tipo === tipo && l.status === 'realizado').reduce((a, l) => a + Number(l.valor), 0);
  const entradas = total(q.data ?? [], 'entrada'); const saidas = total(q.data ?? [], 'saida');

  return (
    <section className="space-y-3">
      <div className="card space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-label font-bold uppercase text-gold">Fluxo de caixa</h3>
          <SeletorPeriodo de={de} ate={ate} onChange={({ de, ate }) => { setDe(de); setAte(ate); }} />
        </div>
        <p className="text-gold font-label uppercase">Entradas {brlC(Math.round(entradas * 100))} · Saídas {brlC(Math.round(saidas * 100))} · Saldo <span className={entradas - saidas >= 0 ? 'text-ok' : 'text-brasa'}>{brlC(Math.round((entradas - saidas) * 100))}</span></p>
        {q.isLoading && <Carregando />}
        {q.data && !q.data.length && <Vazio>Nenhum lançamento no período.</Vazio>}
        <div className="overflow-x-auto"><table className="w-full min-w-[640px]"><thead><tr>
          <th className="th">Data</th><th className="th">Descrição</th><th className="th">Categoria</th><th className="th">Conta</th><th className="th text-right">Valor</th><th className="th">Status</th><th className="th"></th>
        </tr></thead><tbody>
          {q.data?.map((l) => (
            <tr key={l.id}>
              <td className="td text-cream/60">{new Date(l.dataVencimento).toLocaleDateString('pt-BR')}</td>
              <td className="td">{l.descricao}</td>
              <td className="td text-cream/60">{l.categoria}</td>
              <td className="td text-cream/60">{l.conta}</td>
              <td className={`td text-right ${l.tipo === 'entrada' ? 'text-ok' : ''}`}>{l.tipo === 'entrada' ? '+' : '-'}{brl(l.valor)}</td>
              <td className="td">{l.status === 'realizado' ? '✔ pago' : l.status === 'cancelado' ? 'cancelado' : 'previsto'}</td>
              <td className="td">{l.status === 'previsto' && <button className="text-gold underline text-sm" onClick={() => pagar.mutate(l.id)}>marcar pago</button>}</td>
            </tr>
          ))}
        </tbody></table></div>
      </div>
      <NovoLancamento categorias={categorias} contas={contas} onSalvo={refresh} />
    </section>
  );
}

function Dre() {
  const [mes, setMes] = useState(mesAtual());
  const q = useQuery({ queryKey: ['dre', mes], queryFn: () => api<Row>(`/dre?mes=${mes}`) });
  if (q.isLoading) return <Carregando />;
  const d = q.data;
  if (!d) return null;
  const linha = (label: string, cents: number, destaque = false) => (
    <div className={`flex justify-between py-1 border-t border-white/5 ${destaque ? 'font-bold text-gold' : ''}`}><span>{label}</span><span>{brlC(Math.round(cents * 100))}</span></div>
  );
  return (
    <section className="card space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-label font-bold uppercase text-gold">DRE mensal</h3>
        <input type="month" className="!w-auto" value={mes} onChange={(e) => setMes(e.target.value)} />
      </div>
      {linha('Receita de vendas', d.receita)}
      {d.outrasReceitas > 0 && linha('Outras receitas', d.outrasReceitas)}
      {linha('(–) CMV (custo direto)', -d.cmvDireto)}
      {linha('(–) Custo indireto (rateado)', -d.custoIndireto)}
      {linha('= Margem de contribuição', d.margemContribuicao, true)}
      {linha('(–) Despesas operacionais', -d.despesasOperacionais)}
      {linha('= Resultado operacional', d.resultadoOperacional, true)}
      {d.receita > 0 && <p className="text-xs text-cream/60 pt-1">Margem sobre receita: {pct((d.resultadoOperacional / d.receita) * 100)}</p>}
      <details className="pt-2"><summary className="cursor-pointer text-sm text-gold">Detalhe por grupo</summary>
        <div className="pt-2 space-y-1 text-sm">{Object.entries(d.porGrupo as Record<string, number>).filter(([, v]) => v !== 0).map(([g, v]) => (
          <div key={g} className="flex justify-between text-cream/70"><span>{GRUPO_LABEL[g] ?? g}</span><span>{brlC(Math.round(v * 100))}</span></div>
        ))}</div>
      </details>
    </section>
  );
}

export default function Financeiro() {
  const categorias = useQuery({ queryKey: ['categorias'], queryFn: () => api<Row[]>('/categorias') });
  const contas = useQuery({ queryKey: ['contas'], queryFn: () => api<Row[]>('/contas') });
  if (categorias.isLoading || contas.isLoading) return <Carregando />;
  return (
    <div className="space-y-4">
      <Titulo>Financeiro</Titulo>
      <Conciliacao contas={contas.data ?? []} />
      <AClassificar categorias={categorias.data ?? []} />
      <FluxoCaixa categorias={categorias.data ?? []} contas={contas.data ?? []} />
      <Dre />
    </div>
  );
}
