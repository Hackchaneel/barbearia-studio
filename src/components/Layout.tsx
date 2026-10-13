import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { ArrowUpRight, Instagram, Menu, X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { usePublicShop } from '../lib/publicShop'

export function Brand() {
  const { shop } = usePublicShop()
  const initials = shop.name.trim().slice(0, 1).toUpperCase() || 'N'
  return <Link to="/" className="brand" aria-label={`${shop.name}, início`}><span className="brand-mark">{initials}<span>.</span></span><span className="brand-name">{shop.name.toUpperCase()}<small>BARBEARIA</small></span></Link>
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
  const { shop, hours, address } = usePublicShop()
  return <footer className="site-footer"><div className="container footer-top"><div><Brand/><p>Seu tempo. Seu estilo.<br/>{shop.description || 'Um clássico, todos os dias.'}</p></div><div><span className="eyebrow">ENCONTRE A GENTE</span><p className="footer-address">{address || 'Endereço não cadastrado'}</p>{shop.phone && <a className="footer-contact" href={`tel:${shop.phone.replace(/[^+\d]/g, '')}`}>{shop.phone}</a>}{shop.email && <a className="footer-contact" href={`mailto:${shop.email}`}>{shop.email}</a>}</div><div><span className="eyebrow">HORÁRIOS</span>{hours.length ? hours.map((line) => <p className="footer-hours" key={line}>{line}</p>) : <p>Consulte os horários no agendamento.</p>}</div><a className="social" href="https://instagram.com" aria-label="Instagram"><Instagram/></a></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} {shop.name}. Todos os direitos reservados.</span><span>Feito para quem aprecia o ritual.</span></div></footer>
}
