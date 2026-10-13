import { useEffect, useState } from 'react'
import { ArrowUpRight, Check, Clock3, Scissors } from 'lucide-react'
import { Link } from 'react-router-dom'
import { services as demoServices, type Service } from '../data/mock'
import { loadPublicServices } from '../lib/catalog'
import { supabase } from '../lib/supabase'
import { usePublicShop } from '../lib/publicShop'

function formatPrice(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export default function Services() {
  const { shop } = usePublicShop()
  const [items, setItems] = useState<Service[]>(supabase ? [] : demoServices)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    let active = true
    void loadPublicServices().then((loaded) => {
      if (active) setItems(loaded)
    }).catch(() => {
      if (active) setError('Não foi possível carregar os serviços agora. Tente novamente em instantes.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  return <main id="conteudo" className="inner-page"><div className="container">
    <div className="page-hero"><span className="eyebrow">SERVIÇOS · {shop.name.toUpperCase()}</span><h1>O cuidado certo<br/><em>para cada estilo.</em></h1><p>Escolha seu ritual. A gente cuida do resto.</p></div>
    {error && <div className="admin-alert" role="alert">{error}</div>}
    {loading ? <div className="admin-loading">Carregando serviços…</div> : items.length === 0 ? <div className="admin-empty-inline">Nenhum serviço disponível no momento.</div> : <div className="service-list">{items.map((service, index) => {
      const Icon = service.icon ?? Scissors
      return <article className="service-row" key={service.id}>
        <span className="service-number">{String(index + 1).padStart(2, '0')}</span>
        <div className="service-row-icon"><Icon/></div>
        <div className="service-row-main"><h2>{service.name}</h2><p>{service.description}</p><span><Clock3 size={14}/>{service.duration} minutos</span></div>
        <strong>{formatPrice(service.price)}</strong>
        <Link className="button button-outline" to="/agendar">Agendar <ArrowUpRight size={16}/></Link>
      </article>
    })}</div>}
    <div className="note-box"><Check size={17}/><span>Todos os serviços incluem uma consulta rápida para entender o que combina com você.</span></div>
  </div></main>
}
