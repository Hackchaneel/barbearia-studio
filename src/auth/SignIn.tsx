import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { useAuth } from './AuthContext'

type Mode = 'signin' | 'signup'
export default function SignIn() {
  const { session } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmationPending, setConfirmationPending] = useState(false)
  if (session) return <Navigate to="/painel" replace />

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    setBusy(true); setError(''); setNotice('')
    if (mode === 'signin') {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      setConfirmationPending(false)
      if (authError) setError('Não foi possível entrar. Confira o e-mail e a senha.')
    } else {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: `${window.location.origin}/entrar`,
        },
      })
      if (authError) { setError(authError.message); setConfirmationPending(false) }
      else if (!data.session) {
        setNotice('Conta criada. Confira seu e-mail para confirmar o cadastro antes de entrar.')
        setConfirmationPending(true)
      }
      else {
        setConfirmationPending(false)
        setNotice('Conta criada com sucesso. O acesso administrativo precisa ser vinculado pelo proprietário.')
      }
    }
    setBusy(false)
  }

  const resendConfirmation = async () => {
    if (!supabase || !email) return
    setBusy(true); setError(''); setNotice('')
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/entrar` },
    })
    if (resendError) setError('Não foi possível reenviar agora. Aguarde um pouco e tente novamente.')
    else setNotice('Enviamos um novo link. Use o e-mail mais recente e abra o link uma única vez.')
    setBusy(false)
  }

  return <main id="conteudo" className="inner-page auth-page"><div className="container auth-card"><span className="eyebrow">ÁREA DA EQUIPE</span><h1>{mode === 'signin' ? <>Acesse sua <em>conta.</em></> : <>Crie sua <em>conta.</em></>}</h1><p className="auth-intro">Entre para acessar a área privada da barbearia.</p>
    {!supabaseConfigured ? <div className="auth-config"><strong>Supabase ainda não configurado</strong><span>Crie um arquivo <code>.env.local</code> com as variáveis do <code>.env.example</code> e reinicie o servidor Vite.</span></div> : <form onSubmit={(event) => void submit(event)} className="auth-form">
      {mode === 'signup' && <label>Nome completo<input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2}/></label>}
      <label>E-mail<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required/></label>
      <label>Senha<input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}/><small>Use pelo menos 8 caracteres.</small></label>
      {error && <div className="auth-message error" role="alert">{error}</div>}{notice && <div className="auth-message" role="status">{notice}</div>}
      <button className="button button-gold" disabled={busy}>{busy ? 'Aguarde…' : mode === 'signin' ? 'Entrar' : 'Criar conta'}</button>
    </form>}
    {confirmationPending && mode === 'signup' && <button className="auth-switch" type="button" disabled={busy} onClick={() => void resendConfirmation()}>{busy ? 'Enviando…' : 'Reenviar e-mail de confirmação'}</button>}
    {supabaseConfigured && <button className="auth-switch" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setNotice(''); setConfirmationPending(false) }}>{mode === 'signin' ? 'Ainda não tem uma conta? Criar conta' : 'Já tem uma conta? Entrar'}</button>}
    <Link to="/" className="auth-back">Voltar ao site</Link>
  </div></main>
}
