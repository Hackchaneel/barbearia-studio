import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Check, Clock3, LoaderCircle, Plus, RefreshCw, UserRound } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Barber = { id: string; display_name: string; bio: string; avatar_url: string | null; is_public: boolean; is_active: boolean }
type ServiceOption = { id: string; name: string; is_active: boolean }
type ScheduleDay = {
  weekday: number
  is_closed: boolean
  opens_at: string
  closes_at: string
  break_starts_at: string
  break_ends_at: string
}

const week = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const defaultSchedule = (): ScheduleDay[] => week.map((_, weekday) => ({
  weekday, is_closed: true, opens_at: '09:00', closes_at: '18:00', break_starts_at: '', break_ends_at: '',
}))

function hhmm(value: string | null) { return value?.slice(0, 5) ?? '' }

export default function TeamManager({ barbershopId }: { barbershopId: string }) {
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [services, setServices] = useState<ServiceOption[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingServices, setSavingServices] = useState(false)
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newBio, setNewBio] = useState('')

  const selectedBarber = barbers.find((barber) => barber.id === selectedId) ?? null
  const activeServices = useMemo(() => services.filter((service) => service.is_active), [services])
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [isActive, setIsActive] = useState(true)
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [schedule, setSchedule] = useState<ScheduleDay[]>(defaultSchedule)
  const [detailsLoading, setDetailsLoading] = useState(false)

  const loadTeam = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    setError(null)
    const [memberResult, serviceResult] = await Promise.all([
      supabase.from('barbershop_members')
        .select('id, display_name, bio, avatar_url, is_public, is_active')
        .eq('barbershop_id', barbershopId)
        .eq('role', 'barber')
        .order('display_name'),
      supabase.from('services')
        .select('id, name, is_active')
        .eq('barbershop_id', barbershopId)
        .order('sort_order')
        .order('name'),
    ])
    if (memberResult.error || serviceResult.error) {
      setError('Não foi possível carregar a equipe. Confira se as migrações do Supabase foram aplicadas.')
    } else {
      setBarbers((memberResult.data ?? []) as Barber[])
      setServices((serviceResult.data ?? []) as ServiceOption[])
    }
    setLoading(false)
  }, [barbershopId])

  useEffect(() => { void loadTeam() }, [loadTeam])

  useEffect(() => {
    if (!selectedBarber || !supabase) {
      setSelectedServices([])
      setSchedule(defaultSchedule())
      return
    }
    let active = true
    setDetailsLoading(true)
    setDisplayName(selectedBarber.display_name)
    setBio(selectedBarber.bio ?? '')
    setAvatarUrl(selectedBarber.avatar_url ?? '')
    setIsPublic(selectedBarber.is_public)
    setIsActive(selectedBarber.is_active)
    void Promise.all([
      supabase.from('barber_services').select('service_id')
        .eq('barbershop_id', barbershopId).eq('barber_member_id', selectedBarber.id),
      supabase.from('business_hours').select('weekday, is_closed, opens_at, closes_at, break_starts_at, break_ends_at')
        .eq('barbershop_id', barbershopId).eq('barber_member_id', selectedBarber.id),
      supabase.from('business_hours').select('weekday, is_closed, opens_at, closes_at, break_starts_at, break_ends_at')
        .eq('barbershop_id', barbershopId).is('barber_member_id', null),
    ]).then(([offerings, personalHours, shopHours]) => {
      if (!active) return
      if (offerings.error || personalHours.error || shopHours.error) {
        setError('Não foi possível carregar serviços e horários deste profissional.')
      } else {
        setSelectedServices((offerings.data ?? []).map((item) => item.service_id).filter((id) => activeServices.some((service) => service.id === id)))
        const general = new Map((shopHours.data ?? []).map((item) => [item.weekday, item]))
        const personal = new Map((personalHours.data ?? []).map((item) => [item.weekday, item]))
        setSchedule(week.map((_, weekday) => {
          const row = personal.get(weekday) ?? general.get(weekday)
          return row ? {
            weekday,
            is_closed: row.is_closed,
            opens_at: hhmm(row.opens_at),
            closes_at: hhmm(row.closes_at),
            break_starts_at: hhmm(row.break_starts_at),
            break_ends_at: hhmm(row.break_ends_at),
          } : defaultSchedule()[weekday]
        }))
      }
      setDetailsLoading(false)
    }).catch(() => {
      if (active) {
        setError('Não foi possível carregar os dados deste profissional.')
        setDetailsLoading(false)
      }
    })
    return () => { active = false }
  }, [barbershopId, selectedBarber, activeServices])

  const addBarber = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    setCreating(true)
    setError(null)
    setNotice(null)
    const { data, error: createError } = await supabase.rpc('add_barbershop_barber', {
      _barbershop_id: barbershopId,
      _email: email.trim(),
      _display_name: newName.trim(),
      _bio: newBio.trim(),
      _is_public: true,
    })
    if (createError) {
      setError(createError.message.includes('No confirmed account')
        ? 'Essa conta não foi encontrada ou ainda não confirmou o e-mail. Peça ao profissional para criar a conta em /entrar e confirmar o cadastro.'
        : createError.message.includes('different role')
          ? 'Essa conta já tem outro papel nesta barbearia.'
          : 'Não foi possível adicionar o profissional. Confira o e-mail e tente novamente.')
    } else {
      setNotice('Profissional vinculado à equipe. Agora configure os serviços e horários.')
      setEmail('')
      setNewName('')
      setNewBio('')
      await loadTeam()
      if (typeof data === 'string') setSelectedId(data)
    }
    setCreating(false)
  }

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase || !selectedBarber) return
    setSavingProfile(true)
    setError(null)
    setNotice(null)
    const { error: updateError } = await supabase.rpc('update_barbershop_barber', {
      _barbershop_id: barbershopId,
      _barber_member_id: selectedBarber.id,
      _display_name: displayName.trim(),
      _bio: bio.trim(),
      _avatar_url: avatarUrl.trim(),
      _is_public: isPublic,
      _is_active: isActive,
    })
    if (updateError) {
      setError('Não foi possível salvar o perfil do profissional.')
    } else {
      setNotice('Perfil atualizado.')
      await loadTeam()
    }
    setSavingProfile(false)
  }

  const saveServices = async () => {
    if (!supabase || !selectedBarber) return
    setSavingServices(true)
    setError(null)
    setNotice(null)
    const { error: saveError } = await supabase.rpc('replace_barber_services', {
      _barbershop_id: barbershopId,
      _barber_member_id: selectedBarber.id,
      _service_ids: selectedServices,
    })
    if (saveError) setError('Não foi possível atualizar os serviços deste profissional.')
    else setNotice('Serviços associados ao profissional.')
    setSavingServices(false)
  }

  const updateScheduleDay = (weekday: number, values: Partial<ScheduleDay>) => {
    setSchedule((current) => current.map((day) => day.weekday === weekday ? { ...day, ...values } : day))
  }

  const saveSchedule = async () => {
    if (!supabase || !selectedBarber) return
    const invalid = schedule.some((day) => !day.is_closed && (
      !day.opens_at || !day.closes_at || day.closes_at <= day.opens_at
      || Boolean(day.break_starts_at) !== Boolean(day.break_ends_at)
      || Boolean(day.break_starts_at && day.break_ends_at && (day.break_starts_at < day.opens_at || day.break_ends_at > day.closes_at || day.break_ends_at <= day.break_starts_at))
    ))
    if (invalid) {
      setError('Confira os horários: o fim deve ser depois do início e a pausa precisa ficar dentro do expediente.')
      return
    }
    setSavingSchedule(true)
    setError(null)
    setNotice(null)
    const rows = schedule.map((day) => ({
      barbershop_id: barbershopId,
      barber_member_id: selectedBarber.id,
      weekday: day.weekday,
      is_closed: day.is_closed,
      opens_at: day.is_closed ? null : day.opens_at,
      closes_at: day.is_closed ? null : day.closes_at,
      break_starts_at: day.is_closed || !day.break_starts_at ? null : day.break_starts_at,
      break_ends_at: day.is_closed || !day.break_ends_at ? null : day.break_ends_at,
    }))
    const { error: saveError } = await supabase.from('business_hours')
      .upsert(rows, { onConflict: 'barbershop_id,barber_member_id,weekday' })
    if (saveError) setError('Não foi possível salvar a jornada semanal.')
    else setNotice('Jornada semanal atualizada.')
    setSavingSchedule(false)
  }

  return <div className="admin-team-layout">
    <section className="admin-card admin-team-add">
      <div className="admin-card-heading"><div><span className="eyebrow">EQUIPE</span><h2>Adicionar profissional</h2></div></div>
      <div className="admin-team-onboarding">O profissional precisa criar a própria conta em <strong>/entrar</strong> e confirmar o e-mail antes de ser vinculado. Este painel não envia convite por e-mail.</div>
      <form className="admin-team-add-form" onSubmit={(event) => void addBarber(event)}>
        <label>E-mail da conta confirmada<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="profissional@email.com" /></label>
        <label>Nome público<input required maxLength={80} value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nome do profissional" /></label>
        <label>Especialidade / apresentação<input maxLength={160} value={newBio} onChange={(event) => setNewBio(event.target.value)} placeholder="Ex.: Barba e visagismo" /></label>
        <button className="button button-gold" type="submit" disabled={creating}>{creating ? <LoaderCircle className="spin" size={15}/> : <Plus size={15}/>} Vincular profissional</button>
      </form>
      {error && <div className="admin-alert" role="alert">{error}</div>}
      {notice && <div className="admin-block-notice" role="status">{notice}</div>}
    </section>

    <section className="admin-card">
      <div className="admin-card-heading"><div><span className="eyebrow">BARBEIROS</span><h2>Equipe cadastrada</h2></div><button type="button" className="admin-refresh" onClick={() => void loadTeam()} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''}/> Atualizar</button></div>
      {loading ? <div className="admin-loading">Carregando equipe…</div> : barbers.length === 0 ? <div className="admin-empty-inline">Nenhum profissional vinculado ainda.</div> : <div className="admin-team-list">{barbers.map((barber) => <button type="button" key={barber.id} className={`admin-team-person${barber.id === selectedId ? ' selected' : ''}`} onClick={() => { setSelectedId(barber.id); setError(null); setNotice(null) }}>
        <span className="admin-avatar"><UserRound size={15}/></span><span><strong>{barber.display_name}</strong><small>{barber.bio || 'Sem apresentação'}</small></span><i className={barber.is_active ? 'active' : ''}>{barber.is_active ? 'Ativo' : 'Inativo'}</i>
      </button>)}</div>}
    </section>

    {selectedBarber && <section className="admin-team-details">
      {error && <div className="admin-alert" role="alert">{error}</div>}
      {notice && <div className="admin-block-notice" role="status">{notice}</div>}
      {detailsLoading ? <div className="admin-loading">Carregando configuração do profissional…</div> : <>
        <section className="admin-card">
          <div className="admin-card-heading"><div><span className="eyebrow">PERFIL</span><h2>{selectedBarber.display_name}</h2></div></div>
          <form className="admin-team-profile-form" onSubmit={(event) => void saveProfile(event)}>
            <label>Nome<input required maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
            <label>Especialidade / apresentação<input maxLength={160} value={bio} onChange={(event) => setBio(event.target.value)} /></label>
            <label>URL da foto<input type="url" maxLength={500} value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://…" /></label>
            <div className="admin-team-toggles"><label><input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} /> Exibir no site público</label><label><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /> Profissional ativo</label></div>
            <button className="button button-gold" type="submit" disabled={savingProfile}>{savingProfile ? <LoaderCircle className="spin" size={15}/> : <Check size={15}/>} Salvar perfil</button>
          </form>
        </section>

        <section className="admin-card">
          <div className="admin-card-heading"><div><span className="eyebrow">HABILIDADES</span><h2>Serviços oferecidos</h2></div><button className="admin-text-button" type="button" onClick={() => void saveServices()} disabled={savingServices}>{savingServices ? 'Salvando…' : 'Salvar serviços'} <Check size={14}/></button></div>
          {services.length === 0 ? <div className="admin-empty-inline">Cadastre serviços antes de associá-los à equipe.</div> : <div className="admin-team-services">{services.map((service) => <label key={service.id} className={!service.is_active ? 'inactive' : ''}><input type="checkbox" disabled={!service.is_active} checked={selectedServices.includes(service.id)} onChange={(event) => setSelectedServices((current) => event.target.checked ? [...current, service.id] : current.filter((id) => id !== service.id))} /><span>{service.name}{!service.is_active && ' (inativo)'}</span><small>{service.is_active ? 'Disponível' : 'Inativo'}</small></label>)}</div>}
        </section>

        <section className="admin-card">
          <div className="admin-card-heading"><div><span className="eyebrow">DISPONIBILIDADE</span><h2>Jornada semanal</h2></div><button className="admin-text-button" type="button" onClick={() => void saveSchedule()} disabled={savingSchedule}>{savingSchedule ? 'Salvando…' : 'Salvar jornada'} <Check size={14}/></button></div>
          <p className="admin-footnote">Horários de Brasília. Quando a jornada é salva, ela substitui o horário geral da barbearia para este profissional.</p>
          <div className="admin-schedule-list">{schedule.map((day) => <div className={`admin-schedule-row${day.is_closed ? ' closed' : ''}`} key={day.weekday}>
            <strong>{week[day.weekday]}</strong><label className="admin-schedule-closed"><input type="checkbox" checked={day.is_closed} onChange={(event) => updateScheduleDay(day.weekday, { is_closed: event.target.checked })} /> Folga</label>
            <label>Abre<input type="time" disabled={day.is_closed} value={day.opens_at} onChange={(event) => updateScheduleDay(day.weekday, { opens_at: event.target.value })} /></label>
            <label>Fecha<input type="time" disabled={day.is_closed} value={day.closes_at} onChange={(event) => updateScheduleDay(day.weekday, { closes_at: event.target.value })} /></label>
            <label>Pausa início<input type="time" disabled={day.is_closed} value={day.break_starts_at} onChange={(event) => updateScheduleDay(day.weekday, { break_starts_at: event.target.value })} /></label>
            <label>Pausa fim<input type="time" disabled={day.is_closed} value={day.break_ends_at} onChange={(event) => updateScheduleDay(day.weekday, { break_ends_at: event.target.value })} /></label>
          </div>)}</div>
          <div className="admin-footnote"><Clock3 size={12}/> O sistema usa a jornada individual quando configurada; dias sem configuração pessoal usam o horário geral da barbearia.</div>
        </section>
      </>}
    </section>}
  </div>
}
