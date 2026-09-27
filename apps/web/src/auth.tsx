import { Amplify } from 'aws-amplify';
import { confirmResetPassword, confirmSignIn, fetchAuthSession, getCurrentUser, resetPassword, signIn, signOut } from 'aws-amplify/auth';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

const poolId = import.meta.env.VITE_COGNITO_USER_POOL_ID as string | undefined;
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined;
export const authEnabled = !!poolId && !!clientId;
if (authEnabled) Amplify.configure({ Auth: { Cognito: { userPoolId: poolId!, userPoolClientId: clientId! } } });

/** ID token do Cognito (o JWT authorizer do API Gateway valida audience = client id). */
export async function getIdToken(): Promise<string | undefined> {
  if (!authEnabled) return undefined;
  return (await fetchAuthSession()).tokens?.idToken?.toString();
}
export const sair = async () => { await signOut(); location.reload(); };

type Etapa = 'login' | 'nova-senha' | 'esqueci' | 'codigo';

function Login({ onDone }: { onDone: () => void }) {
  const [etapa, setEtapa] = useState<Etapa>('login');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => { setBusy(true); setErro(''); try { await fn(); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); } finally { setBusy(false); } };
  const enviar = (e: FormEvent) => { e.preventDefault(); void run(async () => {
    if (etapa === 'login') {
      const r = await signIn({ username: email.trim(), password: senha });
      if (r.nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') { setSenha(''); setEtapa('nova-senha'); } else if (r.isSignedIn) onDone();
    } else if (etapa === 'nova-senha') {
      const r = await confirmSignIn({ challengeResponse: senha });
      if (r.isSignedIn) onDone();
    } else if (etapa === 'esqueci') { await resetPassword({ username: email.trim() }); setEtapa('codigo'); setSenha(''); }
    else { await confirmResetPassword({ username: email.trim(), confirmationCode: codigo, newPassword: senha }); setEtapa('login'); setSenha(''); setErro('Senha alterada. Entre com a nova senha.'); }
  }); };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(160deg,#0D0A07 0%,#2B1507 45%,#D4420A 100%)' }}>
      <form onSubmit={enviar} className="card w-full max-w-sm space-y-4 bg-bg/90">
        <img src="/logo-192.png" alt="Churrasco do Joe" className="w-28 h-28 mx-auto rounded-full" />
        <h1 className="text-6xl text-primary-hover text-center">Churrasco do Joe</h1>
        <p className="font-serif italic text-gold text-center">Fogo, carne e gente boa.</p>
        {(etapa === 'login' || etapa === 'esqueci' || etapa === 'codigo') && <div className="space-y-1"><label htmlFor="email">E-mail</label><input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>}
        {etapa === 'codigo' && <div className="space-y-1"><label htmlFor="cod">Código recebido por e-mail</label><input id="cod" required value={codigo} onChange={(e) => setCodigo(e.target.value)} /></div>}
        {etapa !== 'esqueci' && <div className="space-y-1"><label htmlFor="senha">{etapa === 'nova-senha' ? 'Crie sua nova senha' : etapa === 'codigo' ? 'Nova senha' : 'Senha'}</label>
          <input id="senha" type="password" autoComplete={etapa === 'login' ? 'current-password' : 'new-password'} required value={senha} onChange={(e) => setSenha(e.target.value)} /></div>}
        {erro && <p role="alert" className="text-primary-hover text-sm">{erro}</p>}
        <button className="btn w-full" disabled={busy}>{busy ? 'Aguarde…' : etapa === 'login' ? 'Entrar' : etapa === 'esqueci' ? 'Enviar código' : 'Salvar senha'}</button>
        {etapa === 'login' && <button type="button" className="w-full text-gold underline text-sm" onClick={() => { setErro(''); setEtapa('esqueci'); }}>Esqueci a senha</button>}
        {(etapa === 'esqueci' || etapa === 'codigo') && <button type="button" className="w-full text-gold underline text-sm" onClick={() => { setErro(''); setEtapa('login'); }}>Voltar</button>}
      </form>
    </div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<'carregando' | 'fora' | 'dentro'>(authEnabled ? 'carregando' : 'dentro');
  useEffect(() => { if (authEnabled) getCurrentUser().then(() => setEstado('dentro')).catch(() => setEstado('fora')); }, []);
  if (estado === 'carregando') return <p className="p-6 text-center text-cream/60">Carregando…</p>;
  if (estado === 'fora') return <Login onDone={() => setEstado('dentro')} />;
  return <>{children}</>;
}
