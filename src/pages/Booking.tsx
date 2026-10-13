import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock3, RefreshCw, Scissors, UserRound } from 'lucide-react'
import { barbers as demoBarbers, services as demoServices } from '../data/mock'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { BARBERSHOP_ID, SHOP_TIME_ZONE } from '../lib/shopConfig'
import { usePublicShop } from '../lib/publicShop'

const DEMO_TIMES = ['09:00', '09:45', '10:30', '11:15', '13:00', '14:30', '15:15', '16:45', '18:00']

type BookingService = { id: string; name: string; description: string; priceCents: number; duration: number }
type BookingBarber = { id: string; name: string; role: string; image?: string; serviceIds: string[] }
type AvailableSlot = { barber_member_id: string; barber_name: string; starts_at: string; ends_at: string }
type CreatedHold = { appointment_id: string; starts_at: string; ends_at: string; hold_expires_at: string }
type PublicAppointmentStatus = {
  service_name: string
  starts_at: string
  ends_at: string
  appointment_state: string
  payment_state: string | null
  amount_cents: number
  hold_expires_at: string | null
}

function shopDate(offset: number) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: SHOP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const value = (key: string) => Number(parts.find((part) => part.type === key)?.value)
  return new Date(Date.UTC(value('year'), value('month') - 1, value('day') + offset)).toISOString().slice(0, 10)
}

