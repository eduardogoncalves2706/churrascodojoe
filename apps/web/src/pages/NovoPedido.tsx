import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toCents } from '@joe/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, brl, brlC, num, type Row } from '../api';
import { Campo, Carregando, Erro } from '../components/ui';

interface Item { key: string; produtoId?: string; varianteId?: string; refrigeranteId?: string; nome: string; precoCents: number; qtd: number; obs: string; fracionado: boolean; livre: boolean }
interface Draft {
  telefone: string; nome: string; clienteId?: string; semCadastro: boolean; canal: string; tipo: string; agendar: boolean; quando: string;
  itens: Item[]; enderecoTexto: string; bairroId: string; referencia: string; desconto: string; taxaManual: string; forma: string; trocoPara: string; pagarDepois: boolean; obs: string;
}
const VAZIO: Draft = { telefone: '', nome: '', semCadastro: false, canal: 'whatsapp', tipo: 'entrega', agendar: false, quando: '', itens: [], enderecoTexto: '', bairroId: '', referencia: '', desconto: '', taxaManual: '', forma: 'pix', trocoPara: '', pagarDepois: false, obs: '' };
const KEY = 'joe.rascunho';
const carregarDraft = (): Draft => { try { return { ...VAZIO, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return VAZIO; } };

const ABAS = ['Combos', 'Carnes', 'Acompanhamentos', 'Bebidas', 'Doces & Geleias'] as const;
const abaDe = (cat: string) => (cat === 'carne' ? 'Carnes' : cat === 'acompanhamento' ? 'Acompanhamentos' : cat === 'bebida' ? 'Bebidas' : 'Doces & Geleias');

export default function NovoPedido() {
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(carregarDraft);
  const [aba, setAba] = useState<(typeof ABAS)[number]>('Combos');
  const [combo, setCombo] = useState<{ combo: Row; variante?: Row } | null>(null);
  const [feito, setFeito] = useState<Row | null>(null);
  const [copiado, setCopiado] = useState(false);
  const up = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* noop */ } }, [d]);

  const produtos = useQuery({ queryKey: ['produtos'], queryFn: () => api<Row[]>('/produtos') });
  const combos = useQuery({ queryKey: ['combos'], queryFn: () => api<Row[]>('/combos') });
  const bairros = useQuery({ queryKey: ['bairros'], queryFn: () => api<Row[]>('/bairros') });

  // busca instantânea por telefone
  const digitos = d.telefone.replace(/\D/g, '');
  useEffect(() => {
    if (digitos.length < 10 || d.semCadastro) return;
    const t = setTimeout(async () => {
      try {
        const c = await api<Row>(`/clientes/por-telefone/${digitos}`);
        const e = c.enderecos?.find((x: Row) => x.principal) ?? c.enderecos?.[0];
        setD((x) => ({ ...x, clienteId: c.id, nome: c.nome, ...(e ? { enderecoTexto: `${e.logradouro}${e.numero ? `, ${e.numero}` : ''}`, bairroId: e.bairroId ?? '', referencia: e.referencia ?? '' } : {}) }));
      } catch { setD((x) => ({ ...x, clienteId: undefined })); }
    }, 350);
    return () => clearTimeout(t);
  }, [digitos, d.semCadastro]);

  const bairro = bairros.data?.find((b) => b.id === d.bairroId);
  const subtotal = d.itens.reduce((a, i) => a + Math.round(i.precoCents * i.qtd), 0);
  const taxa = d.tipo === 'retirada' ? 0 : d.taxaManual !== '' ? toCents(d.taxaManual) : bairro ? toCents(bairro.taxaEntrega) : 0;
  const desconto = toCents(d.desconto || 0);
  const total = Math.max(0, subtotal - desconto + taxa);

  const add = (i: Omit<Item, 'key' | 'qtd' | 'obs'>) => setD((x) => {
    const ex = x.itens.find((y) => y.produtoId === i.produtoId && y.varianteId === i.varianteId && y.refrigeranteId === i.refrigeranteId && !y.obs);
    if (ex) return { ...x, itens: x.itens.map((y) => (y === ex ? { ...y, qtd: y.qtd + 1 } : y)) };
    return { ...x, itens: [...x.itens, { ...i, key: crypto.randomUUID(), qtd: 1, obs: '' }] };
  });
  const setItem = (key: string, p: Partial<Item>) => up({ itens: d.itens.map((i) => (i.key === key ? { ...i, ...p } : i)) });
  const passo = (i: Item, dir: 1 | -1) => {
    const step = i.fracionado ? 0.5 : 1; const q = Math.round((i.qtd + dir * step) * 2) / 2;
    up({ itens: q <= 0 ? d.itens.filter((x) => x.key !== i.key) : d.itens.map((x) => (x.key === i.key ? { ...i, qtd: q } : x)) });
  };

  const criar = useMutation({
    mutationFn: () => api<Row>('/pedidos', { method: 'POST', body: {
      ...(d.clienteId ? { clienteId: d.clienteId } : !d.semCadastro && digitos.length >= 8 && d.nome ? { novoCliente: { nome: d.nome, telefone: d.telefone } } : { nomeCliente: d.nome || 'Balcão' }),
      canal: d.canal, tipo: d.tipo, ...(d.agendar && d.quando ? { agendadoPara: new Date(d.quando).toISOString() } : {}),
      itens: d.itens.map((i) => ({ ...(i.varianteId ? { comboVarianteId: i.varianteId, refrigeranteId: i.refrigeranteId } : { produtoId: i.produtoId }), quantidade: i.qtd, observacao: i.obs || undefined, ...(i.livre ? { precoUnitario: i.precoCents / 100 } : {}) })),
      desconto: desconto / 100, ...(d.tipo === 'entrega' ? { taxaEntrega: taxa / 100, bairroId: d.bairroId || undefined, enderecoTexto: d.enderecoTexto, referencia: d.referencia } : {}),
      trocoPara: d.forma === 'dinheiro' && d.trocoPara ? Number(d.trocoPara) : undefined, observacoes: d.obs || undefined,
      pagamentos: d.pagarDepois ? [] : [{ forma: d.forma, valor: total / 100 }],
    } }),
    onSuccess: async (p) => {
      setFeito(p); setD(VAZIO); try { localStorage.removeItem(KEY); } catch { /* noop */ }
      qc.invalidateQueries({ queryKey: ['pedidos'] });
    },
  });

  const copiar = async () => {
    const r = await api<Row>(`/pedidos/${feito!.id}/resumo-whatsapp`);
    await navigator.clipboard.writeText(r.texto); setCopiado(true); setTimeout(() => setCopiado(false), 2000);
  };

  if (feito) return (
    <div className="card space-y-4 text-center">
      <h2 className="text-5xl text-gold">Pedido #{num(feito.numeroDia)} confirmado</h2>
      <p className="text-3xl font-display text-gold">{brl(feito.total)}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <Link className="btn" to={`/pedidos/${feito.id}/comanda`} target="_blank">Imprimir comanda</Link>
        <button className="btn-ghost" onClick={copiar}>{copiado ? 'Copiado!' : 'Copiar p/ WhatsApp'}</button>
        <button className="btn-ghost" onClick={() => setFeito(null)}>Novo pedido</button>
      </div>
    </div>
  );

  if (produtos.isLoading || combos.isLoading) return <Carregando />;
  if (produtos.isError) return <Erro e={produtos.error} />;

  const lista = (produtos.data ?? []).filter((p) => p.ativo && p.disponivelHoje && abaDe(p.categoria) === aba);
  const pronto = d.itens.length > 0 && (d.tipo === 'retirada' || (d.enderecoTexto && d.bairroId)) && (!d.agendar || d.quando);

  return (
    <div className="space-y-5 pb-44">
      <h2 className="text-4xl text-gold">Novo pedido</h2>

      <section className="card space-y-3">
        <div className="flex items-center justify-between"><h3 className="font-label font-bold uppercase text-gold">1 · Cliente</h3>
          <label className="flex items-center gap-2 normal-case"><input type="checkbox" className="!w-5 !min-h-0" checked={d.semCadastro} onChange={(e) => up({ semCadastro: e.target.checked, clienteId: undefined })} />Sem cadastro (balcão)</label></div>
        {!d.semCadastro && <Campo label="Telefone (WhatsApp)"><input inputMode="tel" placeholder="(51) 99999-9999" value={d.telefone} onChange={(e) => up({ telefone: e.target.value, clienteId: undefined })} /></Campo>}
        <Campo label={d.clienteId ? 'Cliente encontrado' : 'Nome'}><input value={d.nome} onChange={(e) => up({ nome: e.target.value })} placeholder="Nome do cliente" /></Campo>
      </section>

      <section className="card space-y-3">
        <h3 className="font-label font-bold uppercase text-gold">2 · Canal e tipo</h3>
        <div className="flex flex-wrap gap-2">{['whatsapp', 'instagram', 'balcao', 'telefone'].map((c) => <button key={c} className={`chip ${d.canal === c ? 'chip-on' : ''}`} onClick={() => up({ canal: c })}>{c === 'balcao' ? 'Balcão' : c}</button>)}</div>
        <div className="flex flex-wrap gap-2">{[['entrega', 'Entrega'], ['retirada', 'Retirada']].map(([v, l]) => <button key={v} className={`chip ${d.tipo === v ? 'chip-on' : ''}`} onClick={() => up({ tipo: v })}>{l}</button>)}</div>
        <div className="flex flex-wrap gap-2 items-center">
          <button className={`chip ${!d.agendar ? 'chip-on' : ''}`} onClick={() => up({ agendar: false })}>Agora</button>
          <button className={`chip ${d.agendar ? 'chip-on' : ''}`} onClick={() => up({ agendar: true })}>Agendar</button>
          {d.agendar && <input type="datetime-local" className="!w-auto" value={d.quando} onChange={(e) => up({ quando: e.target.value })} />}
        </div>
      </section>

      <section className="card space-y-3">
        <h3 className="font-label font-bold uppercase text-gold">3 · Itens</h3>
        <div className="flex gap-2 overflow-x-auto pb-1">{ABAS.map((a) => <button key={a} className={`chip whitespace-nowrap ${aba === a ? 'chip-on' : ''}`} onClick={() => { setAba(a); setCombo(null); }}>{a}</button>)}</div>

        {aba === 'Combos' && !combo && <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {combos.data?.filter((c) => c.ativo).map((c) => <button key={c.id} className="card text-left min-h-[72px] hover:border-primary" onClick={() => setCombo({ combo: c })}>
            <p className="font-label font-bold uppercase text-lg">{c.nome}</p><p className="text-gold text-sm">a partir de {brlC(Math.min(...c.variantes.map((v: Row) => v.precoCents)))}</p></button>)}
        </div>}
        {aba === 'Combos' && combo && <div className="space-y-3">
          <div className="flex justify-between"><p className="font-label font-bold uppercase text-lg">{combo.combo.nome}</p><button className="text-gold underline" onClick={() => setCombo(null)}>voltar</button></div>
          <p className="text-xs text-gold font-label uppercase">Escolha a carne</p>
          <div className="grid grid-cols-2 gap-2">{combo.combo.variantes.filter((v: Row) => v.ativo).map((v: Row) => <button key={v.id} className={`card text-left min-h-[56px] ${combo.variante?.id === v.id ? 'border-primary' : ''}`} onClick={() => setCombo({ ...combo, variante: v })}><span className="font-label font-bold uppercase">{v.carne}</span><br /><span className="text-gold">{brlC(v.precoCents)}</span></button>)}</div>
          {combo.variante && <>
            <p className="text-xs text-gold font-label uppercase">Refrigerante</p>
            <div className="flex gap-2 flex-wrap">{produtos.data?.filter((p) => p.categoria === 'bebida' && ['Coca', 'Guaraná', 'Pepsi'].includes(p.nome) && p.disponivelHoje).map((p) => (
              <button key={p.id} className="chip" onClick={() => { add({ varianteId: combo.variante!.id, refrigeranteId: p.id, nome: `${combo.combo.nome} – ${combo.variante!.carne} · ${p.nome}`, precoCents: combo.variante!.precoCents, fracionado: false, livre: false }); setCombo(null); }}>{p.nome}</button>))}</div>
          </>}
        </div>}
        {aba !== 'Combos' && <div className="grid grid-cols-2 gap-2">{lista.map((p) => (
          <button key={p.id} className="card text-left min-h-[72px] hover:border-primary" onClick={() => add({ produtoId: p.id, nome: p.nome, precoCents: p.precoCents, fracionado: p.permiteFracionado, livre: p.vendidoAPrecoDeCusto })}>
            <p className="font-label font-bold uppercase leading-tight">{p.nome}</p><p className="text-gold">{p.vendidoAPrecoDeCusto ? 'preço a informar' : brlC(p.precoCents)}</p></button>))}</div>}

        {d.itens.length > 0 && <ul className="divide-y divide-white/10">{d.itens.map((i) => (
          <li key={i.key} className="py-2 space-y-1">
            <div className="flex items-center gap-2"><p className="flex-1 leading-tight">{i.nome}</p>
              {i.livre && <input aria-label="Preço" className="!w-24" inputMode="decimal" value={i.precoCents ? i.precoCents / 100 : ''} placeholder="R$" onChange={(e) => setItem(i.key, { precoCents: toCents(e.target.value || 0) })} />}
              <button className="btn-ghost !px-3" aria-label="menos" onClick={() => passo(i, -1)}>−</button><span className="w-8 text-center font-display text-2xl">{i.qtd}</span><button className="btn-ghost !px-3" aria-label="mais" onClick={() => passo(i, 1)}>+</button></div>
            <input placeholder="Observação (ex.: ao ponto)" value={i.obs} onChange={(e) => setItem(i.key, { obs: e.target.value })} />
          </li>))}</ul>}
      </section>

      {d.tipo === 'entrega' && <section className="card space-y-3">
        <h3 className="font-label font-bold uppercase text-gold">4 · Entrega</h3>
        <Campo label="Endereço"><input value={d.enderecoTexto} onChange={(e) => up({ enderecoTexto: e.target.value })} placeholder="Rua, número" /></Campo>
        <Campo label="Bairro"><select value={d.bairroId} onChange={(e) => up({ bairroId: e.target.value })}><option value="">Selecione…</option>{bairros.data?.filter((b) => b.atende).map((b) => <option key={b.id} value={b.id}>{b.nome} — {b.cidade} ({brl(b.taxaEntrega)})</option>)}</select></Campo>
        <Campo label="Referência"><input value={d.referencia} onChange={(e) => up({ referencia: e.target.value })} /></Campo>
        <Campo label="Taxa de entrega (editar se precisar)"><input inputMode="decimal" placeholder={bairro ? String(bairro.taxaEntrega) : '0'} value={d.taxaManual} onChange={(e) => up({ taxaManual: e.target.value })} /></Campo>
      </section>}

      <section className="card space-y-3">
        <h3 className="font-label font-bold uppercase text-gold">5 · Pagamento</h3>
        <label className="flex items-center gap-2 normal-case"><input type="checkbox" className="!w-5 !min-h-0" checked={d.pagarDepois} onChange={(e) => up({ pagarDepois: e.target.checked })} />Pagar depois</label>
        {!d.pagarDepois && <div className="flex flex-wrap gap-2">{['pix', 'dinheiro', 'credito', 'debito'].map((f) => <button key={f} className={`chip ${d.forma === f ? 'chip-on' : ''}`} onClick={() => up({ forma: f })}>{f === 'credito' ? 'Crédito' : f === 'debito' ? 'Débito' : f}</button>)}</div>}
        {!d.pagarDepois && d.forma === 'dinheiro' && <Campo label="Troco para"><input inputMode="decimal" value={d.trocoPara} onChange={(e) => up({ trocoPara: e.target.value })} /></Campo>}
        <Campo label="Desconto (R$)"><input inputMode="decimal" value={d.desconto} onChange={(e) => up({ desconto: e.target.value })} /></Campo>
        <Campo label="Observações do pedido"><input value={d.obs} onChange={(e) => up({ obs: e.target.value })} /></Campo>
      </section>

      <div className="fixed bottom-14 md:bottom-0 inset-x-0 md:left-56 bg-surface border-t border-gold/30 p-3 z-10">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="flex-1 text-sm text-cream/80 leading-tight">Subtotal {brlC(subtotal)}{desconto > 0 && ` · desc. −${brlC(desconto)}`}{taxa > 0 && ` · taxa ${brlC(taxa)}`}<p className="font-display text-4xl text-gold">{brlC(total)}</p></div>
          <button className="btn !min-h-[52px] px-6" disabled={!pronto || criar.isPending} onClick={() => criar.mutate()}>{criar.isPending ? 'Enviando…' : 'Confirmar pedido'}</button>
        </div>
        {criar.isError && <p className="text-primary-hover text-sm text-center">{(criar.error as Error).message}</p>}
      </div>
    </div>
  );
}
