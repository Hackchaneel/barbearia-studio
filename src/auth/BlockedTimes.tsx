import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { CalendarDays, Clock3, LoaderCircle, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

type BarberOption = { id: string; display_name: string }
type BlockedTime = {
  id: string
  barber_member_id: string | null
  starts_at: string
  ends_at: string
  reason: string
}

function todayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function nextDay(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
}

function localSaoPauloTime(date: string, time: string) {
  return new Date(`${date}T${time}:00-03:00`).toISOString()
}

function formatBlock(value: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', ...options }).format(new Date(value))
}

function isFullDay(block: BlockedTime) {
  const start = new Date(block.starts_at)
  const end = new Date(block.ends_at)
  return formatBlock(block.starts_at, { hour: '2-digit', minute: '2-digit' }) === '00:00'
    && end.getTime() - start.getTime() >= 23 * 60 * 60 * 1000
}

export default function BlockedTimes({ barbershopId }: { barbershopId: string }) {
  const [blocks, setBlocks] = useState<BlockedTime[]>([])
  const [barbers, setBarbers] = useState<BarberOption[]>([])
  const [date, setDate] = useState(todayInSaoPaulo)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('18:00')
  const [allDay, setAllDay] = useState(false)
  const [barberId, setBarberId] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    setError(null)
    const [blockResult, barberResult] = await Promise.all([
      supabase.from('blocked_times')
        .select('id, barber_member_id, starts_at, ends_at, reason')
        .eq('barbershop_id', barbershopId)
        .gte('ends_at', new Date().toISOString())
        .order('starts_at')
        .limit(100),
      supabase.from('barbershop_members')
        .select('id, display_name')
        .eq('barbershop_id', barbershopId)
        .eq('role', 'barber')
        .eq('is_active', true)
        .order('display_name'),
    ])
    if (blockResult.error || barberResult.error) {
      setError('Não foi possível carregar os bloqueios. Atualize a página e tente novamente.')
      setLoading(false)
      return
    }
    setBlocks((blockResult.data ?? []) as BlockedTime[])
    setBarbers((barberResult.data ?? []) as BarberOption[])
    setLoading(false)
  }, [barbershopId])

  useEffect(() => { void load() }, [load])

  const createBlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const startsAt = localSaoPauloTime(date, allDay ? '00:00' : startTime)
      const endsAt = localSaoPauloTime(allDay ? nextDay(date) : date, allDay ? '00:00' : endTime)
      if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
        setError('O horário final precisa ser depois do horário inicial.')
        return
      }
      const { error: insertError } = await supabase.from('blocked_times').insert({
        barbershop_id: barbershopId,
        barber_member_id: barberId || null,
        starts_at: startsAt,
        ends_at: endsAt,
        reason: reason.trim(),
      })
      if (insertError) throw insertError
      setNotice('Bloqueio criado. Os horários correspondentes deixam de aparecer para agendamento.')
      setReason('')
      await load()
    } catch {
      setError('Não foi possível criar o bloqueio. Confira seu acesso e os horários informados.')
    } finally {
      setSaving(false)
    }
  }

  const removeBlock = async (blockId: string) => {
    if (!supabase) return
    setError(null)
    setNotice(null)
    const { error: deleteError } = await supabase.from('blocked_times')
      .delete().eq('id', blockId).eq('barbershop_id', barbershopId)
    if (deleteError) {
      setError('Não foi possível remover este bloqueio.')
      return
    }
    setNotice('Bloqueio removido.')
    await load()
  }

  const barberName = (id: string | null) => id ? barbers.find((barber) => barber.id === id)?.display_name ?? 'Profissional' : 'Todos os profissionais'

  return <div className="admin-blocks">
    <section className="admin-card">
      <div className="admin-card-heading"><div><span className="eyebrow">DISPONIBILIDADE</span><h2>Novo bloqueio</h2></div></div>
      <form className="admin-block-form" onSubmit={(event) => void createBlock(event)}>
        <label>Profissional
          <select value={barberId} onChange={(event) => setBarberId(event.target.value)}>
            <option value="">Todos os profissionais</option>
            {barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.display_name}</option>)}
          </select>
        </label>
        <label>Data
          <input required type="date" min={todayInSaoPaulo()} value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label className="admin-block-all-day"><input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} /> Dia inteiro</label>
        {!allDay && <>
          <label>Início
            <input required type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
          </label>
          <label>Fim
            <input required type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
          </label>
        </>}
        <label className="admin-block-reason">Motivo (opcional)
          <input maxLength={120} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Folga, férias, compromisso…" />
        </label>
        <button className="button button-gold" type="submit" disabled={saving}>
          {saving ? <LoaderCircle className="spin" size={15}/> : <Plus size={15}/>} Criar bloqueio
        </button>
      </form>
      {error && <div className="admin-alert" role="alert">{error}</div>}
      {notice && <div className="admin-block-notice" role="status">{notice}</div>}
      <p className="admin-footnote">Horários exibidos em Brasília. O bloqueio impede novos agendamentos; atendimentos já confirmados permanecem na agenda.</p>
    </section>

    <section className="admin-card">
      <div className="admin-card-heading"><div><span className="eyebrow">AGENDA</span><h2>Bloqueios futuros</h2></div><div className="admin-block-heading-actions"><span className="admin-count">{blocks.length} registros</span><button type="button" className="admin-refresh" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''}/> Atualizar</button></div></div>
      {loading ? <div className="admin-loading">Carregando bloqueios…</div> : blocks.length === 0 ? <div className="admin-empty-inline">Nenhum bloqueio futuro cadastrado.</div> : <div className="admin-block-list">
        {blocks.map((block) => <article className="admin-block-row" key={block.id}>
          <div className="admin-block-date"><CalendarDays size={15}/><strong>{formatBlock(block.starts_at, { weekday: 'short', day: '2-digit', month: 'short' })}</strong></div>
          <div><strong>{barberName(block.barber_member_id)}</strong><small>{block.reason || 'Indisponibilidade'}</small></div>
          <span><Clock3 size={13}/>{isFullDay(block) ? 'Dia inteiro' : `${formatBlock(block.starts_at, { hour: '2-digit', minute: '2-digit' })} – ${formatBlock(block.ends_at, { hour: '2-digit', minute: '2-digit' })}`}</span>
          <button type="button" className="admin-block-remove" onClick={() => void removeBlock(block.id)} aria-label="Remover bloqueio" title="Remover bloqueio"><Trash2 size={15}/></button>
        </article>)}
      </div>}
    </section>
  </div>
}