function formatPrice(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

function formatSlotTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: SHOP_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`)
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', dateStyle: 'full' }).format(date)
}

function formatAppointmentDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: SHOP_TIME_ZONE,
    dateStyle: 'full',
  }).format(new Date(value))
}

const DEMO_SERVICES: BookingService[] = demoServices.map((service) => ({
  id: service.id,
  name: service.name,
  description: service.description,
  priceCents: Math.round(service.price * 100),
  duration: service.duration,
}))

const DEMO_BARBERS: BookingBarber[] = demoBarbers.map((barber, index) => ({
  id: `demo-${index}`,
  name: barber.name,
  role: barber.role,
  image: barber.image,
  serviceIds: DEMO_SERVICES.map((service) => service.id),
}))

export default function Booking() {
  const { shop } = usePublicShop()
  const [step, setStep] = useState(1)
  const [services, setServices] = useState<BookingService[]>(supabaseConfigured ? [] : DEMO_SERVICES)
  const [barbers, setBarbers] = useState<BookingBarber[]>(supabaseConfigured ? [] : DEMO_BARBERS)
  const [catalogLoading, setCatalogLoading] = useState(supabaseConfigured)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [serviceId, setServiceId] = useState('')
  const [barberId, setBarberId] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [createdHold, setCreatedHold] = useState<CreatedHold | null>(null)
  const [checkoutUrl, setCheckoutUrl] = useState('')
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [returnedStatus, setReturnedStatus] = useState<PublicAppointmentStatus | null>(null)
  const [returnedStatusError, setReturnedStatusError] = useState<string | null>(null)
  const [returnedStatusLoading, setReturnedStatusLoading] = useState(false)
  const [statusRefresh, setStatusRefresh] = useState(0)
  const isLive = supabaseConfigured && Boolean(supabase)
  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => shopDate(index + 1)), [])
  const location = useLocation()
  const returnParams = new URLSearchParams(location.search)
  const paymentReturn = returnParams.get('pagamento')
  const returnedAppointmentId = returnParams.get('agendamento')
  const showingPaymentReturn = ['retorno', 'pendente', 'falhou'].includes(paymentReturn ?? '')

  useEffect(() => {
    if (!showingPaymentReturn) {
      setReturnedStatus(null)
      setReturnedStatusError(null)
      setReturnedStatusLoading(false)
      return
    }
    if (!returnedAppointmentId) {
      setReturnedStatus(null)
      setReturnedStatusError('O link de retorno veio sem o identificador do agendamento.')
      setReturnedStatusLoading(false)
      return
    }
    if (!supabase || !isLive) {
      setReturnedStatus(null)
      setReturnedStatusError('A conexão com o Supabase não está configurada nesta versão do site.')
      setReturnedStatusLoading(false)
      return
    }

    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    setReturnedStatusLoading(true)
    setReturnedStatusError(null)

    async function refreshStatus() {
      const { data, error } = await supabase!.rpc('get_public_appointment_status', {
        _appointment_id: returnedAppointmentId,
      })
      if (!active) return
      if (error) {
        setReturnedStatusError('Não foi possível consultar o pagamento. Confira se a Etapa 8 foi aplicada no Supabase e tente atualizar.')
        setReturnedStatusLoading(false)
        return
      }

      const status = (Array.isArray(data) ? data[0] : data) as PublicAppointmentStatus | null
      if (!status) {
        setReturnedStatusError('Não encontramos esse agendamento. Confira o link recebido do Mercado Pago ou tente novamente.')
        setReturnedStatusLoading(false)
        return
      }

      setReturnedStatus(status)
      setReturnedStatusError(null)
      attempts += 1
      const finished = status.payment_state === 'approved'
        || ['confirmed', 'completed', 'cancelled', 'expired'].includes(status.appointment_state)
        || (status.hold_expires_at !== null && new Date(status.hold_expires_at).getTime() <= Date.now())
      if (!finished && attempts < 20) timer = setTimeout(() => void refreshStatus(), 3000)
      else setReturnedStatusLoading(false)
    }

    void refreshStatus()
    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
  }, [showingPaymentReturn, returnedAppointmentId, isLive, statusRefresh])

  useEffect(() => {
    if (!supabase) return
    let active = true

    async function loadCatalog() {
      setCatalogLoading(true)
      setCatalogError(null)
      const [serviceResult, barberResult, offeringResult] = await Promise.all([
        supabase!.from('services')
          .select('id, name, description, price_cents, duration_minutes, sort_order')
          .eq('barbershop_id', BARBERSHOP_ID)
          .eq('is_active', true)
          .order('sort_order'),
        supabase!.from('barbershop_members')
          .select('id, display_name, bio, avatar_url')
          .eq('barbershop_id', BARBERSHOP_ID)
          .eq('role', 'barber')
          .eq('is_active', true)
          .eq('is_public', true),
        supabase!.from('barber_services')
          .select('barber_member_id, service_id')
          .eq('barbershop_id', BARBERSHOP_ID),
      ])

      if (!active) return
      const error = serviceResult.error ?? barberResult.error ?? offeringResult.error
      if (error) {
        setCatalogError('Não foi possível carregar o catálogo. Confira se as migrações e os dados do Supabase foram aplicados.')
        setCatalogLoading(false)
        return
      }

      const offerings = offeringResult.data ?? []
      const loadedServices: BookingService[] = (serviceResult.data ?? []).map((service) => ({
        id: service.id,
        name: service.name,
        description: service.description,
        priceCents: service.price_cents,
        duration: service.duration_minutes,
      }))
      const loadedBarbers: BookingBarber[] = (barberResult.data ?? []).map((barber) => ({
        id: barber.id,
        name: barber.display_name,
        role: barber.bio || 'Barbeiro',
        image: barber.avatar_url ?? undefined,
        serviceIds: offerings.filter((offering) => offering.barber_member_id === barber.id).map((offering) => offering.service_id),
      }))
      setServices(loadedServices)
      setBarbers(loadedBarbers)
      setCatalogLoading(false)
    }

    void loadCatalog()
    return () => { active = false }
  }, [])

  const chosenService = services.find((service) => service.id === serviceId)
  const eligibleBarbers = barbers.filter((barber) => barber.serviceIds.includes(serviceId))
  const selectedSlot = availableSlots.find((slot) => formatSlotTime(slot.starts_at) === time)
  const chosenBarber = barberId === 'any'
    ? (selectedSlot?.barber_name ?? 'Qualquer profissional')
    : (barbers.find((barber) => barber.id === barberId)?.name ?? '')

  useEffect(() => {
    if (!isLive || !supabase || step !== 3 || !serviceId || !date || !barberId) {
      setAvailableSlots([])
      setSlotsError(null)
      setSlotsLoading(false)
      return
    }

    let active = true
    setSlotsLoading(true)
    setSlotsError(null)
    setTime('')
    async function loadSlots() {
      const { data, error } = await supabase!.rpc('get_available_slots', {
        _barbershop_id: BARBERSHOP_ID,
        _service_id: serviceId,
        _date: date,
        _barber_member_id: barberId === 'any' ? null : barberId,
      })
      if (!active) return
      if (error) {
        setSlotsError('Não foi possível consultar a agenda. Confirme se a Etapa 3 foi aplicada no Supabase.')
        setAvailableSlots([])
      } else {
        const slots = (data ?? []) as AvailableSlot[]
        const seenTimes = new Set<string>()
        setAvailableSlots(slots.filter((slot) => {
          const label = formatSlotTime(slot.starts_at)
          if (seenTimes.has(label)) return false
          seenTimes.add(label)
          return true
        }))
      }
      setSlotsLoading(false)
    }
    void loadSlots()

    return () => { active = false }
  }, [isLive, step, serviceId, date, barberId])

  const demoSlots = date ? DEMO_TIMES : []
  const visibleSlots = isLive ? availableSlots.map((slot) => formatSlotTime(slot.starts_at)) : demoSlots

  async function continueBooking() {
    if (step < 4) {
      setStep(step + 1)
      return
    }
    if (!isLive || !supabase) {
      setSent(true)
      return
    }
    if (!selectedSlot || !chosenService) {
      setSubmitError('Escolha novamente um horário disponível antes de continuar.')
      setStep(3)
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    const { data, error } = await supabase.functions.invoke('create-appointment-hold', {
      body: {
        barbershop_id: BARBERSHOP_ID,
        service_id: chosenService.id,
        barber_member_id: selectedSlot.barber_member_id,
        starts_at: selectedSlot.starts_at,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail || null,
      },
    })
    if (error || !data?.appointment) {
      setSubmitting(false)
      setSubmitError(data?.error ?? 'Não foi possível reservar esse horário. Atualize a agenda e tente novamente.')
      return
    }
    const hold = data.appointment as CreatedHold
    setCreatedHold(hold)
    await createCheckout(hold.appointment_id)
    setSubmitting(false)
    setSent(true)
  }

  async function createCheckout(appointmentId: string) {
    if (!supabase) return
    setCheckoutLoading(true)
    setCheckoutError(null)
    const { data, error } = await supabase.functions.invoke('create-payment-checkout', {
      body: { appointment_id: appointmentId },
    })
    setCheckoutLoading(false)
    if (error || typeof data?.checkout_url !== 'string') {
      setCheckoutError(data?.error ?? 'A reserva foi criada, mas não foi possível abrir o pagamento. Tente novamente em instantes.')
      return
    }
    setCheckoutUrl(data.checkout_url)
  }

  if (sent) {
    return <main id="conteudo" className="inner-page"><div className="container success-state">
      <div className="success-icon"><Check/></div>
      <span className="eyebrow">{isLive ? 'HORÁRIO RESERVADO' : 'MODO DEMONSTRATIVO'}</span>
      <h1>{isLive ? <>Seu horário está<br/><em>reservado.</em></> : <>Seu ritual está<br/><em>quase confirmado.</em></>}</h1>
      <p>{isLive && createdHold
        ? `Reserva temporária criada. O horário fica retido até ${new Intl.DateTimeFormat('pt-BR', { timeZone: SHOP_TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(createdHold.hold_expires_at))}. A confirmação depende da notificação validada do Mercado Pago.`
        : 'Esta confirmação é demonstrativa. Nenhum agendamento real foi criado.'}</p>
      <div className="summary-card"><strong>{chosenService?.name}</strong><span>{date ? formatDate(date) : ''} · {time} · {chosenBarber || 'Profissional a definir'}</span><span>{chosenService ? formatPrice(chosenService.priceCents) : ''}</span></div>
      {isLive && checkoutUrl && <a href={checkoutUrl} className="button button-gold">Ir para o pagamento</a>}
      {isLive && !checkoutUrl && checkoutError && <><p className="demo-notice" role="alert">{checkoutError}</p><button type="button" className="button button-gold" disabled={checkoutLoading} onClick={()=>createdHold&&void createCheckout(createdHold.appointment_id)}>{checkoutLoading?'Preparando pagamento…':'Tentar pagamento novamente'}</button></>}
      <Link to="/" className="button button-gold">Voltar ao início</Link>
    </div></main>
  }

  if (showingPaymentReturn) {
    const paid = returnedStatus?.payment_state === 'approved'
    const failed = returnedStatus?.payment_state === 'rejected'
      || returnedStatus?.payment_state === 'cancelled'
      || returnedStatus?.appointment_state === 'expired'
      || returnedStatus?.appointment_state === 'cancelled'
    const heading = paid
      ? <>Pagamento confirmado.<br/><em>Seu horário está reservado.</em></>
      : failed
        ? <>O pagamento não foi<br/><em>concluído.</em></>
        : <>Estamos confirmando<br/><em>seu pagamento.</em></>
    const message = returnedStatusError
      ?? (paid
        ? 'Pagamento aprovado pelo Mercado Pago e agendamento confirmado.'
        : failed
          ? 'Não identificamos um pagamento aprovado. Se o horário ainda estiver disponível, você pode fazer uma nova reserva.'
          : returnedStatusLoading
            ? 'Consultando o Mercado Pago. Esta tela atualiza automaticamente por alguns instantes.'
            : 'O pagamento ainda está pendente. A confirmação será atualizada assim que o Mercado Pago notificar o sistema.')

    return <main id="conteudo" className="inner-page"><div className="container success-state">
      <div className="success-icon">{paid ? <Check/> : <Clock3/>}</div>
      <span className="eyebrow">RETORNO DO PAGAMENTO</span>
      <h1>{heading}</h1>
      <p role={returnedStatusError ? 'alert' : 'status'}>{message}</p>
      {returnedStatus && <div className="summary-card">
        <strong>{returnedStatus.service_name}</strong>
        <span>{formatAppointmentDate(returnedStatus.starts_at)} · {formatSlotTime(returnedStatus.starts_at)}</span>
        <span>{formatPrice(returnedStatus.amount_cents)}</span>
      </div>}
      {returnedStatusLoading && <p>Atualizando status…</p>}
      <div className="booking-controls" style={{ justifyContent: 'center', gap: 12 }}>
        <button type="button" className="button button-outline" disabled={returnedStatusLoading || !returnedAppointmentId || !isLive} onClick={() => setStatusRefresh((value) => value + 1)}>
          <RefreshCw size={15}/> Atualizar status
        </button>
        <Link to="/" className="button button-gold">Voltar ao início</Link>
      </div>
      {!returnedAppointmentId && <p className="demo-notice">O link de retorno veio sem o identificador do agendamento. Faça uma nova tentativa de reserva ou entre em contato com a barbearia.</p>}
    </div></main>
  }

  return <main id="conteudo" className="inner-page booking-page"><div className="container">
    <div className="booking-heading"><span className="eyebrow">RESERVE SEU HORÁRIO</span><h1>Seu ritual começa <em>aqui.</em></h1><p>Escolha como quer cuidar de você.</p></div>
    {isLive && <div className="demo-notice">Agendamento conectado ao Supabase. A reserva será temporária e aguardará confirmação do pagamento.</div>}
    {catalogError && <div className="demo-notice" role="alert">{catalogError}</div>}
    <div className="booking-layout"><div className="booking-main">
      <div className="stepper">{['Serviço','Profissional','Data e hora','Seus dados'].map((label,index)=><div className={step===index+1?'active':step>index+1?'done':''} key={label}><span>{step>index+1?<Check size={14}/>:index+1}</span><small>{label}</small></div>)}</div>
      {step===1&&<section className="booking-step"><h2><Scissors/> Escolha seu serviço</h2>
        {catalogLoading ? <p className="demo-notice">Carregando serviços…</p> : services.length === 0 ? <p className="demo-notice">Nenhum serviço está disponível para agendamento nesta barbearia.</p> : <div className="choice-list">{services.map((service)=><button type="button" className={`choice-card ${serviceId===service.id?'selected':''}`} key={service.id} onClick={()=>{setServiceId(service.id);setBarberId('');setTime('')}}><span className="radio-dot"/><span><strong>{service.name}</strong><small>{service.duration} min · {service.description}</small></span><b>{formatPrice(service.priceCents)}</b></button>)}</div>}
      </section>}
      {step===2&&<section className="booking-step"><h2><UserRound/> Escolha seu profissional</h2><div className="professional-options">
        <button type="button" onClick={()=>setBarberId('any')} className={barberId==='any'?'selected':''}><div className="anyone-avatar">✦</div><strong>Qualquer profissional</strong><small>Primeiro horário disponível</small></button>
        {eligibleBarbers.map((barber)=><button type="button" key={barber.id} onClick={()=>setBarberId(barber.id)} className={barberId===barber.id?'selected':''}>{barber.image?<img src={barber.image} alt=""/>:<div className="anyone-avatar">{barber.name.slice(0,1)}</div>}<strong>{barber.name}</strong><small>{barber.role}</small></button>)}
        {isLive && eligibleBarbers.length===0 && <p className="demo-notice">Nenhum profissional público está associado a este serviço.</p>}
      </div></section>}
      {step===3&&<section className="booking-step"><h2><CalendarDays/> Escolha data e horário</h2>
        <div className="date-strip">{dates.map((day)=>{const parsed=new Date(`${day}T12:00:00Z`);return <button type="button" key={day} className={date===day?'selected':''} onClick={()=>{setDate(day);setTime('')}}><small>{new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',weekday:'short'}).format(parsed).replace('.','')}</small><strong>{parsed.getUTCDate()}</strong><small>{new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',month:'short'}).format(parsed).replace('.','')}</small></button>})}</div>
        <h3 className="time-label">Horários disponíveis</h3>
        {slotsLoading ? <p className="demo-notice">Consultando a agenda…</p> : slotsError ? <p className="demo-notice" role="alert">{slotsError}</p> : visibleSlots.length ? <div className="time-grid">{visibleSlots.map((slotTime)=><button type="button" key={slotTime} onClick={()=>setTime(slotTime)} className={time===slotTime?'selected':''}>{slotTime}</button>)}</div> : <p className="demo-notice">{date ? 'Não há horários disponíveis nesta data. Escolha outro dia.' : 'Selecione uma data para consultar os horários.'}</p>}
        {!isLive&&<p className="demo-notice">Disponibilidade ilustrativa para demonstração; nenhuma agenda real é consultada.</p>}
      </section>}
      {step===4&&<section className="booking-step"><h2><UserRound/> Seus dados</h2><div className="form-grid"><label>Nome completo<input required minLength={2} maxLength={120} value={customerName} onChange={(event)=>setCustomerName(event.target.value)} placeholder="Como podemos te chamar?"/></label><label>Celular<input required type="tel" value={customerPhone} onChange={(event)=>setCustomerPhone(event.target.value)} placeholder="(11) 99999-9999"/></label><label className="full">E-mail<input type="email" maxLength={254} value={customerEmail} onChange={(event)=>setCustomerEmail(event.target.value)} placeholder="voce@email.com"/></label></div>
        {!isLive&&<div className="demo-notice">Este envio é demonstrativo e não cria uma reserva real.</div>}
        {submitError&&<div className="demo-notice" role="alert">{submitError}</div>}
      </section>}
      <div className="booking-controls">{step>1&&<button type="button" className="button button-outline" onClick={()=>setStep(step-1)}><ArrowLeft size={16}/> Voltar</button>}<button type="button" className="button button-gold" disabled={catalogLoading||submitting||(step===1&&!serviceId)||(step===2&&!barberId)||(step===3&&(!date||!time))||(step===4&&(!customerName.trim()||customerPhone.replace(/\D/g,'').length<10))} onClick={()=>void continueBooking()}>{submitting?'Reservando…':step===4?(isLive?'Reservar horário':'Revisar agendamento'):'Continuar'} <ArrowRight size={16}/></button></div>
    </div><aside className="booking-summary"><span className="eyebrow">SEU RESUMO</span><h3>{shop.name}</h3><div className="summary-line"><span>Serviço</span><strong>{chosenService?.name||'Selecione um serviço'}</strong></div><div className="summary-line"><span>Profissional</span><strong>{chosenBarber||'A escolher'}</strong></div><div className="summary-line"><span>Data e horário</span><strong>{date?`${date} · ${time||'a escolher'}`:'A escolher'}</strong></div><div className="summary-total"><span>Total</span><strong>{chosenService?formatPrice(chosenService.priceCents):'—'}</strong></div><p><Clock3 size={14}/> {shop.cancellation_policy || 'Consulte a política de cancelamento da barbearia.'}</p></aside></div>
  </div></main>
}
