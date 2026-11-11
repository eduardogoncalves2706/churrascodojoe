import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, brlC, type Row } from '../api';
import { Carregando, Titulo, Vazio } from '../components/ui';

const LABEL_CATEGORIA: Record<string, string> = { carne: 'Carnes', acompanhamento: 'Acompanhamentos', bebida: 'Bebidas', sobremesa: 'Sobremesas', geleia: 'Geleias', outros: 'Outros' };
const ORDEM_CATEGORIA = ['carne', 'acompanhamento', 'bebida', 'sobremesa', 'geleia', 'outros'];

/** Pra responder rápido no telefone/WhatsApp sem precisar lembrar de cabeça ou olhar o cardápio
 * físico: busca só, texto grande, sem botão de editar nada (isso fica em Cardápio/Combos). */
export default function Consulta() {
  const produtos = useQuery({ queryKey: ['produtos'], queryFn: () => api<Row[]>('/produtos') });
  const combos = useQuery({ queryKey: ['combos'], queryFn: () => api<Row[]>('/combos') });
  const [busca, setBusca] = useState('');
  const alvo = busca.trim().toLowerCase();

  if (produtos.isLoading || combos.isLoading) return <Carregando />;

  const prods = (produtos.data ?? []).filter((p) => p.ativo && p.disponivelHoje && p.nome.toLowerCase().includes(alvo));
  const cbs = (combos.data ?? []).filter((c) => c.ativo && c.nome.toLowerCase().includes(alvo));
  const categorias = ORDEM_CATEGORIA.map((cat) => ({ cat, itens: prods.filter((p) => p.categoria === cat) })).filter((g) => g.itens.length > 0);
  const vazio = !cbs.length && !categorias.length;

  return (
    <div className="space-y-4">
      <Titulo>Consulta rápida</Titulo>
      <input className="text-lg" autoFocus placeholder="Buscar produto ou combo…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      {vazio && <Vazio>Nada encontrado com esse nome.</Vazio>}

      {cbs.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-label font-bold uppercase text-gold">Combos</h3>
          <div className="grid sm:grid-cols-2 gap-2">
            {cbs.map((c) => (
              <div key={c.id} className="card space-y-1">
                <p className="font-display text-2xl text-gold">{c.nome} <span className="text-sm text-cream/60 font-sans">({c.pessoas}p)</span></p>
                <p className="text-sm text-cream/70">{c.itens.map((i: Row) => `${Number(i.quantidade)}× ${i.nome}`).join(' · ')}</p>
                <div className="flex flex-wrap gap-2 pt-1">{c.variantes.filter((v: Row) => v.ativo).map((v: Row) => (
                  <span key={v.id} className="chip">{v.carne}: <b className="text-gold">{brlC(v.precoCents)}</b></span>
                ))}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {categorias.map(({ cat, itens }) => (
        <section key={cat} className="space-y-2">
          <h3 className="font-label font-bold uppercase text-gold">{LABEL_CATEGORIA[cat] ?? cat}</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {itens.map((p) => (
              <div key={p.id} className="card flex justify-between items-baseline gap-2">
                <span>{p.nome}{p.parceiro && <span className="text-xs text-gold"> · {p.parceiro}</span>}</span>
                <span className="font-display text-2xl text-gold shrink-0">{p.vendidoAPrecoDeCusto ? 'custo' : brlC(p.precoCents)}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
