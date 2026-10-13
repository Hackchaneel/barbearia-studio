import { useCallback, useEffect, useMemo, useState } from 'react'
import { History, RefreshCw } from 'lucide-react'
import type { ShopMembership } from './AuthContext'
import { supabase } from '../lib/supabase'

type Status = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'expired'
type Appointment = {
  id: string
  customer_name: string
  customer_phone: string
  service_id: string
  barber_member_id: string
  starts_at: string
  ends_at: string
  status: Status
  amount_cents: number
}
type Payment = { appointment_id: string; status: string; amount_cents: number }
type Catalog = { services: Record<string, string>; barbers: Record<string, string> }

const statusLabels: Record<Status, string> = {
  pending: 'Pendente', confirmed: 'Confirmado', completed: 'Concluído', cancelled: 'Cancelado', expired: 'Expirado',
}

function dayValue(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

function dayStart(date: string) { return new Date(`${date}T00:00:00-03:00`).toISOString() }
function dayAfter(date: string) { return new Date(new Date(`${date}T00:00:00-03:00`).getTime() + 86400000).toISOString() }
function money(cents: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100) }
function dateLabel(value: string) { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) }
function timeLabel(value: string) { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }

export default function AppointmentHistory({ membership, canSeeFinancials }: {
  membership: ShopMembership
  canSeeFinancials: boolean
}) {
  const today = dayValue(new Date())
  const [from, setFrom] = useState(() => dayValue(new Date(Date.now() - 29 * 86400000)))
  const [to, setTo] = useState(today)
  const [statusFilter, setStatusFilter] = useState('all')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [barberFilter, setBarberFilter] = useState('all')
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [catalog, setCatalog] = useState<Catalog>({ services: {}, barbers: {} })
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!supabase || !from || !to || from > to) return
    setLoading(true)
    setError(null)
    let query = supabase.from('appointments')
      .select('id, customer_name, customer_phone, service_id, barber_member_id, starts_at, ends_at, status, amount_cents')
      .eq('barbershop_id', membership.barbershop_id)
      .gte('starts_at', dayStart(from)).lt('starts_at', dayAfter(to))
      .order('starts_at', { ascending: false }).limit(1000)
    if (membership.role === 'barber') query = query.eq('barber_member_id', membership.id)
    const { data: rows, error: appointmentsError } = await query
    if (appointmentsError) {
      setError('Não foi possível carregar o histórico. Atualize a página ou confira as permissões do Supabase.')
      setAppointments([])
      setLoading(false)
      return
    }
    const items = (rows ?? []) as Appointment[]
    const serviceIds = [...new Set(items.map((item) => item.service_id))]
    const barberIds = [...new Set(items.map((item) => item.barber_member_id))]
    const [serviceResult, barberResult] = await Promise.all([
      serviceIds.length ? supabase.from('services').select('id, name').eq('barbershop_id', membership.barbershop_id).in('id', serviceIds) : Promise.resolve({ data: [], error: null }),
      barberIds.length ? supabase.from('barbershop_members').select('id, display_name').eq('barbershop_id', membership.barbershop_id).in('id', barberIds) : Promise.resolve({ data: [], error: null }),
    ])
    if (serviceResult.error || barberResult.error) {
      setError('O histórico carregou, mas não foi possível obter os nomes dos serviços ou profissionais.')
      setAppointments([])
      setLoading(false)
      return
    }
    setCatalog({
      services: Object.fromEntries((serviceResult.data ?? []).map((row) => [row.id, row.name])),
      barbers: Object.fromEntries((barberResult.data ?? []).map((row) => [row.id, row.display_name])),
    })
    setAppointments(items)
    if (canSeeFinancials && items.length) {
      const { data: paymentRows, error: paymentsError } = await supabase.from('payments')
        .select('appointment_id, status, amount_cents')
        .eq('barbershop_id', membership.barbershop_id)
        .eq('status', 'approved')
        .gte('approved_at', dayStart(from)).lt('approved_at', dayAfter(to))
        .limit(1000)
      if (paymentsError) {
        setError('O histórico carregou, mas não foi possível consultar os pagamentos deste período.')
        setPayments([])
      } else setPayments((paymentRows ?? []) as Payment[])
    } else setPayments([])
    setLoading(false)
  }, [membership, canSeeFinancials, from, to])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => appointments.filter((item) =>
    (statusFilter === 'all' || item.status === statusFilter)
    && (serviceFilter === 'all' || item.service_id === serviceFilter)
    && (barberFilter === 'all' || item.barber_member_id === barberFilter),
  ), [appointments, statusFilter, serviceFilter, barberFilter])
  const paidByAppointment = useMemo(() => {
    const result: Record<string, number> = {}
    for (const payment of payments) if (payment.status === 'approved') result[payment.appointment_id] = (result[payment.appointment_id] ?? 0) + payment.amount_cents
    return result
  }, [payments])
  const completedCount = filtered.filter((item) => item.status === 'completed').length
  const cancelledCount = filtered.filter((item) => item.status === 'cancelled').length
  const approvedCents = filtered.reduce((sum, item) => sum + (paidByAppointment[item.id] ?? 0), 0)
  const serviceOptions = [...new Set(appointments.map((item) => item.service_id))]
  const barberOptions = [...new Set(appointments.map((item) => item.barber_member_id))]

  return <div className="admin-history">
    <section className="admin-card">
      <div className="admin-card-heading"><div><span className="eyebrow">CONSULTA OPERACIONAL</span><h2>Histórico de agendamentos</h2></div><button type="button" className="admin-refresh" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''}/> Atualizar</button></div>
      <div className="admin-history-filters">
        <label>De<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)}/></label>
        <label>Até<input type="date" value={to} min={from} max={today} onChange={(event) => setTo(event.target.value)}/></label>
        <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Todos</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Serviço<select value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)}><option value="all">Todos</option>{serviceOptions.map((id) => <option key={id} value={id}>{catalog.services[id] ?? 'Serviço'}</option>)}</select></label>
        {canSeeFinancials && <label>Profissional<select value={barberFilter} onChange={(event) => setBarberFilter(event.target.value)}><option value="all">Todos</option>{barberOptions.map((id) => <option key={id} value={id}>{catalog.barbers[id] ?? 'Profissional'}</option>)}</select></label>}
      </div>
      {from > to && <div className="admin-alert">A data inicial precisa ser anterior à data final.</div>}
      {error && <div className="admin-alert" role="alert">{error}</div>}
      <div className="admin-history-kpis">
        <article><span>No período filtrado</span><strong>{filtered.length}</strong><small>agendamentos</small></article>
        <article><span>Concluídos</span><strong>{completedCount}</strong><small>atendimentos</small></article>
        <article><span>Cancelados</span><strong>{cancelledCount}</strong><small>agendamentos</small></article>
        {canSeeFinancials && <article><span>Pagamentos aprovados</span><strong>{money(approvedCents)}</strong><small>recebimentos online</small></article>}
      </div>
      {appointments.length === 1000 && <p className="admin-history-limit">Exibindo até 1.000 registros. Reduza o período para ver resultados mais completos.</p>}
      {loading ? <div className="admin-loading">Carregando histórico…</div> : filtered.length === 0 ? <div className="admin-empty-inline"><History size={15}/> Nenhum agendamento encontrado com esses filtros.</div> : <div className="admin-history-list">{filtered.map((item) => <article className="admin-history-row" key={item.id}>
        <div className="admin-appointment-time"><strong>{timeLabel(item.starts_at)}</strong><small>{dateLabel(item.starts_at)}</small></div>
        <div className="admin-appointment-main"><strong>{item.customer_name}</strong><small>{catalog.services[item.service_id] ?? 'Serviço'} · {catalog.barbers[item.barber_member_id] ?? 'Profissional'}</small></div>
        <div className="admin-appointment-contact">{item.customer_phone}</div>
        <div className="admin-history-price"><strong>{money(item.amount_cents)}</strong>{canSeeFinancials && paidByAppointment[item.id] ? <small>Pago: {money(paidByAppointment[item.id])}</small> : null}</div>
        <span className={`admin-status status-${item.status}`}>{statusLabels[item.status]}</span>
      </article>)}</div>}
    </section>
  </div>
}
