import { Navigate, Link } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { supabaseConfigured } from '../lib/supabase'

export default function PrivatePanel() {
  const { session, ready, memberships, membershipsLoading, membershipsError, refreshMemberships, signOut } = useAuth()
  if (!supabaseConfigured) return <Navigate to="/entrar" replace />
  if (!ready || membershipsLoading) return <main id="conteudo" className="inner-page"><div className="container auth-state">Carregando seu acesso…</div></main>
  if (!session) return <Navigate to="/entrar" replace />
  if (memberships.length === 0) return <main id="conteudo" className="inner-page"><div className="container auth-state"><span className="eyebrow">ACESSO À EQUIPE</span><h1>Seu acesso ainda<br/><em>não está vinculado.</em></h1><p>{membershipsError ?? 'Esta conta ainda não possui um vínculo ativo com uma barbearia. Peça ao proprietário para cadastrar seu acesso.'}</p><button className="button button-outline" onClick={() => void refreshMemberships()}>Verificar novamente</button><button className="button button-gold" onClick={() => void signOut()}>Sair</button></div></main>
  return <main id="conteudo" className="inner-page"><div className="container auth-state"><span className="eyebrow">ÁREA PRIVADA</span><h1>Bem-vindo à<br/><em>equipe Noir.</em></h1><p>Autenticação e acesso por função estão conectados. O painel de gestão será construído na próxima etapa.</p><div className="membership-list">{memberships.map((membership) => <div key={membership.id}><strong>{membership.display_name || 'Equipe Noir'}</strong><span>{membership.role} · {membership.barbershop_id}</span></div>)}</div><div className="auth-actions"><Link to="/" className="button button-outline">Voltar ao site</Link><button className="button button-gold" onClick={() => void signOut()}>Sair</button></div></div></main>
}
