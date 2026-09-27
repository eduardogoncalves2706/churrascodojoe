import { formatBRL, toCents } from '@joe/shared';
import { authEnabled, getIdToken } from './auth';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export const getRole = () => { try { return localStorage.getItem('joe.role') ?? 'admin'; } catch { return 'admin'; } };
export const setRole = (r: string) => { try { localStorage.setItem('joe.role', r); } catch { /* noop */ } };

export class ApiError extends Error { constructor(public code: string, message: string, public status: number) { super(message); } }

export async function api<T = Row>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${BASE}/v1${path}`, {
    method: init?.method ?? 'GET',
    headers: authEnabled
      ? { 'content-type': 'application/json', authorization: (await getIdToken()) ?? '' }
      : { 'content-type': 'application/json', 'x-mock-role': getRole() },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error?.code ?? 'erro', data?.error?.message ?? 'Erro na requisição', res.status);
  return data as T;
}

export const brl = (v: string | number | null | undefined) => (v == null ? '—' : formatBRL(toCents(v)));
export const brlC = (c: number | null | undefined) => (c == null ? '—' : formatBRL(c));
export const pct = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1).replace('.', ',')}%`);
export const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
export const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
export const num = (n: number) => String(n).padStart(3, '0');

export const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho', confirmado: 'Confirmado', em_preparo: 'Em preparo', pronto: 'Pronto', saiu_entrega: 'Saiu p/ entrega',
  entregue: 'Entregue', retirado: 'Retirado', cancelado: 'Cancelado',
};
