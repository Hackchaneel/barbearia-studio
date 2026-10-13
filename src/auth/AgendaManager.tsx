import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, RefreshCw, Wallet, XCircle } from 'lucide-react'
import type { ShopMembership } from './AuthContext'
import { supabase } from '../lib/supabase'
import { SHOP_TIME_ZONE, nextShopDay, shiftShopDay, shopDayStart } from '../lib/shopConfig'

type Period = 'day' | 'week' | 'month'
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
  hold_expires_at: string | null
}
type Payment = { status: string; provider: string }

const statusLabels: Record<Status, string> = {
  pending: 'Pendente', confirmed: 'Confirmado', completed: 'Concluído', cancelled: 'Cancelado', expired: 'Expirado',
}

function shopDate(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: SHOP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}
function startOfMonth(day: string) { return `${day.slice(0, 7)}-01` }
function startOfNextMonth(day: string) {
  const [year, month] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)
}
function rangeFor(period: Period, day: string) {
  if (period === 'day') return { from: day, until: nextShopDay(day) }
  if (period === 'week') {
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
    const monday = shiftShopDay(day, -((weekday + 6) % 7))
    return { from: monday, until: shiftShopDay(monday, 7) }
  }
  const monthStart = startOfMonth(day)
  return { from: monthStart, until: startOfNextMonth(day) }
}
function timeLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: SHOP_TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
function dateLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: SHOP_TIME_ZONE, weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(value))
}
function money(cents: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100) }

