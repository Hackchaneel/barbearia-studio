import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { ArrowUpRight, Instagram, Menu, X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

export function Brand() {
  return <Link to="/" className="brand" aria-label="Noir, início"><span className="brand-mark">N<span>.</span></span><span className="brand-name">NOIR<small>BARBEARIA</small></span></Link>
}

export function Header() {
  const [open, setOpen] = useState(false)
  const { session, memberships } = useAuth()
  const close = () => setOpen(false)
  return <>
    <a className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-gold focus:px-4 focus:py-3 focus:text-ink" href="#conteudo">Pular para o conteúdo</a>
    <header className="site-header"><div className="container nav-wrap"><Brand/><button className="menu-toggle" aria-label={open ? 'Fechar menu' : 'Abrir menu'} onClick={() => setOpen(!open)}>{open ? <X/> : <Menu/>}</button><nav className={open ? 'main-nav is-open' : 'main-nav'}><NavLink to="/" onClick={close}>Início</NavLink><NavLink to="/servicos" onClick={close}>Serviços</NavLink><a href="/#equipe" onClick={close}>Profissionais</a><a href="/#visite" onClick={close}>A barbearia</a><Link to={session ? '/painel' : '/entrar'} onClick={close}>{session ? (memberships.length ? 'Painel' : 'Conta') : 'Equipe'}</Link><Link to="/agendar" className="nav-cta" onClick={close}>Agendar horário <ArrowUpRight size={15}/></Link></nav></div></header>
  </>
}

export function Footer() {
  return <footer className="site-footer"><div className="container footer-top"><div><Brand/><p>Seu tempo. Seu estilo.<br/>Um clássico, todos os dias.</p></div><div><span className="eyebrow">ENCONTRE A GENTE</span><p>Rua dos Pinheiros, 412<br/>Pinheiros · São Paulo, SP</p></div><div><span className="eyebrow">HORÁRIOS</span><p>Ter a sex · 9h às 20h<br/>Sáb · 9h às 18h</p></div><a className="social" href="https://instagram.com" aria-label="Instagram"><Instagram/></a></div><div className="container footer-bottom"><span>© 2025 Noir Barbearia. Todos os direitos reservados.</span><span>Feito para quem aprecia o ritual.</span></div></footer>
}
