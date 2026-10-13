import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CalendarDays, Clock3, Search, Scissors, UserRound } from 'lucide-react'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { SHOP_TIME_ZONE } from '../lib/shopConfig'

type AppointmentDetails = {
  service_name: string
  barber_name: string
  starts_at: string
  ends_at: string
  appointment_state: string
  payment_state: string | null
  amount_cents: number
}

const appointmentLabels: Record<string, string> = {
  pending: 'Aguardando pagamento', confirmed: 'Confirmado', completed: 'Concluído', cancelled: 'Cancelado', expired: 'Expirado',
}
const paymentLabels: Record<string, string> = {
  pending: 'Pagamento pendente', approved: 'Pagamento aprovado', rejected: 'Pagamento recusado', refunded: 'Pagamento reembolsado', cancelled: 'Cobrança cancelada',
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: SHOP_TIME_ZONE, dateStyle: 'full' }).format(new Date(value))
}
function timeLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: SHOP_TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
function money(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

export default function AppointmentLookup() {
  const location = useLocation()
  const [appointmentId, setAppointmentId] = useState(() => new URLSearchParams(location.search).get('codigo') ?? '')
  const [phone, setPhone] = useState('')
  const [details, setDetails] = useState<AppointmentDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setDetails(null)
    setError(null)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(appointmentId.trim())) {
      setError('Confira o código de consulta do agendamento.')
      return
    }
    const phoneDigits = phone.replace(/\D/g, '')
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      setError('Informe o mesmo telefone usado ao fazer a reserva.')
      return
    }
    if (!supabaseConfigured || !supabase) {
      setError('A consulta de agendamentos precisa da conexão com o Supabase configurada.')
      return
    }

    setLoading(true)
    const { data, error: lookupError } = await supabase.rpc('lookup_customer_appointment', {
      _appointment_id: appointmentId.trim(),
      _customer_phone: phone,
    })
    setLoading(false)
    if (lookupError) {
      setError('Não foi possível consultar agora. Tente novamente em instantes.')
      return
    }
    const row = (Array.isArray(data) ? data[0] : data) as AppointmentDetails | null
    if (!row) {
      setError('Não encontramos uma reserva com esse código e telefone. Confira os dados e tente novamente.')
      return
    }
    setDetails(row)
  }

  return <main id="conteudo" className="inner-page appointment-lookup-page">
    <div className="container appointment-lookup-wrap">
      <div className="booking-heading"><span className="eyebrow">ACOMPANHE SUA RESERVA</span><h1>Consulte seu <em>agendamento.</em></h1><p>Use o código da reserva e o telefone informado no cadastro.</p></div>
      <section className="appointment-lookup-card">
        <form onSubmit={(event) => void lookup(event)}>
          <label>Código do agendamento<input required value={appointmentId} onChange={(event) => setAppointmentId(event.target.value)} placeholder="Cole o código recebido ao reservar" autoComplete="off" spellCheck={false}/></label>
          <label>Telefone usado na reserva<input required type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(11) 99999-9999" maxLength={20}/></label>
          {error && <div className="demo-notice" role="alert">{error}</div>}
          <button type="submit" className="button button-gold" disabled={loading}><Search size={15}/>{loading ? 'Consultando…' : 'Consultar agendamento'}</button>
        </form>
        {details && <div className="appointment-lookup-result" role="status">
          <div className="appointment-lookup-status"><span className={`admin-status status-${details.appointment_state}`}>{appointmentLabels[details.appointment_state] ?? details.appointment_state}</span>{details.payment_state && <span className={`admin-status status-${details.payment_state}`}>{paymentLabels[details.payment_state] ?? details.payment_state}</span>}</div>
          <h2>{details.service_name}</h2>
          <div><CalendarDays size={16}/><span>{dateLabel(details.starts_at)}</span></div>
          <div><Clock3 size={16}/><span>{timeLabel(details.starts_at)} – {timeLabel(details.ends_at)}</span></div>
          <div><UserRound size={16}/><span>{details.barber_name}</span></div>
          <div><Scissors size={16}/><span>{money(details.amount_cents)}</span></div>
        </div>}
        <p className="appointment-lookup-help">O código aparece na confirmação da reserva. Por segurança, o telefone precisa ser o mesmo que você informou ao agendar.</p>
        <Link to="/agendar" className="text-link">Fazer novo agendamento</Link>
      </section>
    </div>
  </main>
}
