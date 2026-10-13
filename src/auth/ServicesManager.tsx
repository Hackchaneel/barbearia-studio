import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Check, LoaderCircle, Pencil, Plus, RefreshCw, Scissors, ToggleLeft, ToggleRight, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

type ServiceRecord = {
  id: string
  name: string
  description: string
  price_cents: number
  duration_minutes: number
  buffer_minutes: number
  is_active: boolean
  sort_order: number
}

const emptyForm = { name: '', description: '', price: '', duration: '45', buffer: '0' }

function formatPrice(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

export default function ServicesManager({ barbershopId }: { barbershopId: string }) {
  const [services, setServices] = useState<ServiceRecord[]>([])
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState<ServiceRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    setError(null)
    const { data, error: queryError } = await supabase.from('services')
      .select('id, name, description, price_cents, duration_minutes, buffer_minutes, is_active, sort_order')
      .eq('barbershop_id', barbershopId)
      .order('sort_order')
      .order('name')
    if (queryError) {
      setError('Não foi possível carregar os serviços. Confira se sua conta tem permissão de gestão.')
    } else {
      setServices((data ?? []) as ServiceRecord[])
    }
    setLoading(false)
  }, [barbershopId])

  useEffect(() => { void load() }, [load])

  const startEditing = (service: ServiceRecord) => {
    setEditing(service)
    setForm({
      name: service.name,
      description: service.description,
      price: (service.price_cents / 100).toFixed(2),
      duration: String(service.duration_minutes),
      buffer: String(service.buffer_minutes),
    })
    setError(null)
    setNotice(null)
  }

  const resetForm = () => {
    setEditing(null)
    setForm(emptyForm)
    setError(null)
    setNotice(null)
  }

  const saveService = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    const priceCents = Math.round(Number(form.price.replace(',', '.')) * 100)
    const duration = Number(form.duration)
    const buffer = Number(form.buffer)
    if (!Number.isFinite(priceCents) || priceCents < 0 || !Number.isInteger(duration) || duration < 5 || duration > 480 || !Number.isInteger(buffer) || buffer < 0 || buffer > 240) {
      setError('Confira preço, duração (5 a 480 min) e intervalo (0 a 240 min).')
      return
    }

    setSaving(true)
    setError(null)
    setNotice(null)
    const values = {
      name: form.name.trim(),
      description: form.description.trim(),
      price_cents: priceCents,
      duration_minutes: duration,
      buffer_minutes: buffer,
    }
    const result = editing
      ? await supabase.from('services').update(values).eq('barbershop_id', barbershopId).eq('id', editing.id)
      : await supabase.from('services').insert({ ...values, barbershop_id: barbershopId, sort_order: services.length + 1 })
    if (result.error) {
      setError('Não foi possível salvar o serviço. Confira os dados e tente novamente.')
    } else {
      resetForm()
      setNotice(editing ? 'Serviço atualizado.' : 'Serviço cadastrado.')
      await load()
    }
    setSaving(false)
  }

  const toggleService = async (service: ServiceRecord) => {
    if (!supabase) return
    setBusyId(service.id)
    setError(null)
    setNotice(null)
    const { error: updateError } = await supabase.from('services')
      .update({ is_active: !service.is_active })
      .eq('barbershop_id', barbershopId)
      .eq('id', service.id)
    if (updateError) {
      setError('Não foi possível alterar o estado deste serviço.')
    } else {
      setNotice(service.is_active ? 'Serviço desativado; ele não aparecerá para novos agendamentos.' : 'Serviço ativado e disponível para agendamento.')
      await load()
    }
    setBusyId(null)
  }

  return <div className="admin-services-layout">
    <section className="admin-card">
      <div className="admin-card-heading"><div><span className="eyebrow">CATÁLOGO</span><h2>{editing ? 'Editar serviço' : 'Novo serviço'}</h2></div>{editing && <button type="button" className="admin-icon-button" onClick={resetForm} aria-label="Cancelar edição"><X size={16}/></button>}</div>
      <form className="admin-service-form" onSubmit={(event) => void saveService(event)}>
        <label>Nome do serviço
          <input required maxLength={80} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Corte clássico" />
        </label>
        <label className="admin-service-description">Descrição
          <textarea maxLength={240} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Descreva o que está incluído no serviço" />
        </label>
        <div className="admin-service-numbers">
          <label>Preço (R$)
            <input required type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} placeholder="65,00" />
          </label>
          <label>Duração (min)
            <input required type="number" min="5" max="480" step="5" value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value })} />
          </label>
          <label>Intervalo depois (min)
            <input required type="number" min="0" max="240" step="5" value={form.buffer} onChange={(event) => setForm({ ...form, buffer: event.target.value })} />
          </label>
        </div>
        {error && <div className="admin-alert" role="alert">{error}</div>}
        {notice && <div className="admin-block-notice" role="status">{notice}</div>}
        <button className="button button-gold" type="submit" disabled={saving}>
          {saving ? <LoaderCircle className="spin" size={15}/> : editing ? <Check size={15}/> : <Plus size={15}/>}
          {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Cadastrar serviço'}
        </button>
      </form>
      <p className="admin-footnote">Serviços desativados deixam de aparecer para novos clientes; o histórico de atendimentos é preservado.</p>
    </section>

    <section className="admin-card">
      <div className="admin-card-heading"><div><span className="eyebrow">SEUS SERVIÇOS</span><h2>Catálogo da barbearia</h2></div><button type="button" className="admin-refresh" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''}/> Atualizar</button></div>
      {loading ? <div className="admin-loading">Carregando serviços…</div> : services.length === 0 ? <div className="admin-empty-inline">Nenhum serviço cadastrado nesta barbearia.</div> : <div className="admin-services-list">
        {services.map((service) => <article className={`admin-service-row${service.is_active ? '' : ' is-inactive'}`} key={service.id}>
          <div className="admin-service-icon"><Scissors size={17}/></div>
          <div className="admin-service-info"><strong>{service.name}</strong><small>{service.description || 'Sem descrição'} · {service.duration_minutes} min{service.buffer_minutes ? ` + ${service.buffer_minutes} min de intervalo` : ''}</small></div>
          <strong className="admin-service-price">{formatPrice(service.price_cents)}</strong>
          <span className={`admin-service-state${service.is_active ? ' active' : ''}`}>{service.is_active ? 'Ativo' : 'Inativo'}</span>
          <div className="admin-service-actions">
            <button type="button" onClick={() => startEditing(service)} title={`Editar ${service.name}`} aria-label={`Editar ${service.name}`}><Pencil size={14}/></button>
            <button type="button" onClick={() => void toggleService(service)} disabled={busyId === service.id} title={service.is_active ? 'Desativar serviço' : 'Ativar serviço'} aria-label={service.is_active ? 'Desativar serviço' : 'Ativar serviço'}>
              {busyId === service.id ? <LoaderCircle className="spin" size={15}/> : service.is_active ? <ToggleRight size={17}/> : <ToggleLeft size={17}/>}
            </button>
          </div>
        </article>)}
      </div>}
      <p className="admin-footnote">Para aparecerem na agenda pública, serviços precisam estar associados a um profissional habilitado.</p>
    </section>
  </div>
}
