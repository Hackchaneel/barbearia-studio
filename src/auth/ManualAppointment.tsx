import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarPlus, CheckCircle2, LoaderCircle, RefreshCw } from 'lucide-react'
import type { ShopMembership } from './AuthContext'
import { supabase } from '../lib/supabase'
import { SHOP_TIME_ZONE } from '../lib/shopConfig'

type ServiceOption = { id: string; name: string; duration_minutes: number; price_cents: number }
type BarberOption = { id: string; display_name: string }
type Slot = { barber_member_id: string; barber_name: string; starts_at: string; ends_at: string }

function localDay(value: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: SHOP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function formatPrice(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

export default function ManualAppointment({ membership, onCreated }: {
  membership: ShopMembership
  onCreated: () => void
}) {
  const canChooseBarber = membership.role !== 'barber'
  const [services, setServices] = useState<ServiceOption[]>([])
  const [barbers, setBarbers] = useState<BarberOption[]>([])
  const [serviceId, setServiceId] = useState('')
  const [barberId, setBarberId] = useState(membership.role === 'barber' ? membership.id : '')
  const [date, setDate] = useState(() => localDay(new Date(Date.now() + 60 * 60 * 1000)))
  const [slots, setSlots] = useState<Slot[]>([])
  const [selectedSlot, setSelectedSlot] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const selectedService = useMemo(() => services.find((service) => service.id === serviceId), [services, serviceId])

  const loadOptions = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    setError(null)
    const [serviceResult, barberResult] = await Promise.all([
      supabase.from('services').select('id, name, duration_minutes, price_cents')
        .eq('barbershop_id', membership.barbershop_id).eq('is_active', true).order('sort_order'),
      canChooseBarber
        ? supabase.from('barbershop_members').select('id, display_name')
          .eq('barbershop_id', membership.barbershop_id).eq('role', 'barber').eq('is_active', true).order('display_name')
        : Promise.resolve({ data: [{ id: membership.id, display_name: membership.display_name }], error: null }),
    ])
    if (serviceResult.error || barberResult.error) {
      setError('Não foi possível carregar serviços e profissionais. Confira as migrações do Supabase.')
    } else {
      const nextServices = (serviceResult.data ?? []) as ServiceOption[]
      const nextBarbers = (barberResult.data ?? []) as BarberOption[]
      setServices(nextServices)
      setBarbers(nextBarbers)
      setServiceId((current) => current && nextServices.some((service) => service.id === current) ? current : nextServices[0]?.id ?? '')
      if (canChooseBarber) setBarberId((current) => current && nextBarbers.some((barber) => barber.id === current) ? current : nextBarbers[0]?.id ?? '')
    }
    setLoading(false)
  }, [membership, canChooseBarber])

  useEffect(() => { void loadOptions() }, [loadOptions])

  const loadSlots = useCallback(async () => {
    if (!supabase || !serviceId || !barberId || !date) {
      setSlots([])
      setSelectedSlot('')
      return
    }
    setLoadingSlots(true)
    setError(null)
    setSelectedSlot('')
    const { data, error: slotsError } = await supabase.rpc('get_available_slots', {
      _barbershop_id: membership.barbershop_id,
      _service_id: serviceId,
      _date: date,
      _barber_member_id: barberId,
    })
    if (slotsError) {
      setError('Não foi possível consultar os horários disponíveis. Confira se as migrações foram aplicadas.')
      setSlots([])
    } else {
      setSlots((data ?? []) as Slot[])
    }
    setLoadingSlots(false)
  }, [membership.barbershop_id, serviceId, barberId, date])

  useEffect(() => { void loadSlots() }, [loadSlots])

  const createAppointment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase || !selectedSlot) return
    setSaving(true)
    setError(null)
    setNotice(null)
    const { error: createError } = await supabase.rpc('create_manual_appointment', {
      _barbershop_id: membership.barbershop_id,
      _service_id: serviceId,
      _barber_member_id: barberId,
      _starts_at: selectedSlot,
      _customer_name: customerName.trim(),
      _customer_phone: customerPhone.trim(),
      _customer_email: customerEmail.trim() || null,
      _notes: notes.trim(),
    })
    if (createError) {
      setError(createError.code === '23P01'
        ? 'Esse horário acabou de ficar indisponível. Atualize os horários e selecione outro.'
        : 'Não foi possível criar o agendamento. Confira os dados e tente novamente.')
      await loadSlots()
    } else {
      setNotice('Agendamento criado e confirmado na agenda.')
      setCustomerName('')
      setCustomerPhone('')
      setCustomerEmail('')
      setNotes('')
      setSelectedSlot('')
      await loadSlots()
      onCreated()
    }
    setSaving(false)
  }

  if (loading) return <section className="admin-card admin-loading">Carregando opções de agendamento…</section>

  return <div className="admin-manual-layout">
    <section className="admin-card">
      <div className="admin-card-heading"><div><span className="eyebrow">ATENDIMENTO PRESENCIAL OU POR TELEFONE</span><h2>Novo agendamento</h2></div><button type="button" className="admin-refresh" onClick={() => void loadOptions()} disabled={loading}><RefreshCw size={14}/> Atualizar</button></div>
      {error && <div className="admin-alert" role="alert">{error}</div>}
      {notice && <div className="admin-block-notice" role="status"><CheckCircle2 size={16}/>{notice}</div>}
      {!services.length ? <div className="admin-empty-inline">Cadastre e ative pelo menos um serviço antes de agendar.</div> : !barbers.length ? <div className="admin-empty-inline">Vincule um barbeiro ativo à equipe antes de agendar.</div> : <form className="admin-manual-form" onSubmit={createAppointment}>
        <label>Serviço<select required value={serviceId} onChange={(event) => setServiceId(event.target.value)}>{services.map((service) => <option key={service.id} value={service.id}>{service.name} · {formatPrice(service.price_cents)} · {service.duration_minutes} min</option>)}</select></label>
        {canChooseBarber && <label>Profissional<select required value={barberId} onChange={(event) => setBarberId(event.target.value)}>{barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.display_name}</option>)}</select></label>}
        <label>Data<input required type="date" min={localDay(new Date())} value={date} onChange={(event) => setDate(event.target.value)}/></label>
        <fieldset className="admin-manual-slots"><legend>Horário disponível</legend>
          {loadingSlots ? <span className="admin-manual-hint"><LoaderCircle size={14} className="spin"/> Consultando agenda…</span> : slots.length ? <div className="admin-slot-grid">{slots.map((slot) => <button type="button" key={slot.starts_at} className={selectedSlot === slot.starts_at ? 'selected' : ''} onClick={() => setSelectedSlot(slot.starts_at)}>{new Intl.DateTimeFormat('pt-BR', { timeZone: SHOP_TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(slot.starts_at))}</button>)}</div> : <span className="admin-manual-hint">Nenhum horário livre nesta data para este profissional e serviço.</span>}
        </fieldset>
        <div className="admin-manual-customer"><label>Nome do cliente<input required minLength={2} maxLength={120} autoComplete="name" value={customerName} onChange={(event) => setCustomerName(event.target.value)}/></label><label>Telefone<input required type="tel" minLength={10} maxLength={20} autoComplete="tel" placeholder="(11) 99999-9999" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)}/></label></div>
        <label>E-mail (opcional)<input type="email" maxLength={254} autoComplete="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)}/></label>
        <label>Observações (opcional)<textarea rows={3} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)}/></label>
        {selectedService && <div className="admin-manual-summary"><span>{selectedService.name} · {selectedService.duration_minutes} min</span><strong>{formatPrice(selectedService.price_cents)}</strong></div>}
        <button type="submit" className="button button-gold" disabled={saving || !selectedSlot || loadingSlots}><CalendarPlus size={16}/>{saving ? 'Salvando…' : 'Confirmar agendamento'}</button>
        <p className="admin-manual-hint">Este agendamento fica confirmado imediatamente. O pagamento feito no local não é registrado no sistema de pagamentos.</p>
      </form>}
    </section>
  </div>
}
