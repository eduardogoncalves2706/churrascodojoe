import { useQuery } from '@tanstack/react-query';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api, getRole, setRole, type Row } from './api';
import { authEnabled, sair } from './auth';
import Agenda from './pages/Agenda';
import Cardapio from './pages/Cardapio';
import Clientes from './pages/Clientes';
import Combos from './pages/Combos';
import Comanda from './pages/Comanda';
import Configuracoes from './pages/Configuracoes';
import Consulta from './pages/Consulta';
import Dashboard from './pages/Dashboard';
import Estoque from './pages/Estoque';
import Financeiro from './pages/Financeiro';
import Insumos from './pages/Insumos';
import NovoPedido from './pages/NovoPedido';
import PedidoDetalhe from './pages/PedidoDetalhe';
import Pedidos from './pages/Pedidos';
import Producao from './pages/Producao';
import Bairros from './pages/Bairros';
import Usuarios from './pages/Usuarios';

// Agrupado por assunto (menu/submenu) em vez de uma lista única — mais fácil de achar numa tela
// com 11 destinos. Os 3 primeiros de "Pedidos" também abastecem a barra inferior no mobile.
const GRUPOS = [
  { nome: 'Pedidos', admin: false, links: [
    { to: '/novo', label: 'Novo pedido' }, { to: '/pedidos', label: 'Lista de pedidos' },
    { to: '/producao', label: 'Produção' }, { to: '/agenda', label: 'Agenda' },
  ] },
  { nome: 'Cardápio', admin: false, links: [
    { to: '/consulta', label: 'Consulta rápida' }, { to: '/cardapio', label: 'Produtos e preços' }, { to: '/combos', label: 'Combos' },
  ] },
  { nome: 'Clientes', admin: false, links: [{ to: '/clientes', label: 'Clientes' }] },
  { nome: 'Operação', admin: true, links: [
    { to: '/insumos', label: 'Insumos e ficha' }, { to: '/estoque', label: 'Estoque' }, { to: '/bairros', label: 'Bairros e taxas' },
  ] },
  { nome: 'Financeiro', admin: true, links: [{ to: '/financeiro', label: 'Financeiro' }] },
  { nome: 'Sistema', admin: true, links: [{ to: '/configuracoes', label: 'Configurações' }, { to: '/usuarios', label: 'Usuários' }] },
];
function Link({ to, label, onClick }: { to: string; label: string; onClick?: () => void }) {
  return <NavLink to={to} onClick={onClick} className={({ isActive }) => `block px-3 py-1.5 rounded-md text-sm font-label font-bold uppercase tracking-wide ${isActive ? 'bg-primary text-cream' : 'text-gold hover:bg-surface'}`}>{label}</NavLink>;
}
/** Menu (grupo) + submenu (links) — ex.: "Pedidos" por cima de "Novo pedido"/"Lista de pedidos". */
function Grupo({ nome, links, onClick }: { nome: string; links: { to: string; label: string }[]; onClick?: () => void }) {
  return (
    <div>
      <p className="px-3 pt-2 text-xs text-cream/40 font-label uppercase tracking-wider">{nome}</p>
      {links.map((l) => <Link key={l.to} {...l} onClick={onClick} />)}
    </div>
  );
}