export default function AgendaManager({ membership, canRecordPayments, onStatusChange, onReschedule, onRecordPayment }: {
  membership: ShopMembership
  canRecordPayments: boolean
  onStatusChange: (appointment: Appointment, status: 'cancelled' | 'completed') => Promise<void>
  onReschedule: (appointment: Appointment) => Promise<void>
  onRecordPayment: (appointment: Appointment) => Promise<void>
}) {
  const today = shopDate(new Date())
  const [period, setPeriod] = useState<Period>('week')
  const [selectedDay, setSelectedDay] = useState(today)
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all')
  const [barberFilter, setBarberFilter] = useState('all')
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [services, setServices] = useState<Record<string, string>>({})
  const [barbers, setBarbers] = useState<Record<string, string>>({})
  const [payments, setPayments] = useState<Record<string, Payment>>({})
  const [barberOptions, setBarberOptions] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const range = rangeFor(period, selectedDay)

  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    setError(null)
    let request = supabase.from('appointments')
      .select('id, customer_name, customer_phone, service_id, barber_member_id, starts_at, ends_at, status, amount_cents, hold_expires_at')
      .eq('barbershop_id', membership.barbershop_id)
      .gte('starts_at', shopDayStart(range.from).toISOString())
      .lt('starts_at', shopDayStart(range.until).toISOString())
      .order('starts_at')
      .limit(1000)
    if (membership.role === 'barber') request = request.eq('barber_member_id', membership.id)
    if (statusFilter !== 'all') request = request.eq('status', statusFilter)
    if (barberFilter !== 'all' && membership.role !== 'barber') request = request.eq('barber_member_id', barberFilter)
    const { data: rows, error: appointmentsError } = await request
    if (appointmentsError) {
      setAppointments([])
      setLoading(false)
      setError('Não foi possível consultar a agenda deste período. Confira as permissões do Supabase e tente novamente.')
      return
    }

    const items = (rows ?? []) as Appointment[]
    const serviceIds = [...new Set(items.map((row) => row.service_id))]
    const barberIds = [...new Set(items.map((row) => row.barber_member_id))]
    const itemIds = items.map((row) => row.id)
    const [serviceResult, barberResult, paymentResult, memberResult] = await Promise.all([
      serviceIds.length ? supabase.from('services').select('id, name').eq('barbershop_id', membership.barbershop_id).in('id', serviceIds) : Promise.resolve({ data: [], error: null }),
      barberIds.length ? supabase.from('barbershop_members').select('id, display_name').eq('barbershop_id', membership.barbershop_id).in('id', barberIds) : Promise.resolve({ data: [], error: null }),
      canRecordPayments && itemIds.length ? supabase.from('payments').select('appointment_id, status, provider').eq('barbershop_id', membership.barbershop_id).in('appointment_id', itemIds) : Promise.resolve({ data: [], error: null }),
      membership.role !== 'barber' ? supabase.from('barbershop_members').select('id, display_name').eq('barbershop_id', membership.barbershop_id).eq('role', 'barber').eq('is_active', true).order('display_name') : Promise.resolve({ data: [], error: null }),
    ])
    if (serviceResult.error || barberResult.error || paymentResult.error || memberResult.error) {
      setAppointments(items)
      setLoading(false)
      setError('A agenda carregou parcialmente. Não foi possível consultar serviços, equipe ou pagamentos; atualize para tentar novamente.')
      return
    }

    setServices(Object.fromEntries((serviceResult.data ?? []).map((row) => [row.id, row.name])))
    setBarbers(Object.fromEntries((barberResult.data ?? []).map((row) => [row.id, row.display_name])))
    setPayments(Object.fromEntries((paymentResult.data ?? []).map((row) => [row.appointment_id, row])))
    if (membership.role === 'barber') setBarberOptions([{ id: membership.id, name: membership.display_name || 'Minha agenda' }])
    else setBarberOptions((memberResult.data ?? []).map((row) => ({ id: row.id, name: row.display_name })))
    setAppointments(items)
    setLoading(false)
  }, [membership, canRecordPayments, range.from, range.until, statusFilter, barberFilter])

  useEffect(() => { void load() }, [load])

  const groups = useMemo(() => {
    const result = new Map<string, Appointment[]>()
    for (const item of appointments) {
      const day = shopDate(new Date(item.starts_at))
      result.set(day, [...(result.get(day) ?? []), item])
    }
    return [...result.entries()]
  }, [appointments])

  async function runAction(appointment: Appointment, action: 'cancel' | 'complete' | 'reschedule' | 'payment') {
    setBusyId(appointment.id)
    try {
      if (action === 'cancel') await onStatusChange(appointment, 'cancelled')
      if (action === 'complete') await onStatusChange(appointment, 'completed')
      if (action === 'reschedule') await onReschedule(appointment)
      if (action === 'payment') await onRecordPayment(appointment)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  return <section className="admin-card admin-agenda-card">
    <div className="admin-card-heading"><div><span className="eyebrow">AGENDA DA EQUIPE</span><h2>Atendimentos</h2></div><button type="button" className="admin-refresh" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''}/> Atualizar</button></div>
    <div className="admin-agenda-controls">
      <div className="admin-agenda-period" aria-label="Período da agenda">{([['day', 'Dia'], ['week', 'Semana'], ['month', 'Mês']] as const).map(([value, label]) => <button type="button" key={value} className={period === value ? 'active' : ''} onClick={() => setPeriod(value)}>{label}</button>)}</div>
      <label className="admin-agenda-date">Data de referência<input type="date" value={selectedDay} onChange={(event) => event.target.value && setSelectedDay(event.target.value)}/></label>
      <label className="admin-agenda-filter">Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | Status)}><option value="all">Todos</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      {membership.role !== 'barber' && <label className="admin-agenda-filter">Profissional<select value={barberFilter} onChange={(event) => setBarberFilter(event.target.value)}><option value="all">Todos</option>{barberOptions.map((barber) => <option value={barber.id} key={barber.id}>{barber.name}</option>)}</select></label>}
    </div>
    <p className="admin-agenda-range">{period === 'day' ? `Dia ${range.from}` : period === 'week' ? `Semana de ${range.from} a ${shiftShopDay(range.until, -1)}` : `Mês de ${range.from.slice(0, 7)}`}</p>
    {appointments.length === 1000 && <p className="admin-history-limit">Exibindo até 1.000 atendimentos neste período. Use filtros para refinar a consulta.</p>}
    {error && <div className="admin-alert" role="alert">{error}</div>}
    {loading ? <div className="admin-loading">Carregando agenda…</div> : appointments.length === 0 ? <div className="admin-empty-inline"><CalendarDays size={15}/> Nenhum atendimento encontrado neste período e filtros.</div> : groups.map(([day, items]) => <div className="admin-day-group" key={day}>
      <h3>{dateLabel(shopDayStart(day).toISOString())}</h3>
      <div className="admin-appointment-list">{items.map((item) => {
        const payment = payments[item.id]
        const paymentLabel = payment?.provider === 'in_person' ? 'Pago presencialmente' : payment?.status === 'approved' ? 'Pago online' : payment?.status === 'pending' ? 'Pagamento pendente' : payment?.status === 'rejected' ? 'Pagamento recusado' : payment?.status === 'refunded' ? 'Reembolsado' : null
        const future = new Date(item.starts_at).getTime() > Date.now()
        const canCancel = future && (item.status === 'pending' || item.status === 'confirmed')
        const canReschedule = future && item.status === 'confirmed'
        const canComplete = item.status === 'confirmed' && new Date(item.ends_at).getTime() <= Date.now()
        const canRecord = canRecordPayments && !payment && (item.status === 'confirmed' || item.status === 'completed')
        return <article className="admin-appointment-row admin-agenda-row" key={item.id}>
          <div className="admin-appointment-time"><strong>{timeLabel(item.starts_at)}</strong><small>{dateLabel(item.starts_at)}</small></div>
          <div className="admin-appointment-main"><strong>{item.customer_name}</strong><small>{services[item.service_id] ?? 'Serviço'} · {barbers[item.barber_member_id] ?? 'Profissional'}</small></div>
          <div className="admin-appointment-contact">{item.customer_phone}</div>
          <div className="admin-appointment-price">{money(item.amount_cents)}</div>
          <div className="admin-appointment-state"><span className={`admin-status status-${item.status}`}>{statusLabels[item.status]}</span>{paymentLabel && <small className="admin-appointment-payment">{paymentLabel}</small>}<div className="admin-appointment-actions">
            {canComplete && <button type="button" disabled={busyId === item.id} onClick={() => void runAction(item, 'complete')} title="Marcar como concluído"><CheckCircle2 size={13}/> Concluir</button>}
            {canReschedule && <button type="button" disabled={busyId === item.id} onClick={() => void runAction(item, 'reschedule')} title="Alterar data e horário"><CalendarDays size={13}/> Alterar</button>}
            {canRecord && <button type="button" disabled={busyId === item.id} onClick={() => void runAction(item, 'payment')} title="Registrar pagamento presencial"><Wallet size={13}/> Recebido no local</button>}
            {canCancel && <button type="button" disabled={busyId === item.id} onClick={() => void runAction(item, 'cancel')} title="Cancelar agendamento"><XCircle size={13}/> Cancelar</button>}
            {busyId === item.id && <small>Salvando…</small>}
          </div></div>
        </article>
      })}</div>
    </div>)}
  </section>
}
