import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Wallet } from 'lucide-react'
import type { ShopMembership } from './AuthContext'
import { supabase } from '../lib/supabase'
import { SHOP_TIME_ZONE, nextShopDay, shopDayStart } from '../lib/shopConfig'

type PaymentStatus = 'pending' | 'approved' | 'rejected' | 'refunded' | 'cancelled'
type Payment = {
  id: string
  appointment_id: string
  status: PaymentStatus
  amount_cents: number
  currency: string
  approved_at: string | null
  created_at: string
}
type Appointment = { id: string; customer_name: string; service_id: string; starts_at: string }

const statusLabels: Record<PaymentStatus, string> = {
  pending: 'Pendente', approved: 'Aprovado', rejected: 'Recusado', refunded: 'Reembolsado', cancelled: 'Cancelado',
}

function dateValue(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SHOP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

function startOfDay(day: string) { return shopDayStart(day).toISOString() }
function endOfDay(day: string) { return shopDayStart(nextShopDay(day)).toISOString() }
function money(cents: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100) }
function dateLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: SHOP_TIME_ZONE, day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}
function timeLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: SHOP_TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export default function Financials({ membership }: { membership: ShopMembership }) {
  const today = dateValue(new Date())
  const [from, setFrom] = useState(() => dateValue(new Date(Date.now() - 29 * 86400000)))
  const [to, setTo] = useState(today)
  const [statusFilter, setStatusFilter] = useState<'all' | PaymentStatus>('all')
  const [payments, setPayments] = useState<Payment[]>([])
  const [appointments, setAppointments] = useState<Record<string, Appointment>>({})
  const [services, setServices] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!supabase) return
    if (!from || !to || from > to) { setLoading(false); return }
    setLoading(true)
    setError(null)
    const { data: paymentRows, error: paymentError } = await supabase.from('payments')
      .select('id, appointment_id, status, amount_cents, currency, approved_at, created_at')
      .eq('barbershop_id', membership.barbershop_id)
      .gte('created_at', startOfDay(from))
      .lt('created_at', endOfDay(to))
      .order('created_at', { ascending: false })
      .limit(1000)
    if (paymentError) {
      setError('Não foi possível carregar as transações. Confira as permissões financeiras do Supabase e tente novamente.')
      setPayments([])
      setAppointments({})
      setServices({})
      setLoading(false)
      return
    }

    const rows = (paymentRows ?? []) as Payment[]
    const appointmentIds = [...new Set(rows.map((row) => row.appointment_id))]
    const appointmentResult = appointmentIds.length
      ? await supabase.from('appointments').select('id, customer_name, service_id, starts_at')
        .eq('barbershop_id', membership.barbershop_id).in('id', appointmentIds)
      : { data: [], error: null }
    if (appointmentResult.error) {
      setError('As transações carregaram, mas não foi possível carregar os dados dos atendimentos vinculados.')
      setPayments(rows)
      setAppointments({})
      setServices({})
      setLoading(false)
      return
    }

    const appointmentRows = (appointmentResult.data ?? []) as Appointment[]
    const serviceIds = [...new Set(appointmentRows.map((row) => row.service_id))]
    const serviceResult = serviceIds.length
      ? await supabase.from('services').select('id, name').eq('barbershop_id', membership.barbershop_id).in('id', serviceIds)
      : { data: [], error: null }
    if (serviceResult.error) {
      setError('As transações carregaram, mas não foi possível carregar os nomes dos serviços.')
      setPayments(rows)
      setAppointments(Object.fromEntries(appointmentRows.map((row) => [row.id, row])))
      setServices({})
      setLoading(false)
      return
    }

    setPayments(rows)
    setAppointments(Object.fromEntries(appointmentRows.map((row) => [row.id, row])))
    setServices(Object.fromEntries((serviceResult.data ?? []).map((row) => [row.id, row.name])))
    setLoading(false)
  }, [membership.barbershop_id, from, to])

  useEffect(() => { void load() }, [load])

  const totals = useMemo(() => payments.reduce((result, payment) => {
    result[payment.status] = (result[payment.status] ?? 0) + payment.amount_cents
    return result
  }, {} as Record<PaymentStatus, number>), [payments])
  const filtered = statusFilter === 'all' ? payments : payments.filter((payment) => payment.status === statusFilter)

  return <section className="admin-card admin-financials">
    <div className="admin-card-heading">
      <div><span className="eyebrow">CONTROLE DE RECEBIMENTOS</span><h2>Financeiro</h2></div>
      <button type="button" className="admin-refresh" onClick={() => void load()} disabled={loading || from > to}>
        <RefreshCw size={14} className={loading ? 'spin' : ''}/> Atualizar
      </button>
    </div>
    <div className="admin-history-filters">
      <label>De<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)}/></label>
      <label>Até<input type="date" value={to} min={from} max={today} onChange={(event) => setTo(event.target.value)}/></label>
      <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | PaymentStatus)}><option value="all">Todos</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    {from > to && <div className="admin-alert">A data inicial precisa ser anterior à data final.</div>}
    {error && <div className="admin-alert" role="alert">{error}</div>}
    <div className="admin-history-kpis">
      <article><span>Recebido</span><strong>{money(totals.approved ?? 0)}</strong><small>{payments.filter((row) => row.status === 'approved').length} aprovados</small></article>
      <article><span>Pendente</span><strong>{money(totals.pending ?? 0)}</strong><small>{payments.filter((row) => row.status === 'pending').length} cobranças</small></article>
      <article><span>Recusado</span><strong>{money(totals.rejected ?? 0)}</strong><small>{payments.filter((row) => row.status === 'rejected').length} cobranças</small></article>
      <article><span>Reembolsado</span><strong>{money(totals.refunded ?? 0)}</strong><small>{payments.filter((row) => row.status === 'refunded').length} cobranças</small></article>
    </div>
    {payments.length === 1000 && <p className="admin-history-limit">Exibindo até 1.000 transações. Reduza o período para ver uma lista mais completa.</p>}
    {loading ? <div className="admin-loading">Carregando transações…</div> : filtered.length === 0 ? <div className="admin-empty-inline"><Wallet size={15}/> Nenhuma transação encontrada neste período e status.</div> : <div className="admin-financial-list">
      {filtered.map((payment) => {
        const appointment = appointments[payment.appointment_id]
        return <article className="admin-financial-row" key={payment.id}>
          <div className="admin-financial-date"><strong>{dateLabel(payment.created_at)}</strong><small>{timeLabel(payment.created_at)}</small></div>
          <div className="admin-financial-main"><strong>{appointment?.customer_name ?? 'Atendimento'}</strong><small>{appointment ? `${services[appointment.service_id] ?? 'Serviço'} · ${dateLabel(appointment.starts_at)} às ${timeLabel(appointment.starts_at)}` : 'Dados do atendimento indisponíveis'}</small></div>
          <strong className="admin-financial-amount">{money(payment.amount_cents)}</strong>
          <span className={`admin-status status-${payment.status}`}>{statusLabels[payment.status]}</span>
        </article>
      })}
    </div>}
    <p className="admin-customer-privacy">Esta tela consulta cobranças registradas no período. Reembolsos e lançamentos presenciais não são efetuados aqui.</p>
  </section>
}