export default function App() {
  const me = useQuery({ queryKey: ['me', getRole()], queryFn: () => api<Row>('/me') });
  // Nome do negócio é white-label (vem de Configurações, não hardcoded) — cabeçalho e aba do navegador.
  // Mesma queryKey que useConfig() usa em Configuracoes.tsx — salvar lá invalida o cache daqui também.
  const negocio = useQuery({ queryKey: ['config', 'negocio_nome'], queryFn: () => api<string>('/configuracoes/negocio_nome'), retry: false });
  const nome = negocio.data || 'Churrasco do Joe';
  useEffect(() => { document.title = nome; }, [nome]);
  const [menu, setMenu] = useState(false);
  const admin = me.data?.papel === 'admin';
  const grupos = GRUPOS.filter((g) => !g.admin || admin);

  return (
    <Routes>
      <Route path="/pedidos/:id/comanda" element={<Comanda />} />
      <Route path="*" element={
        <div className="md:flex min-h-screen">
          <aside className="no-print hidden md:flex md:flex-col w-56 shrink-0 bg-surface/60 p-3 gap-1 border-r border-white/5 overflow-y-auto">
            <NavLink to="/" end className="flex items-center gap-2 px-3 py-2"><img src="/logo-192.png" alt="" className="w-9 h-9 rounded-full" /><h1 className="text-2xl text-primary-hover leading-none">{nome}</h1></NavLink>
            {grupos.map((g) => <Grupo key={g.nome} nome={g.nome} links={g.links} />)}
            <div className="mt-auto text-xs text-cream/60 px-3">
              {me.data && <p>{me.data.nome}</p>}
              {authEnabled && <button className="underline" onClick={sair}>sair</button>}
              {import.meta.env.DEV && !authEnabled && <button className="underline" onClick={() => { setRole(admin ? 'operador' : 'admin'); location.reload(); }}>trocar papel (dev)</button>}
            </div>
          </aside>
          <main className="flex-1 min-w-0 p-4 pb-28 md:pb-6 max-w-5xl mx-auto w-full">
            {me.isError && <p className="card text-primary-hover mb-3">Conectando ao banco… tentando novamente.</p>}
            <Routes>
              <Route path="/" element={<Dashboard admin={admin} />} />
              <Route path="/novo" element={<NovoPedido />} />
              <Route path="/pedidos" element={<Pedidos />} />
              <Route path="/pedidos/:id" element={<PedidoDetalhe />} />
              <Route path="/producao" element={<Producao />} />
              <Route path="/agenda" element={<Agenda />} />
              <Route path="/consulta" element={<Consulta />} />
              <Route path="/cardapio" element={<Cardapio admin={admin} />} />
              <Route path="/combos" element={<Combos admin={admin} />} />
              <Route path="/clientes" element={<Clientes />} />
              <Route path="/insumos" element={admin ? <Insumos /> : <Navigate to="/" />} />
              <Route path="/estoque" element={admin ? <Estoque /> : <Navigate to="/" />} />
              <Route path="/bairros" element={admin ? <Bairros /> : <Navigate to="/" />} />
              <Route path="/financeiro" element={admin ? <Financeiro /> : <Navigate to="/" />} />
              <Route path="/configuracoes" element={admin ? <Configuracoes /> : <Navigate to="/" />} />
              <Route path="/usuarios" element={admin ? <Usuarios /> : <Navigate to="/" />} />
            </Routes>
          </main>
          <nav className="no-print md:hidden fixed bottom-0 inset-x-0 bg-surface border-t border-white/10 grid grid-cols-4 z-20 pb-[env(safe-area-inset-bottom)]">
            {[{ to: '/novo', label: 'Novo pedido' }, { to: '/pedidos', label: 'Pedidos' }, { to: '/producao', label: 'Produção' }].map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => `min-h-[56px] flex items-center justify-center text-center text-sm font-label font-bold uppercase ${isActive ? 'text-primary-hover' : 'text-gold'}`}>{l.label}</NavLink>
            ))}
            <button onClick={() => setMenu(!menu)} className="min-h-[56px] text-sm font-label font-bold uppercase text-gold">Mais</button>
          </nav>
          {menu && (
            <div className="no-print md:hidden fixed inset-0 z-30 bg-black/70" onClick={() => setMenu(false)}>
              <div className="absolute bottom-16 inset-x-2 card space-y-1 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <Link to="/" label="Início" onClick={() => setMenu(false)} />
                {grupos.map((g) => (
                  <Grupo key={g.nome} nome={g.nome} links={g.links.filter((l) => !['/novo', '/pedidos', '/producao'].includes(l.to))} onClick={() => setMenu(false)} />
                ))}
              </div>
            </div>
          )}
        </div>
      } />
    </Routes>
  );
}
