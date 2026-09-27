import { useQuery } from '@tanstack/react-query';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useState } from 'react';
import { api, getRole, setRole, type Row } from './api';
import { authEnabled, sair } from './auth';
import Agenda from './pages/Agenda';
import Cardapio from './pages/Cardapio';
import Clientes from './pages/Clientes';
import Combos from './pages/Combos';
import Comanda from './pages/Comanda';
import Insumos from './pages/Insumos';
import NovoPedido from './pages/NovoPedido';
import PedidoDetalhe from './pages/PedidoDetalhe';
import Pedidos from './pages/Pedidos';
import Producao from './pages/Producao';
import Bairros from './pages/Bairros';
import Usuarios from './pages/Usuarios';

const main = [
  { to: '/novo', label: 'Novo pedido', admin: false }, { to: '/pedidos', label: 'Pedidos', admin: false },
  { to: '/producao', label: 'Produção', admin: false }, { to: '/agenda', label: 'Agenda', admin: false },
];
const mais = [
  { to: '/cardapio', label: 'Cardápio', admin: false }, { to: '/combos', label: 'Combos', admin: false }, { to: '/clientes', label: 'Clientes', admin: false },
  { to: '/insumos', label: 'Insumos e ficha', admin: true }, { to: '/bairros', label: 'Bairros e taxas', admin: true },
  { to: '/usuarios', label: 'Usuários', admin: true },
];

function Link({ to, label, onClick }: { to: string; label: string; onClick?: () => void }) {
  return <NavLink to={to} onClick={onClick} className={({ isActive }) => `block px-3 py-2 rounded-md font-label font-bold uppercase tracking-wide ${isActive ? 'bg-primary text-cream' : 'text-gold hover:bg-surface'}`}>{label}</NavLink>;
}

export default function App() {
  const me = useQuery({ queryKey: ['me', getRole()], queryFn: () => api<Row>('/me') });
  const [menu, setMenu] = useState(false);
  const admin = me.data?.papel === 'admin';
  const links = [...main, ...mais].filter((l) => !l.admin || admin);

  return (
    <Routes>
      <Route path="/pedidos/:id/comanda" element={<Comanda />} />
      <Route path="*" element={
        <div className="md:flex min-h-screen">
          <aside className="no-print hidden md:flex md:flex-col w-56 shrink-0 bg-surface/60 p-3 gap-1 border-r border-white/5">
            <div className="flex items-center gap-2 px-3 py-2"><img src="/logo-192.png" alt="" className="w-9 h-9 rounded-full" /><h1 className="text-2xl text-primary-hover leading-none">Churrasco do Joe</h1></div>
            {links.map((l) => <Link key={l.to} {...l} />)}
            <div className="mt-auto text-xs text-cream/60 px-3">
              {me.data && <p>{me.data.nome}</p>}
              {authEnabled && <button className="underline" onClick={sair}>sair</button>}
              {import.meta.env.DEV && !authEnabled && <button className="underline" onClick={() => { setRole(admin ? 'operador' : 'admin'); location.reload(); }}>trocar papel (dev)</button>}
            </div>
          </aside>
          <main className="flex-1 min-w-0 p-4 pb-28 md:pb-6 max-w-5xl mx-auto w-full">
            {me.isError && <p className="card text-primary-hover mb-3">Conectando ao banco… tentando novamente.</p>}
            <Routes>
              <Route path="/" element={<Navigate to="/novo" replace />} />
              <Route path="/novo" element={<NovoPedido />} />
              <Route path="/pedidos" element={<Pedidos />} />
              <Route path="/pedidos/:id" element={<PedidoDetalhe />} />
              <Route path="/producao" element={<Producao />} />
              <Route path="/agenda" element={<Agenda />} />
              <Route path="/cardapio" element={<Cardapio admin={admin} />} />
              <Route path="/combos" element={<Combos admin={admin} />} />
              <Route path="/clientes" element={<Clientes />} />
              <Route path="/insumos" element={admin ? <Insumos /> : <Navigate to="/" />} />
              <Route path="/bairros" element={admin ? <Bairros /> : <Navigate to="/" />} />
              <Route path="/usuarios" element={admin ? <Usuarios /> : <Navigate to="/" />} />
            </Routes>
          </main>
          <nav className="no-print md:hidden fixed bottom-0 inset-x-0 bg-surface border-t border-white/10 grid grid-cols-4 z-20 pb-[env(safe-area-inset-bottom)]">
            {[main[0], main[1], main[2]].map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => `min-h-[56px] flex items-center justify-center text-center text-sm font-label font-bold uppercase ${isActive ? 'text-primary-hover' : 'text-gold'}`}>{l.label}</NavLink>
            ))}
            <button onClick={() => setMenu(!menu)} className="min-h-[56px] text-sm font-label font-bold uppercase text-gold">Mais</button>
          </nav>
          {menu && (
            <div className="no-print md:hidden fixed inset-0 z-30 bg-black/70" onClick={() => setMenu(false)}>
              <div className="absolute bottom-16 inset-x-2 card space-y-1" onClick={(e) => e.stopPropagation()}>
                {links.filter((l) => !['/novo', '/pedidos', '/producao'].includes(l.to)).map((l) => <Link key={l.to} {...l} onClick={() => setMenu(false)} />)}
              </div>
            </div>
          )}
        </div>
      } />
    </Routes>
  );
}
