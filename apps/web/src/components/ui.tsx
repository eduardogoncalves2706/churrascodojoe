import { useState } from 'react';
import type { ReactNode } from 'react';
import { whatsappUrl } from '../api';

/** Caixinha de texto + botão que abre o WhatsApp do cliente já com a mensagem digitada — sem API, sem automação. */
export function MensagemWhats({ telefone }: { telefone: string }) {
  const [texto, setTexto] = useState('');
  return (
    <div className="flex gap-2 items-center flex-wrap">
      <input className="flex-1 min-w-[160px]" placeholder="Mensagem (opcional)" value={texto} onChange={(e) => setTexto(e.target.value)} />
      <a href={whatsappUrl(telefone, texto)} target="_blank" rel="noopener" className="btn !min-h-[40px] !px-4 text-sm shrink-0">📱 Enviar</a>
    </div>
  );
}

export const Titulo = ({ children, extra }: { children: ReactNode; extra?: ReactNode }) => (
  <div className="flex items-center justify-between gap-2 mb-4 flex-wrap"><h2 className="text-4xl text-gold">{children}</h2>{extra}</div>
);
export const Vazio = ({ children }: { children: ReactNode }) => <p className="text-cream/60 py-6 text-center">{children}</p>;
export const Carregando = () => <p className="text-cream/60 py-6 text-center">Carregando…</p>;
export const Erro = ({ e }: { e: unknown }) => <p className="card text-primary-hover">{e instanceof Error ? e.message : 'Erro'}</p>;
export const Campo = ({ label, children }: { label: string; children: ReactNode }) => <div className="space-y-1"><label>{label}</label>{children}</div>;
