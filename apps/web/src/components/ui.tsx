import type { ReactNode } from 'react';

export const Titulo = ({ children, extra }: { children: ReactNode; extra?: ReactNode }) => (
  <div className="flex items-center justify-between gap-2 mb-4 flex-wrap"><h2 className="text-4xl text-gold">{children}</h2>{extra}</div>
);
export const Vazio = ({ children }: { children: ReactNode }) => <p className="text-cream/60 py-6 text-center">{children}</p>;
export const Carregando = () => <p className="text-cream/60 py-6 text-center">Carregando…</p>;
export const Erro = ({ e }: { e: unknown }) => <p className="card text-primary-hover">{e instanceof Error ? e.message : 'Erro'}</p>;
export const Campo = ({ label, children }: { label: string; children: ReactNode }) => <div className="space-y-1"><label>{label}</label>{children}</div>;
