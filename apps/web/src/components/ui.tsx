import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api, hoje, urlImagem, whatsappUrl } from '../api';

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

/** Foto de produto/combo pra landing page — sobe direto pro bucket do site (URL pré-assinada,
 * ver services/imagens.ts) e devolve a `key`; quem usa isso salva com o PATCH normal do form. */
export function UploadImagem({ pasta, value, onChange }: { pasta: 'produtos' | 'combos'; value: string | null; onChange: (key: string | null) => void }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const enviar = async (file: File) => {
    setEnviando(true); setErro(null);
    try {
      const { uploadUrl, key } = await api<{ uploadUrl: string; key: string }>(`/${pasta}/imagem-upload-url`, { method: 'POST', body: { contentType: file.type } });
      const r = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': file.type } });
      if (!r.ok) throw new Error('Falha ao enviar a imagem');
      onChange(key);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao enviar imagem'); }
    finally { setEnviando(false); }
  };
  return (
    <div className="space-y-1">
      <label>Foto (JPEG, PNG ou WebP)</label>
      <div className="flex items-center gap-3 flex-wrap">
        {value && <img src={urlImagem(value) ?? undefined} alt="" className="w-20 h-20 object-cover rounded-md border border-white/10" />}
        <div className="space-y-1">
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={enviando} onChange={(e) => e.target.files?.[0] && enviar(e.target.files[0])} />
          {enviando && <p className="text-xs text-cream/60">Enviando…</p>}
          {value && !enviando && <button type="button" className="text-gold underline text-xs" onClick={() => onChange(null)}>remover foto</button>}
        </div>
      </div>
      {erro && <p className="text-xs text-primary-hover">{erro}</p>}
    </div>
  );
}

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const paraData = (s: string) => new Date(`${s}T12:00:00`); // meio-dia evita problema de fuso ao converter string YYYY-MM-DD
const formatarCurto = (s: string) => paraData(s).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace('.', '');
const diasDoMes = (ano: number, mes: number) => {
  const inicioOffset = new Date(ano, mes, 1).getDay();
  const total = new Date(ano, mes + 1, 0).getDate();
  return [...Array(inicioOffset).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
};

/** Calendário em popover — troca o `<input type="date">` nativo (feio e difícil de navegar no desktop)
 * por um calendário de verdade, com destaque pros dias de operação (sáb/dom/feriado). */
export function Calendario({ value, onChange, destacar }: { value: string; onChange: (v: string) => void; destacar?: (data: string) => boolean }) {
  const [aberto, setAberto] = useState(false);
  const [cursor, setCursor] = useState(() => { const d = paraData(value); return { ano: d.getFullYear(), mes: d.getMonth() }; });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, [aberto]);

  const abrir = () => { const d = paraData(value); setCursor({ ano: d.getFullYear(), mes: d.getMonth() }); setAberto(true); };
  const mudarMes = (delta: number) => setCursor((c) => { const d = new Date(c.ano, c.mes + delta, 1); return { ano: d.getFullYear(), mes: d.getMonth() }; });
  const montar = (dia: number) => `${cursor.ano}-${String(cursor.mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

  return (
    <div className="relative" ref={ref}>
      <button type="button" className="chip whitespace-nowrap" onClick={() => (aberto ? setAberto(false) : abrir())}>📅 {formatarCurto(value)}</button>
      {aberto && (
        <div className="absolute z-20 mt-1 card !p-3 w-64 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <button type="button" className="btn-ghost !min-h-0 !px-2 !py-1" aria-label="Mês anterior" onClick={() => mudarMes(-1)}>‹</button>
            <span className="font-label font-bold uppercase text-gold text-sm">{MESES[cursor.mes]} {cursor.ano}</span>
            <button type="button" className="btn-ghost !min-h-0 !px-2 !py-1" aria-label="Próximo mês" onClick={() => mudarMes(1)}>›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-cream/50 mb-1">{DIAS_SEMANA.map((d, i) => <span key={i}>{d}</span>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {diasDoMes(cursor.ano, cursor.mes).map((dia, i) => {
              if (!dia) return <span key={i} />;
              const dataStr = montar(dia as number);
              const selecionado = dataStr === value;
              return (
                <button type="button" key={i} onClick={() => { onChange(dataStr); setAberto(false); }}
                  className={`h-8 rounded-md text-sm transition-colors ${selecionado ? 'bg-primary text-cream font-bold' : destacar?.(dataStr) ? 'text-primary-hover font-bold hover:bg-surface' : 'text-cream/80 hover:bg-surface'}`}>
                  {dia}
                </button>
              );
            })}
          </div>
          <button type="button" className="btn-ghost w-full mt-2 !min-h-[36px] text-sm" onClick={() => { onChange(hoje()); setAberto(false); }}>Hoje</button>
        </div>
      )}
    </div>
  );
}

const finsDeSemana = (d: string) => [0, 6].includes(paraData(d).getDay());

/** Um dia só, com ‹ › pra pular dia a dia sem abrir o calendário (uso mais comum: ver ontem/amanhã). */
export function SeletorData({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const somar = (n: number) => { const d = paraData(value); d.setDate(d.getDate() + n); onChange(d.toISOString().slice(0, 10)); };
  return (
    <div className="flex items-center gap-1">
      <button type="button" className="btn-ghost !min-h-[40px] !px-2" aria-label="Dia anterior" onClick={() => somar(-1)}>‹</button>
      <Calendario value={value} onChange={onChange} destacar={finsDeSemana} />
      <button type="button" className="btn-ghost !min-h-[40px] !px-2" aria-label="Próximo dia" onClick={() => somar(1)}>›</button>
      {value !== hoje() && <button type="button" className="text-gold underline text-xs ml-1 whitespace-nowrap" onClick={() => onChange(hoje())}>hoje</button>}
    </div>
  );
}

/** Período (de/até) — dois calendários lado a lado. */
export function SeletorPeriodo({ de, ate, onChange }: { de: string; ate: string; onChange: (v: { de: string; ate: string }) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Calendario value={de} onChange={(v) => onChange({ de: v, ate })} destacar={finsDeSemana} />
      <span className="text-cream/60 text-sm">até</span>
      <Calendario value={ate} onChange={(v) => onChange({ de, ate: v })} destacar={finsDeSemana} />
    </div>
  );
}

/** Select com motivos comuns + "Outro…" (digita livre) — evita texto solto de motivo divergir
 * sem querer (erro de digitação) e padroniza o dado pra futuro relatório de motivo. */
export function SeletorMotivo({ opcoes, value, onChange, placeholder = 'Descreva o motivo' }: { opcoes: readonly string[]; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [modoOutro, setModoOutro] = useState(() => value !== '' && !opcoes.includes(value));
  return (
    <div className="flex-1 min-w-[180px] space-y-1">
      <select value={modoOutro ? 'outro' : value} onChange={(e) => {
        if (e.target.value === 'outro') { setModoOutro(true); onChange(''); } else { setModoOutro(false); onChange(e.target.value); }
      }}>
        <option value="">Escolha o motivo…</option>
        {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value="outro">Outro…</option>
      </select>
      {modoOutro && <input autoFocus placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}

/** Salva várias mutations de uma vez (Promise.all) — um botão só, um retorno visual só. Evita o
 * risco de uma tela com múltiplas seções editáveis dar a entender que salvou tudo quando só uma
 * seção foi de fato enviada ao servidor (ex.: editor de combo com dados/itens/variantes juntos). */
export function useSalvarSecao(acoes: () => Promise<unknown>[]) {
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const salvar = async () => {
    setSalvando(true); setErro(null);
    try { await Promise.all(acoes()); setSalvo(true); setTimeout(() => setSalvo(false), 2000); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao salvar'); }
    finally { setSalvando(false); }
  };
  return { salvar, salvando, salvo, erro };
}
export function BotaoSalvar({ salvando, salvo, erro, onClick }: { salvando: boolean; salvo: boolean; erro: string | null; onClick: () => void }) {
  return (
    <div className="space-y-1">
      <button className="btn" disabled={salvando} onClick={onClick}>{salvando ? 'Salvando…' : salvo ? 'Salvo!' : 'Salvar'}</button>
      {erro && <p className="card text-primary-hover">{erro}</p>}
    </div>
  );
}

/** Painel lateral (direita) — pra editar/ver algo sem perder o lugar na lista de trás (abre sempre
 * fixo na tela, não importa até onde a lista por baixo tinha rolado) e sem navegar pra outra página. */
export function Drawer({ titulo, children, onFechar, largura = 'max-w-md' }: { titulo?: string; children: ReactNode; onFechar: () => void; largura?: string }) {
  const [visivel, setVisivel] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setVisivel(true)); return () => cancelAnimationFrame(t); }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onFechar]);
  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex justify-end" onClick={onFechar}>
      <div className={`relative h-full w-full ${largura} bg-surface border-l border-gold/20 overflow-y-auto p-4 space-y-3 transition-transform duration-200 ${visivel ? 'translate-x-0' : 'translate-x-full'}`} onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Fechar" className="absolute top-3 right-3 text-gold text-2xl leading-none" onClick={onFechar}>×</button>
        {titulo && <h3 className="font-label font-bold uppercase text-gold pr-8">{titulo}</h3>}
        {children}
      </div>
    </div>
  );
}

/** Modal simples (confirmações curtas) — agora é um Drawer estreito, pra ficar consistente com o
 * resto: tudo que abre em cima da tela (editar, confirmar, recusar) sai do mesmo lado. */
export function Modal({ titulo, children, onFechar }: { titulo: string; children: ReactNode; onFechar: () => void }) {
  return <Drawer titulo={titulo} onFechar={onFechar} largura="max-w-sm">{children}</Drawer>;
}

export const Titulo = ({ children, extra }: { children: ReactNode; extra?: ReactNode }) => (
  <div className="flex items-center justify-between gap-2 mb-4 flex-wrap"><h2 className="text-4xl text-gold">{children}</h2>{extra}</div>
);
export const Vazio = ({ children }: { children: ReactNode }) => <p className="text-cream/60 py-6 text-center">{children}</p>;
export const Carregando = () => <p className="text-cream/60 py-6 text-center">Carregando…</p>;
export const Erro = ({ e }: { e: unknown }) => <p className="card text-primary-hover">{e instanceof Error ? e.message : 'Erro'}</p>;
export const Campo = ({ label, children }: { label: string; children: ReactNode }) => <div className="space-y-1"><label>{label}</label>{children}</div>;
