import { useEffect, useState } from 'react'
import { ArrowRight, ArrowUpRight, Clock3, Phone, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import { barbers as demoBarbers, services as demoServices, type Service } from '../data/mock'
import { loadPublicBarbers, loadPublicServices, type PublicBarber } from '../lib/catalog'
import { supabase } from '../lib/supabase'
import { usePublicShop } from '../lib/publicShop'
function formatPrice(value: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value) }
export default function Home() {
 const { shop, hours, address } = usePublicShop()
 const [featuredServices, setFeaturedServices] = useState<Service[]>(supabase ? [] : demoServices)
 const [servicesLoading, setServicesLoading] = useState(Boolean(supabase))
 const [servicesError, setServicesError] = useState(false)
 const [featuredBarbers, setFeaturedBarbers] = useState<PublicBarber[]>(supabase ? [] : demoBarbers.map((barber, index) => ({ ...barber, id: `demo-${index}` })))
 const [teamLoading, setTeamLoading] = useState(Boolean(supabase))
 const [teamError, setTeamError] = useState(false)
 useEffect(() => {
  if (!supabase) return
  let active = true
  void loadPublicServices().then((loaded) => { if (active) setFeaturedServices(loaded) }).catch(() => { if (active) setServicesError(true) }).finally(() => { if (active) setServicesLoading(false) })
  return () => { active = false }
 }, [])
 useEffect(() => {
  if (!supabase) return
  let active = true
  void loadPublicBarbers().then((loaded) => { if (active) setFeaturedBarbers(loaded) }).catch(() => { if (active) setTeamError(true) }).finally(() => { if (active) setTeamLoading(false) })
  return () => { active = false }
 }, [])
 return <><main id="conteudo">
 <section className="hero"><div className="hero-image"/><div className="hero-shade"/><div className="container hero-content"><div className="hero-copy"><span className="eyebrow gold-line">BARBEARIA CONTEMPORÂNEA</span><h1>O seu estilo<br/>tem <em>ritual.</em></h1><p>Corte preciso, conversa boa e um tempo só seu. Entre, sente e deixe o resto com a gente.</p><div className="hero-actions"><Link to="/agendar" className="button button-gold">Agende seu horário <ArrowUpRight size={17}/></Link><a href="#servicos" className="text-link">Conheça {shop.name}<ArrowRight size={15}/></a></div><div className="hero-proof"><div className="stars"><Star/><Star/><Star/><Star/><Star/></div><span>4,9/5 · mais de 380 avaliações</span></div></div><div className="hero-side-note"><span>01 — 03</span><i/><span>O ritual começa aqui</span></div></div><div className="hero-bottom"><span>SCROLL PARA DESCOBRIR</span><span>{[shop.city, shop.state].filter(Boolean).join(' · ').toUpperCase()}</span></div></section>
 <section className="intro section-pad"><div className="container intro-grid"><div><span className="eyebrow">{shop.name.toUpperCase()}</span><h2>Mais do que um corte.<br/><em>Um momento seu.</em></h2></div><div className="intro-copy"><p>{shop.description || 'Um espaço feito para desacelerar, cuidar de si e sair com a confiança renovada.'}</p><a href="#visite" className="text-link">Descubra nossa história <ArrowRight size={15}/></a></div></div></section>
 <section id="servicos" className="services section-pad"><div className="container"><div className="section-heading"><div><span className="eyebrow">O QUE A GENTE FAZ</span><h2>Seu próximo <em>visual.</em></h2></div><Link to="/servicos" className="text-link">Todos os serviços <ArrowRight size={15}/></Link></div>{servicesError && <div className="demo-notice" role="alert">Não foi possível carregar os serviços. Consulte a página de serviços ou tente novamente.</div>}{servicesLoading ? <div className="admin-loading">Carregando serviços…</div> : featuredServices.length === 0 ? <div className="admin-empty-inline">Nenhum serviço disponível no momento.</div> : <div className="service-grid">{featuredServices.slice(0, 3).map((s, i) => <article className="service-card" key={s.id}><div className="service-card-top"><span className="service-number">{String(i+1).padStart(2,'0')}</span><s.icon size={21}/></div><h3>{s.name}</h3><p>{s.description}</p><div className="service-meta"><span><Clock3 size={14}/> {s.duration} min</span><strong>{formatPrice(s.price)}</strong></div><Link to="/agendar" className="card-link" aria-label={`Agendar ${s.name}`}><ArrowUpRight/></Link></article>)}</div>}</div></section>
 <section id="equipe" className="team section-pad"><div className="container"><div className="section-heading"><div><span className="eyebrow">MÃOS QUE ENTENDEM</span><h2>Conheça quem cuida<br/><em>do seu estilo.</em></h2></div><p className="heading-note">Experiência, técnica e personalidade<br/>em cada atendimento.</p></div>{teamError && <div className="demo-notice" role="alert">Não foi possível carregar a equipe neste momento.</div>}{teamLoading ? <div className="admin-loading">Carregando equipe…</div> : featuredBarbers.length === 0 ? <div className="admin-empty-inline">Nossa equipe está sendo atualizada.</div> : <div className="team-grid">{featuredBarbers.map((b, i) => <article className="barber" key={b.id}><div className="barber-photo">{b.image ? <img src={b.image} alt={b.name}/> : <div className="barber-photo-placeholder" aria-hidden="true">{b.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</div>}<span>{String(i+1).padStart(2,'0')}</span></div><div className="barber-info"><div><h3>{b.name}</h3><p>{b.role}</p></div><ArrowUpRight size={18}/></div></article>)}</div>}</div></section>
 <section id="visite" className="visit"><div className="visit-photo"/><div className="visit-panel"><span className="eyebrow">SUA CADEIRA ESTÁ ESPERANDO</span><h2>Um bom corte<br/>começa com<br/><em>um bom café.</em></h2><p className="shop-address">{address || 'Endereço não cadastrado'}</p><div className="visit-meta">{hours.length ? hours.slice(0, 2).map((line) => <span key={line}><Clock3 size={15}/>{line}</span>) : <span><Clock3 size={15}/> Consulte horários no agendamento</span>}<span><Phone size={15}/>{shop.phone || shop.email || 'Entre em contato'}</span></div><Link to="/agendar" className="button button-gold">Reserve seu horário <ArrowUpRight size={17}/></Link></div></section>
 <section className="quote section-pad"><div className="container quote-inner"><span className="quote-mark">“</span><blockquote>Saí da cadeira me sentindo<br/>outra pessoa. <em>Virei cliente fiel.</em></blockquote><div className="quote-rating"><div className="stars"><Star/><Star/><Star/><Star/><Star/></div><span>— Lucas M. · Cliente desde 2022</span></div></div></section>
 <section className="final-cta"><div className="container final-cta-inner"><div><span className="eyebrow">O PRÓXIMO PASSO É SEU</span><h2>Seu horário.<br/><em>Seu ritual.</em></h2></div><Link to="/agendar" className="button button-gold">Agendar agora <ArrowUpRight size={17}/></Link></div></section>
 </main></>
}

