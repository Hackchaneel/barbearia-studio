import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { Activity, CalendarClock, CalendarDays, ChevronDown, Clock3, LogOut, RefreshCw, Scissors, Users, Wallet, Ban, CheckCircle2, XCircle, CalendarPlus, History, BarChart3, Settings } from 'lucide-react'
import { useAuth, type ShopMembership } from './AuthContext'
import { supabase, supabaseConfigured } from '../lib/supabase'
import BlockedTimes from './BlockedTimes'
import ServicesManager from './ServicesManager'
import TeamManager from './TeamManager'
import ManualAppointment from './ManualAppointment'
import AppointmentHistory from './AppointmentHistory'
import Reports from './Reports'
import BarbershopSettings from './BarbershopSettings'
import Customers from './Customers'
import Financials from './Financials'
import { SHOP_TIME_ZONE, nextShopDay, shiftShopDay, shopDayStart, shopLocalDateTime } from '../lib/shopConfig'

type PanelView = 'dashboard' | 'agenda' | 'history' | 'customers' | 'finance' | 'reports' | 'new' | 'blocks' | 'services' | 'team' | 'settings'
type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'expired'
type Appointment = {
  id: string
  customer_name: string
  customer_phone: string
  service_id: string
  barber_member_id: string
  starts_at: string
  ends_at: string
  status: AppointmentStatus
  amount_cents: number
  hold_expires_at: string | null
}
type PaymentSummary = { status: string; provider: string; payment_method: string | null }
type DashboardData = {
  appointments: Appointment[]
  services: Record<string, string>
  barbers: Record<string, string>
  shopName: string
  pendingPayments: number
  receivedTodayCents: number
  paymentsByAppointment: Record<string, PaymentSummary>
}

const timeZone = SHOP_TIME_ZONE
const roleName: Record<ShopMembership['role'], string> = {
  owner: 'Proprietário', manager: 'Gerente', barber: 'Barbeiro',
}
const statusName: Record<AppointmentStatus, string> = {
  pending: 'Pendente', confirmed: 'Confirmado', completed: 'Concluído', cancelled: 'Cancelado', expired: 'Expirado',
}

function dayKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

function dayBoundary(day: string) {
  return shopDayStart(day)
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions = { weekday: 'short', day: '2-digit', month: 'short' }) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone, ...options }).format(new Date(value))
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100)
}

function activeAppointment(appointment: Appointment, now: number) {
  return appointment.status === 'confirmed'
    || (appointment.status === 'pending' && Boolean(appointment.hold_expires_at) && new Date(appointment.hold_expires_at!).getTime() > now)
}

