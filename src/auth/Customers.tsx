import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search, Users } from 'lucide-react'
import type { ShopMembership } from './AuthContext'
import { supabase } from '../lib/supabase'
import { SHOP_TIME_ZONE } from '../lib/shopConfig'

type Appointment = {
  id: string
  customer_name: string
  customer_phone: string
  service_id: string
  barber_member_id: string
  starts_at: string
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'expired'
}
type Customer = {
  key: string
  name: string
  phone: string
  visits: Appointment[]
}

const statusLabels: Record<Appointment['status'], string> = {
  pending: 'Pendente', confirmed: 'Confirmado', completed: 'Concluído', cancelled: 'Cancelado', expired: 'Expirado',
}

function phoneKey(value: string) {
  return value.replace(/\D/g, '')
}

function formattedPhonePattern(digits: string) {
  if (digits.length === 11) return `%(${digits.slice(0, 2)})%${digits.slice(2, 7)}-${digits.slice(7)}%`
  if (digits.length === 10) return `%(${digits.slice(0, 2)})%${digits.slice(2, 6)}-${digits.slice(6)}%`
  return null
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: SHOP_TIME_ZONE,
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(value))
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: SHOP_TIME_ZONE,
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

export default function Customers({ membership }: { membership: ShopMembership }) {
  const [search, setSearch] = useState('')
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [services, setServices] = useState<Record<string, string>>({})
  const [barbers, setBarbers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [refreshIndex, setRefreshIndex] = useState(0)

  const query = search.trim().replace(/[%_(),\\]/g, ' ').replace(/\s+/g, ' ').slice(0, 80)
  const phoneQuery = phoneKey(query)

  const load = useCallback(async () => {
    if (!supabase || query.length < 2) {
      setAppointments([])
      setServices({})
      setBarbers({})
      setSearched(false)
      setError(null)
      return
    }

    setLoading(true)
    setSearched(true)
    setError(null)
    setExpandedKey(null)

    const base = () => supabase!.from('appointments')
      .select('id, customer_name, customer_phone, service_id, barber_member_id, starts_at, status')
      .eq('barbershop_id', membership.barbershop_id)
      .order('starts_at', { ascending: false })
      .limit(500)
    const nameRequest = base().ilike('customer_name', `%${query}%`)
    const phonePatterns = phoneQuery.length >= 3
      ? [...new Set([`%${query}%`, ...(formattedPhonePattern(phoneQuery) ? [formattedPhonePattern(phoneQuery)!] : [])])]
      : []
    const [nameResult, ...phoneResults] = await Promise.all([
      nameRequest,
      ...phonePatterns.map((pattern) => base().ilike('customer_phone', pattern)),
    ])

    if (nameResult.error || phoneResults.some((result) => result.error)) {
      setError('Não foi possível pesquisar clientes. Confira as permissões do Supabase e tente novamente.')
      setAppointments([])
      setLoading(false)
      return
    }

    let rows = [...(nameResult.data ?? []), ...phoneResults.flatMap((result) => result.data ?? [])] as Appointment[]
    if (membership.role === 'barber') rows = rows.filter((row) => row.barber_member_id === membership.id)
    const uniqueRows = [...new Map(rows.map((row) => [row.id, row])).values()]
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    const serviceIds = [...new Set(uniqueRows.map((row) => row.service_id))]
    const barberIds = [...new Set(uniqueRows.map((row) => row.barber_member_id))]
    const [serviceResult, barberResult] = await Promise.all([
      serviceIds.length ? supabase.from('services').select('id, name').eq('barbershop_id', membership.barbershop_id).in('id', serviceIds) : Promise.resolve({ data: [], error: null }),
      barberIds.length ? supabase.from('barbershop_members').select('id, display_name').eq('barbershop_id', membership.barbershop_id).in('id', barberIds) : Promise.resolve({ data: [], error: null }),
    ])
    if (serviceResult.error || barberResult.error) {
      setError('A busca encontrou registros, mas não foi possível carregar os serviços ou profissionais.')
      setAppointments([])
      setLoading(false)
      return
    }

    setServices(Object.fromEntries((serviceResult.data ?? []).map((row) => [row.id, row.name])))
    setBarbers(Object.fromEntries((barberResult.data ?? []).map((row) => [row.id, row.display_name])))
    setAppointments(uniqueRows)
    setLoading(false)
  }, [membership, query, phoneQuery, refreshIndex])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250)
    return () => window.clearTimeout(timer)
  }, [load])

  const customers = useMemo(() => {
    const grouped = new Map<string, Customer>()
    for (const appointment of appointments) {
      const key = phoneKey(appointment.customer_phone) || appointment.customer_name.trim().toLocaleLowerCase('pt-BR')
      const customer = grouped.get(key)
      if (customer) customer.visits.push(appointment)
      else grouped.set(key, {
        key,
        name: appointment.customer_name,
        phone: appointment.customer_phone,
        visits: [appointment],
      })
    }
    return [...grouped.values()].sort((a, b) => b.visits[0].starts_at.localeCompare(a.visits[0].starts_at))
  }, [appointments])

  return <section className="admin-card admin-customers">
    <div className="admin-card-heading">
      <div><span className="eyebrow">RELACIONAMENTO</span><h2>Clientes</h2></div>
      <button type="button" className="admin-refresh" onClick={() => setRefreshIndex((value) => value + 1)} disabled={loading || query.length < 2}>
        <RefreshCw size={14} className={loading ? 'spin' : ''}/> Atualizar
      </button>
    </div>
    <label className="admin-customer-search">
      <Search size={16}/>
      <span className="sr-only">Pesquisar cliente por nome ou telefone</span>
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquise por nome ou telefone" maxLength={80}/>
    </label>
    <p className="admin-customer-privacy">A busca considera somente clientes com agendamentos nesta barbearia e respeita os atendimentos visíveis para seu perfil.</p>
    {query.length > 0 && query.length < 2 && <div className="admin-empty-inline">Digite pelo menos 2 caracteres para pesquisar.</div>}
    {error && <div className="admin-alert" role="alert">{error}</div>}
    {loading ? <div className="admin-loading">Pesquisando clientes…</div> : !searched ? <div className="admin-empty"><Users/><h2>Encontre um cliente</h2><p>Digite um nome ou telefone para consultar os atendimentos.</p></div> : customers.length === 0 ? <div className="admin-empty-inline">Nenhum cliente encontrado com essa busca.</div> : <>
      <div className="admin-customer-count">{customers.length} cliente{customers.length === 1 ? '' : 's'} encontrado{customers.length === 1 ? '' : 's'}</div>
      <div className="admin-customer-list">{customers.map((customer) => {
        const expanded = expandedKey === customer.key
        const latest = customer.visits[0]
        return <article className="admin-customer" key={customer.key}>
          <button type="button" className="admin-customer-row" aria-expanded={expanded} onClick={() => setExpandedKey(expanded ? null : customer.key)}>
            <span className="admin-customer-avatar" aria-hidden="true">{customer.name.slice(0, 1).toUpperCase()}</span>
            <span className="admin-customer-identity"><strong>{customer.name}</strong><small>{customer.phone}</small></span>
            <span className="admin-customer-latest"><strong>Último atendimento</strong><small>{dateLabel(latest.starts_at)} · {timeLabel(latest.starts_at)}</small></span>
            <span className="admin-customer-visits">{customer.visits.length} visita{customer.visits.length === 1 ? '' : 's'} na busca</span>
            <span className="admin-customer-chevron" aria-hidden="true">{expanded ? '−' : '+'}</span>
          </button>
          {expanded && <div className="admin-customer-history">{customer.visits.map((visit) => <div className="admin-customer-visit" key={visit.id}>
            <span>{dateLabel(visit.starts_at)} · {timeLabel(visit.starts_at)}</span>
            <span>{services[visit.service_id] ?? 'Serviço'} · {barbers[visit.barber_member_id] ?? 'Profissional'}</span>
            <span className={`admin-status status-${visit.status}`}>{statusLabels[visit.status]}</span>
          </div>)}</div>}
        </article>
      })}</div>
      {(appointments.length >= 500 || customers.length >= 500) && <p className="admin-history-limit">Exibindo até 500 atendimentos por busca. Refine a pesquisa para encontrar registros mais específicos.</p>}
    </>}
  </section>
}
