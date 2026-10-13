import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import type { ShopMembership } from './AuthContext'
import { supabase } from '../lib/supabase'
import { SHOP_TIME_ZONE, nextShopDay, shopDayStart } from '../lib/shopConfig'

type Status = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'expired'
type Appointment = {
  id: string
  customer_name: string
  customer_phone: string
  service_id: string
  barber_member_id: string
  starts_at: string
  status: Status
  amount_cents: number
}
type Payment = { appointment_id: string; amount_cents: number }
type ReportData = {
  appointments: Appointment[]
  serviceNames: Record<string, string>
  barberNames: Record<string, string>
  payments: Payment[]
}
const statusNames: Record<Status, string> = {
  pending: 'Pendente', confirmed: 'Confirmado', completed: 'Concluído', cancelled: 'Cancelado', expired: 'Expirado',
}

function dateValue(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: SHOP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}
function startOfDay(day: string) { return shopDayStart(day).toISOString() }
function endOfDay(day: string) { return shopDayStart(nextShopDay(day)).toISOString() }
function currency(cents: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100) }
function safeCsv(value: string | number) {
  let text = String(value ?? '')
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export default function Reports({ membership, canSeeFinancials }: {
  membership: ShopMembership
  canSeeFinancials: boolean
}) {
  const today = dateValue(new Date())
  const [from, setFrom] = useState(() => dateValue(new Date(Date.now() - 29 * 86400000)))
  const [to, setTo] = useState(today)
  const [data, setData] = useState<ReportData>({ appointments: [], serviceNames: {}, barberNames: {}, payments: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!supabase || !from || !to || from > to) return
    setLoading(true)
    setError(null)
    let query = supabase.from('appointments')
      .select('id, customer_name, customer_phone, service_id, barber_member_id, starts_at, status, amount_cents')
      .eq('barbershop_id', membership.barbershop_id)
      .gte('starts_at', startOfDay(from)).lt('starts_at', endOfDay(to))
      .order('starts_at', { ascending: true }).limit(1000)
    if (membership.role === 'barber') query = query.eq('barber_member_id', membership.id)
    const { data: rows, error: appointmentsError } = await query
    if (appointmentsError) {
      setError('Não foi possível carregar o relatório. Confira a conexão e as permissões do Supabase.')
      setData({ appointments: [], serviceNames: {}, barberNames: {}, payments: [] })
      setLoading(false)
      return
    }
    const appointments = (rows ?? []) as Appointment[]
    const serviceIds = [...new Set(appointments.map((item) => item.service_id))]
    const barberIds = [...new Set(appointments.map((item) => item.barber_member_id))]
    const [services, barbers] = await Promise.all([
      serviceIds.length ? supabase.from('services').select('id, name').eq('barbershop_id', membership.barbershop_id).in('id', serviceIds) : Promise.resolve({ data: [], error: null }),
      barberIds.length ? supabase.from('barbershop_members').select('id, display_name').eq('barbershop_id', membership.barbershop_id).in('id', barberIds) : Promise.resolve({ data: [], error: null }),
    ])
    if (services.error || barbers.error) {
      setError('Não foi possível carregar os nomes dos serviços ou profissionais do relatório.')
      setLoading(false)
      return
    }
    let payments: Payment[] = []
    if (canSeeFinancials && appointments.length) {
      const result = await supabase.from('payments').select('appointment_id, amount_cents')
        .eq('barbershop_id', membership.barbershop_id).eq('status', 'approved')
        .gte('approved_at', startOfDay(from)).lt('approved_at', endOfDay(to)).limit(1000)
      if (result.error) setError('Relatório carregado, mas não foi possível consultar os pagamentos aprovados.')
      else payments = (result.data ?? []) as Payment[]
    }
    setData({
      appointments,
      serviceNames: Object.fromEntries((services.data ?? []).map((item) => [item.id, item.name])),
      barberNames: Object.fromEntries((barbers.data ?? []).map((item) => [item.id, item.display_name])),
      payments,
    })
    setLoading(false)
  }, [membership, canSeeFinancials, from, to])

  useEffect(() => { void load() }, [load])

  const approvedByAppointment = useMemo(() => {
    const map: Record<string, number> = {}
    for (const payment of data.payments) map[payment.appointment_id] = (map[payment.appointment_id] ?? 0) + payment.amount_cents
    return map
  }, [data.payments])
  const completed = data.appointments.filter((item) => item.status === 'completed')
  const cancelled = data.appointments.filter((item) => item.status === 'cancelled')
  const pendingOrConfirmed = data.appointments.filter((item) => item.status === 'pending' || item.status === 'confirmed')
  const received = data.appointments.reduce((sum, item) => sum + (approvedByAppointment[item.id] ?? 0), 0)

  const byService = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of data.appointments) counts.set(item.service_id, (counts.get(item.service_id) ?? 0) + 1)
    return [...counts].map(([id, count]) => ({ id, name: data.serviceNames[id] ?? 'Serviço', count }))
      .sort((a, b) => b.count - a.count).slice(0, 6)
  }, [data.appointments, data.serviceNames])
  const byBarber = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of data.appointments) counts.set(item.barber_member_id, (counts.get(item.barber_member_id) ?? 0) + 1)
    return [...counts].map(([id, count]) => ({ id, name: data.barberNames[id] ?? 'Profissional', count }))
      .sort((a, b) => b.count - a.count).slice(0, 6)
  }, [data.appointments, data.barberNames])

  const exportCsv = () => {
    const headings = ['Data', 'Hora', 'Cliente', 'Telefone', 'Serviço', 'Profissional', 'Status']
    if (canSeeFinancials) headings.push('Valor do serviço', 'Pagamento aprovado')
    const lines = [headings, ...data.appointments.map((item) => {
      const line: Array<string | number> = [
        new Intl.DateTimeFormat('pt-BR', { timeZone: SHOP_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(item.starts_at)),
        new Intl.DateTimeFormat('pt-BR', { timeZone: SHOP_TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(item.starts_at)),
        item.customer_name, item.customer_phone, data.serviceNames[item.service_id] ?? 'Serviço',
        data.barberNames[item.barber_member_id] ?? 'Profissional', statusNames[item.status],
      ]
      if (canSeeFinancials) line.push(item.amount_cents / 100, (approvedByAppointment[item.id] ?? 0) / 100)
      return line
    })].map((line) => line.map(safeCsv).join(';'))
    const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `relatorio-noir-${from}-${to}.csv`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const maxService = Math.max(1, ...byService.map((item) => item.count))
  const maxBarber = Math.max(1, ...byBarber.map((item) => item.count))
  return <section className="admin-card admin-reports">
    <div className="admin-card-heading"><div><span className="eyebrow">DESEMPENHO DO NEGÓCIO</span><h2>Relatórios</h2></div><div className="admin-report-actions"><button type="button" className="admin-refresh" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''}/> Atualizar</button><button type="button" className="admin-refresh" onClick={exportCsv} disabled={loading || data.appointments.length === 0}><Download size={14}/> Exportar CSV</button></div></div>
    <div className="admin-history-filters"><label>De<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)}/></label><label>Até<input type="date" value={to} min={from} max={today} onChange={(event) => setTo(event.target.value)}/></label></div>
    {from > to && <div className="admin-alert">A data inicial precisa ser anterior à data final.</div>}
    {error && <div className="admin-alert" role="alert">{error}</div>}
    {loading ? <div className="admin-loading">Calculando relatório…</div> : <>
      <div className="admin-history-kpis">
        <article><span>Agendamentos</span><strong>{data.appointments.length}</strong><small>no período</small></article>
        <article><span>Concluídos</span><strong>{completed.length}</strong><small>atendimentos realizados</small></article>
        <article><span>Cancelados</span><strong>{cancelled.length}</strong><small>no período</small></article>
        <article><span>Ativos</span><strong>{pendingOrConfirmed.length}</strong><small>pendentes ou confirmados</small></article>
        {canSeeFinancials && <article><span>Recebido online</span><strong>{currency(received)}</strong><small>pagamentos aprovados</small></article>}
      </div>
      {data.appointments.length === 1000 && <p className="admin-history-limit">Exibindo até 1.000 registros. Reduza o período para obter um relatório mais completo.</p>}
      {!data.appointments.length ? <div className="admin-empty-inline">Nenhum agendamento encontrado neste período.</div> : <div className="admin-report-charts">
        <div className="admin-report-chart"><h3>Serviços mais agendados</h3>{byService.map((item) => <div className="admin-report-bar-row" key={item.id}><span>{item.name}</span><div><i style={{ width: `${item.count / maxService * 100}%` }}/></div><strong>{item.count}</strong></div>)}</div>
        <div className="admin-report-chart"><h3>Atendimentos por profissional</h3>{byBarber.map((item) => <div className="admin-report-bar-row" key={item.id}><span>{item.name}</span><div><i style={{ width: `${item.count / maxBarber * 100}%` }}/></div><strong>{item.count}</strong></div>)}</div>
      </div>}
    </>}
  </section>
}