export default function PrivatePanel() {
  const { session, ready, memberships, membershipsLoading, membershipsError, refreshMemberships, signOut } = useAuth()
  const [selectedMembershipId, setSelectedMembershipId] = useState('')
  const [view, setView] = useState<PanelView>('dashboard')
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [updatingAppointmentId, setUpdatingAppointmentId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const membership = memberships.find((item) => item.id === selectedMembershipId) ?? memberships[0]
  const canSeeFinancials = membership?.role === 'owner' || membership?.role === 'manager'
  const canManageBlocks = canSeeFinancials
  const canManageServices = canSeeFinancials
  const canManageTeam = canSeeFinancials
  const shopName = data?.shopName || 'Barbearia'

  useEffect(() => {
    if (memberships.length === 0) {
      setSelectedMembershipId('')
      return
    }
    if (!memberships.some((item) => item.id === selectedMembershipId)) {
      setSelectedMembershipId(memberships[0].id)
    }
  }, [memberships, selectedMembershipId])

  const loadDashboard = useCallback(async () => {
    if (!supabase || !membership) return
    setLoading(true)
    setError(null)
    const now = new Date()
    const today = dayKey(now)
    const tomorrow = shopDayStart(nextShopDay(today))
    const weekEnd = shopDayStart(shiftShopDay(today, 7))

    let appointmentQuery = supabase.from('appointments')
      .select('id, customer_name, customer_phone, service_id, barber_member_id, starts_at, ends_at, status, amount_cents, hold_expires_at')
      .eq('barbershop_id', membership.barbershop_id)
      .gte('starts_at', dayBoundary(today).toISOString())
      .lt('starts_at', weekEnd.toISOString())
      .order('starts_at')
      .limit(100)
    if (membership.role === 'barber') appointmentQuery = appointmentQuery.eq('barber_member_id', membership.id)

    const [{ data: appointmentRows, error: appointmentError }, { data: shop, error: shopError }] = await Promise.all([
      appointmentQuery,
      supabase.from('barbershops').select('name').eq('id', membership.barbershop_id).maybeSingle(),
    ])
    if (appointmentError || shopError) {
      setError('Não foi possível carregar a agenda. Confira se as migrações do Supabase foram aplicadas e se sua conta tem acesso à barbearia.')
      setData(null)
      setLoading(false)
      return
    }

    const rows = (appointmentRows ?? []) as Appointment[]
    const serviceIds = [...new Set(rows.map((row) => row.service_id))]
    const barberIds = [...new Set(rows.map((row) => row.barber_member_id))]
    const [serviceResult, barberResult] = await Promise.all([
      serviceIds.length ? supabase.from('services').select('id, name').eq('barbershop_id', membership.barbershop_id).in('id', serviceIds) : Promise.resolve({ data: [], error: null }),
      barberIds.length ? supabase.from('barbershop_members').select('id, display_name').eq('barbershop_id', membership.barbershop_id).in('id', barberIds) : Promise.resolve({ data: [], error: null }),
    ])
    if (serviceResult.error || barberResult.error) {
      setError('A agenda carregou, mas não foi possível consultar os nomes de serviços ou profissionais.')
      setData(null)
      setLoading(false)
      return
    }

    let pendingPayments = 0
    let receivedTodayCents = 0
    let paymentsByAppointment: Record<string, PaymentSummary> = {}
    if (canSeeFinancials) {
      const [pendingResult, receivedResult, appointmentPaymentResult] = await Promise.all([
        supabase.from('payments').select('appointment_id')
          .eq('barbershop_id', membership.barbershop_id).eq('status', 'pending'),
        supabase.from('payments').select('amount_cents')
          .eq('barbershop_id', membership.barbershop_id).eq('status', 'approved')
          .gte('approved_at', dayBoundary(today).toISOString()).lt('approved_at', tomorrow.toISOString()),
        rows.length ? supabase.from('payments').select('appointment_id, status, provider, payment_method')
          .eq('barbershop_id', membership.barbershop_id).in('appointment_id', rows.map((row) => row.id))
          : Promise.resolve({ data: [], error: null }),
      ])
      if (pendingResult.error || receivedResult.error || appointmentPaymentResult.error) {
        setError('A agenda carregou, mas não foi possível consultar os indicadores financeiros desta conta.')
        setData(null)
        setLoading(false)
        return
      }
      paymentsByAppointment = Object.fromEntries((appointmentPaymentResult.data ?? []).map((payment) => [payment.appointment_id, payment]))
      const pendingAppointmentIds = [...new Set((pendingResult.data ?? []).map((payment) => payment.appointment_id))]
      if (pendingAppointmentIds.length) {
        const { data: pendingAppointments, error: pendingAppointmentsError } = await supabase.from('appointments')
          .select('id, status, hold_expires_at')
          .eq('barbershop_id', membership.barbershop_id)
          .in('id', pendingAppointmentIds)
        if (pendingAppointmentsError) {
          setError('A agenda carregou, mas não foi possível validar as reservas pendentes.')
          setData(null)
          setLoading(false)
          return
        }
        pendingPayments = (pendingAppointments ?? []).filter((item) =>
          item.status === 'pending' && item.hold_expires_at && new Date(item.hold_expires_at).getTime() > now.getTime(),
        ).length
      }
      receivedTodayCents = (receivedResult.data ?? []).reduce((sum, payment) => sum + payment.amount_cents, 0)
    }

    setData({
      appointments: rows,
      services: Object.fromEntries((serviceResult.data ?? []).map((service) => [service.id, service.name])),
      barbers: Object.fromEntries((barberResult.data ?? []).map((barber) => [barber.id, barber.display_name])),
      shopName: shop?.name ?? 'Barbearia',
      pendingPayments,
      receivedTodayCents,
      paymentsByAppointment,
    })
    setLoading(false)
  }, [membership, canSeeFinancials])

  const updateAppointmentStatus = useCallback(async (appointment: Appointment, status: 'cancelled' | 'completed') => {
    if (!supabase) return
    if (status === 'cancelled' && !window.confirm('Cancelar este agendamento? Se já foi pago, o reembolso não será processado automaticamente.')) return
    setUpdatingAppointmentId(appointment.id)
    setError(null)
    setNotice(null)
    const { error: updateError } = await supabase.rpc('update_appointment_status', {
      _appointment_id: appointment.id,
      _new_status: status,
    })
    if (updateError) {
      setError(status === 'completed'
        ? 'Não foi possível concluir o atendimento. Só é possível concluir um agendamento confirmado depois do horário final.'
        : 'Não foi possível cancelar o atendimento. Atualize a agenda e tente novamente.')
    } else {
      await loadDashboard()
    }
    setUpdatingAppointmentId(null)
  }, [loadDashboard])

  const rescheduleAppointment = useCallback(async (appointment: Appointment) => {
    if (!supabase) return
    const currentValue = `${dayKey(new Date(appointment.starts_at))} ${formatTime(appointment.starts_at)}`
    const requested = window.prompt('Informe a nova data e hora no fuso da barbearia, no formato AAAA-MM-DD HH:MM. O horário deve estar na agenda disponível.', currentValue)
    if (!requested) return
    const match = requested.trim().match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/)
    if (!match) {
      setError('Formato inválido. Use AAAA-MM-DD HH:MM, por exemplo 2026-10-20 14:30.')
      return
    }
    const [, newDay, newTime] = match
    if (Number(newTime.slice(3, 5)) % 15 !== 0) {
      setError('Escolha um horário em intervalos de 15 minutos.')
      return
    }
    const nextStart = shopLocalDateTime(newDay, newTime)
    if (dayKey(nextStart) !== newDay || formatTime(nextStart.toISOString()) !== newTime) {
      setError('Essa data ou horário não existe no fuso configurado para a barbearia.')
      return
    }

    setUpdatingAppointmentId(appointment.id)
    setError(null)
    setNotice(null)
    const { error: rescheduleError } = await supabase.rpc('reschedule_appointment', {
      _appointment_id: appointment.id,
      _starts_at: nextStart.toISOString(),
    })
    if (rescheduleError) {
      setError(rescheduleError.code === '23P01'
        ? 'Esse horário não está disponível ou está fora da jornada. Escolha outro horário.'
        : rescheduleError.code === '42501'
          ? 'Sua conta não tem permissão para alterar este agendamento.'
          : 'Não foi possível alterar o horário. Atualize a agenda e tente novamente.')
    } else {
      setNotice('Horário alterado com sucesso. A agenda foi atualizada e a alteração ficou registrada no histórico.')
      await loadDashboard()
    }
    setUpdatingAppointmentId(null)
  }, [loadDashboard])

  const recordInPersonPayment = useCallback(async (appointment: Appointment) => {
    if (!supabase || !canSeeFinancials) return
    const methods = [
      ['1', 'cash', 'Dinheiro'], ['2', 'pix', 'Pix'], ['3', 'debit_card', 'Cartão de débito'],
      ['4', 'credit_card', 'Cartão de crédito'], ['5', 'other', 'Outro'],
    ] as const
    const answer = window.prompt(`Registrar recebimento de ${money(appointment.amount_cents)}.\n\n1 — Dinheiro\n2 — Pix\n3 — Cartão de débito\n4 — Cartão de crédito\n5 — Outro\n\nDigite o número da forma recebida.`)
    if (answer === null) return
    const selected = methods.find(([key]) => key === answer.trim())
    if (!selected) {
      setError('Escolha uma opção de 1 a 5 para informar a forma de pagamento.')
      return
    }
    if (!window.confirm(`Confirmar o recebimento de ${money(appointment.amount_cents)} via ${selected[2]}?`)) return

    setUpdatingAppointmentId(appointment.id)
    setError(null)
    setNotice(null)
    const { error: paymentError } = await supabase.rpc('record_in_person_payment', {
      _appointment_id: appointment.id,
      _payment_method: selected[1],
    })
    if (paymentError) {
      setError(paymentError.code === '23505'
        ? 'Já existe uma cobrança vinculada a este agendamento. O recebimento presencial não foi lançado.'
        : paymentError.code === '42501'
          ? 'Somente proprietário ou gerente pode lançar pagamentos presenciais.'
          : 'Não foi possível registrar o recebimento. Confira se a Etapa 10 foi aplicada no Supabase.')
    } else {
      setNotice(`Recebimento de ${money(appointment.amount_cents)} via ${selected[2]} registrado no financeiro.`)
      await loadDashboard()
    }
    setUpdatingAppointmentId(null)
  }, [canSeeFinancials, loadDashboard])

  useEffect(() => {
    if (membership) void loadDashboard()
  }, [membership, loadDashboard])

  const appointments = data?.appointments ?? []
  const now = Date.now()
  const today = dayKey(new Date())
  const tomorrow = shopDayStart(nextShopDay(today))
  const todayAppointments = appointments.filter((item) => item.starts_at >= dayBoundary(today).toISOString() && item.starts_at < tomorrow.toISOString())
  const activeToday = todayAppointments.filter((item) => activeAppointment(item, now))
  const upcoming = appointments.filter((item) => new Date(item.starts_at).getTime() >= now && activeAppointment(item, now)).slice(0, 8)
  const cancelledToday = todayAppointments.filter((item) => item.status === 'cancelled').length
  const agendaGroups = useMemo(() => {
    const groups = new Map<string, Appointment[]>()
    for (const item of appointments) {
      const key = dayKey(new Date(item.starts_at))
      groups.set(key, [...(groups.get(key) ?? []), item])
    }
    return [...groups.entries()]
  }, [appointments])

  if (!supabaseConfigured) return <Navigate to="/entrar" replace />
  if (!ready || membershipsLoading) return <main id="conteudo" className="inner-page"><div className="container auth-state">Carregando seu acesso…</div></main>
  if (!session) return <Navigate to="/entrar" replace />
  if (memberships.length === 0) return <main id="conteudo" className="inner-page"><div className="container auth-state"><span className="eyebrow">ACESSO À EQUIPE</span><h1>Seu acesso ainda<br/><em>não está vinculado.</em></h1><p>{membershipsError ?? 'Esta conta ainda não possui um vínculo ativo com uma barbearia. Peça ao proprietário para cadastrar seu acesso.'}</p><button className="button button-outline" onClick={() => void refreshMemberships()}>Verificar novamente</button><button className="button button-gold" onClick={() => void signOut()}>Sair</button></div></main>

  return <main id="conteudo" className="admin-shell">
    <aside className="admin-sidebar">
      <Link to="/" className="admin-brand"><span className="brand-mark">{shopName.trim().slice(0, 1).toUpperCase() || 'B'}<span>.</span></span><span>{shopName}<small>PAINEL DE GESTÃO</small></span></Link>
      <div className="admin-shop-label">BARBEARIA</div>
      {memberships.length > 1 ? <label className="admin-shop-select"><span className="sr-only">Selecionar vínculo da equipe</span><select value={membership?.id ?? ''} onChange={(event) => setSelectedMembershipId(event.target.value)}>{memberships.map((item) => <option key={item.id} value={item.id}>{item.display_name || roleName[item.role]} · {roleName[item.role]}</option>)}</select><ChevronDown size={14}/></label> : <div className="admin-shop-name">{shopName}</div>}
      <nav className="admin-nav" aria-label="Menu do painel">
        <button type="button" className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}><Activity size={17}/> Visão geral</button>
        <button type="button" className={view === 'agenda' ? 'active' : ''} onClick={() => setView('agenda')}><CalendarDays size={17}/> Agenda</button>
        <button type="button" className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}><History size={17}/> Histórico</button>
        <button type="button" className={view === 'customers' ? 'active' : ''} onClick={() => setView('customers')}><Users size={17}/> Clientes</button>
        {canSeeFinancials && <button type="button" className={view === 'finance' ? 'active' : ''} onClick={() => setView('finance')}><Wallet size={17}/> Financeiro</button>}
        <button type="button" className={view === 'reports' ? 'active' : ''} onClick={() => setView('reports')}><BarChart3 size={17}/> Relatórios</button>
        <button type="button" className={view === 'new' ? 'active' : ''} onClick={() => setView('new')}><CalendarPlus size={17}/> Novo agendamento</button>
        {canManageBlocks && <button type="button" className={view === 'blocks' ? 'active' : ''} onClick={() => setView('blocks')}><Ban size={17}/> Bloqueios</button>}
        <div className="admin-nav-caption">GESTÃO</div>
        {canManageServices ? <button type="button" className={view === 'services' ? 'active' : ''} onClick={() => setView('services')}><Scissors size={17}/> Serviços</button> : <span className="admin-nav-disabled"><Scissors size={17}/> Serviços</span>}
        {canManageTeam ? <button type="button" className={view === 'team' ? 'active' : ''} onClick={() => setView('team')}><Users size={17}/> Equipe</button> : <span className="admin-nav-disabled"><Users size={17}/> Equipe</span>}
        {canSeeFinancials && <button type="button" className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}><Settings size={17}/> Configurações</button>}
      </nav>
      <div className="admin-sidebar-footer"><span className="admin-avatar">{(membership?.display_name || session.user.email || 'U').slice(0, 1).toUpperCase()}</span><span><strong>{membership?.display_name || session.user.email}</strong><small>{membership ? roleName[membership.role] : ''}</small></span><button type="button" title="Sair" aria-label="Sair" onClick={() => void signOut()}><LogOut size={16}/></button></div>
    </aside>

    <section className="admin-content">
      <header className="admin-topbar"><div><span className="eyebrow">{formatDate(new Date().toISOString(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span><h1>{view === 'dashboard' ? 'Visão geral' : view === 'agenda' ? 'Agenda' : view === 'history' ? 'Histórico' : view === 'customers' ? 'Clientes' : view === 'finance' ? 'Financeiro' : view === 'reports' ? 'Relatórios' : view === 'new' ? 'Novo agendamento' : view === 'blocks' ? 'Bloqueios' : view === 'services' ? 'Serviços' : view === 'settings' ? 'Configurações' : 'Equipe'}</h1></div>{view !== 'blocks' && view !== 'services' && view !== 'team' && view !== 'new' && view !== 'history' && view !== 'customers' && view !== 'finance' && view !== 'reports' && view !== 'settings' && <button type="button" className="admin-refresh" onClick={() => void loadDashboard()} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''}/> Atualizar</button>}</header>
      {error && <div className="admin-alert" role="alert">{error}</div>}
      {notice && <div className="admin-success-notice" role="status">{notice}</div>}
      {loading && !data && view !== 'new' && view !== 'history' && view !== 'customers' && view !== 'finance' && view !== 'reports' && view !== 'settings' ? <div className="admin-loading">Carregando dados da barbearia…</div> : !data && view !== 'new' && view !== 'history' && view !== 'customers' && view !== 'finance' && view !== 'reports' && view !== 'settings' ? <div className="admin-empty"><CalendarDays/><h2>Sem dados do painel</h2><p>Confira a configuração do Supabase e tente atualizar.</p></div> : view === 'dashboard' ? <>
        <section className="admin-kpis" aria-label="Indicadores de hoje">
          <article><span>Agendamentos hoje</span><strong>{todayAppointments.length}</strong><small><CalendarDays size={14}/> {activeToday.length} ativos</small></article>
          <article><span>Próximos atendimentos</span><strong>{upcoming.length}</strong><small><Clock3 size={14}/> próximos 7 dias</small></article>
          {canSeeFinancials && <><article><span>Pagamentos pendentes</span><strong>{data!.pendingPayments}</strong><small><Wallet size={14}/> aguardando confirmação</small></article><article><span>Recebido hoje</span><strong>{money(data!.receivedTodayCents)}</strong><small><Activity size={14}/> pagamentos aprovados</small></article></>}
          <article><span>Cancelamentos hoje</span><strong>{cancelledToday}</strong><small><Activity size={14}/> atendimentos cancelados</small></article>
        </section>
        <section className="admin-card"><div className="admin-card-heading"><div><span className="eyebrow">AGENDA</span><h2>Próximos atendimentos</h2></div><button type="button" className="admin-text-button" onClick={() => setView('agenda')}>Ver semana <ArrowRightIcon/></button></div>
          {upcoming.length === 0 ? <div className="admin-empty-inline">Nenhum atendimento próximo para esta semana.</div> : <div className="admin-appointment-list">{upcoming.map((item) => <AppointmentRow key={item.id} appointment={item} data={data!} onStatusChange={updateAppointmentStatus} onReschedule={rescheduleAppointment} onRecordPayment={recordInPersonPayment} canRecordPayments={canSeeFinancials} busy={updatingAppointmentId === item.id}/>)}</div>}
        </section>
      </> : view === 'agenda' ? <section className="admin-card admin-agenda-card"><div className="admin-card-heading"><div><span className="eyebrow">PRÓXIMOS 7 DIAS</span><h2>Atendimentos da semana</h2></div><span className="admin-count">{appointments.length} registros</span></div>
        {agendaGroups.length === 0 ? <div className="admin-empty-inline">Nenhum atendimento encontrado neste período.</div> : agendaGroups.map(([day, items]) => <div className="admin-day-group" key={day}><h3>{formatDate(shopLocalDateTime(day, '12:00').toISOString(), { weekday: 'long', day: 'numeric', month: 'long' })}</h3><div className="admin-appointment-list">{items.map((item) => <AppointmentRow key={item.id} appointment={item} data={data!} onStatusChange={updateAppointmentStatus} onReschedule={rescheduleAppointment} onRecordPayment={recordInPersonPayment} canRecordPayments={canSeeFinancials} busy={updatingAppointmentId === item.id}/>)}</div></div>)}
      </section> : view === 'history' ? <AppointmentHistory membership={membership!} canSeeFinancials={canSeeFinancials}/> : view === 'customers' ? <Customers membership={membership!}/> : view === 'finance' && canSeeFinancials ? <Financials membership={membership!}/> : view === 'reports' ? <Reports membership={membership!} canSeeFinancials={canSeeFinancials}/> : view === 'new' ? <ManualAppointment membership={membership!} onCreated={() => { setView('agenda'); void loadDashboard() }}/> : view === 'blocks' && canManageBlocks ? <BlockedTimes barbershopId={membership!.barbershop_id}/> : view === 'services' && canManageServices ? <ServicesManager barbershopId={membership!.barbershop_id}/> : view === 'team' && canManageTeam ? <TeamManager barbershopId={membership!.barbershop_id}/> : view === 'settings' && canSeeFinancials ? <BarbershopSettings barbershopId={membership!.barbershop_id} onSaved={() => void loadDashboard()}/> : null}
      <footer className="admin-footnote">Os dados exibidos vêm do Supabase e respeitam as permissões da sua função nesta barbearia.</footer>
    </section>
  </main>
}

function ArrowRightIcon() {
  return <span aria-hidden="true">→</span>
}

function AppointmentRow({ appointment, data, onStatusChange, onReschedule, onRecordPayment, canRecordPayments, busy }: {
  appointment: Appointment
  data: DashboardData
  onStatusChange: (appointment: Appointment, status: 'cancelled' | 'completed') => void
  onReschedule: (appointment: Appointment) => void
  onRecordPayment: (appointment: Appointment) => void
  canRecordPayments: boolean
  busy: boolean
}) {
  const canCancel = (appointment.status === 'pending' || appointment.status === 'confirmed') && new Date(appointment.starts_at).getTime() > Date.now()
  const canComplete = appointment.status === 'confirmed' && new Date(appointment.ends_at).getTime() <= Date.now()
  const canReschedule = appointment.status === 'confirmed' && new Date(appointment.starts_at).getTime() > Date.now()
  const payment = data.paymentsByAppointment[appointment.id]
  const canRecordPayment = canRecordPayments && !payment && (appointment.status === 'confirmed' || appointment.status === 'completed')
  const paymentLabel = payment?.provider === 'in_person'
    ? 'Pago presencial'
    : payment?.status === 'approved'
      ? 'Pago online'
      : payment?.status === 'pending'
        ? 'Pagamento pendente'
        : payment?.status === 'rejected'
          ? 'Pagamento recusado'
          : payment?.status === 'refunded'
            ? 'Pagamento reembolsado'
            : payment?.status === 'cancelled' ? 'Cobrança cancelada' : null
  return <article className="admin-appointment-row">
    <div className="admin-appointment-time"><strong>{formatTime(appointment.starts_at)}</strong><small>{formatDate(appointment.starts_at)}</small></div>
    <div className="admin-appointment-main"><strong>{appointment.customer_name}</strong><small>{data.services[appointment.service_id] ?? 'Serviço'} · {data.barbers[appointment.barber_member_id] ?? 'Profissional'}</small></div>
    <div className="admin-appointment-contact">{appointment.customer_phone}</div>
    <div className="admin-appointment-price">{money(appointment.amount_cents)}</div>
    <div className="admin-appointment-state"><span className={`admin-status status-${appointment.status}`}>{statusName[appointment.status]}</span>{paymentLabel && <small className="admin-appointment-payment">{paymentLabel}</small>}<div className="admin-appointment-actions">
      {canComplete && <button type="button" onClick={() => onStatusChange(appointment, 'completed')} disabled={busy} title="Marcar como concluído"><CheckCircle2 size={13}/> Concluir</button>}
      {canReschedule && <button type="button" onClick={() => onReschedule(appointment)} disabled={busy} title="Alterar data e horário"><CalendarClock size={13}/> Alterar horário</button>}
      {canRecordPayment && <button type="button" onClick={() => onRecordPayment(appointment)} disabled={busy} title="Registrar pagamento presencial"><Wallet size={13}/> Recebido no local</button>}
      {canCancel && <button type="button" onClick={() => onStatusChange(appointment, 'cancelled')} disabled={busy} title="Cancelar agendamento"><XCircle size={13}/> Cancelar</button>}
      {busy && <small>Salvando…</small>}
    </div></div>
  </article>
}
