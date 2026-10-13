import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Check, RefreshCw, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Settings = {
  name: string
  description: string
  phone: string
  email: string
  address_line: string
  city: string
  state: string
  postal_code: string
  cancellation_policy: string
  reservation_minutes: number
}
const empty: Settings = {
  name: '', description: '', phone: '', email: '', address_line: '', city: '', state: '', postal_code: '',
  cancellation_policy: '', reservation_minutes: 10,
}

export default function BarbershopSettings({ barbershopId, onSaved }: { barbershopId: string; onSaved: () => void }) {
  const [settings, setSettings] = useState<Settings>(empty)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    setError(null)
    const { data, error: loadError } = await supabase.from('barbershops')
      .select('name, description, phone, email, address_line, city, state, postal_code, cancellation_policy, reservation_minutes')
      .eq('id', barbershopId).maybeSingle()
    if (loadError || !data) setError('Não foi possível carregar as configurações da barbearia.')
    else setSettings({
      name: data.name ?? '', description: data.description ?? '', phone: data.phone ?? '', email: data.email ?? '',
      address_line: data.address_line ?? '', city: data.city ?? '', state: data.state ?? '', postal_code: data.postal_code ?? '',
      cancellation_policy: data.cancellation_policy ?? '', reservation_minutes: data.reservation_minutes ?? 10,
    })
    setLoading(false)
  }, [barbershopId])

  useEffect(() => { void load() }, [load])

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    setSaving(true)
    setError(null)
    setNotice(null)
    const { data, error: saveError } = await supabase.from('barbershops').update({
      name: settings.name.trim(), description: settings.description.trim(),
      phone: settings.phone.trim() || null, email: settings.email.trim() || null,
      address_line: settings.address_line.trim() || null, city: settings.city.trim() || null,
      state: settings.state.trim().toUpperCase() || null, postal_code: settings.postal_code.trim() || null,
      cancellation_policy: settings.cancellation_policy.trim(), reservation_minutes: settings.reservation_minutes,
    }).eq('id', barbershopId).select('id').maybeSingle()
    if (saveError || !data) setError('Não foi possível salvar. Confirme se você é proprietário ou gerente desta barbearia.')
    else {
      setNotice('Configurações salvas. Recarregue o site público para ver os dados atualizados.')
      onSaved()
    }
    setSaving(false)
  }

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((current) => ({ ...current, [key]: value }))

  if (loading) return <section className="admin-card admin-loading">Carregando configurações…</section>
  return <section className="admin-card">
    <div className="admin-card-heading"><div><span className="eyebrow">PERFIL DO ESTABELECIMENTO</span><h2>Dados da barbearia</h2></div><button type="button" className="admin-refresh" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/> Atualizar</button></div>
    {error && <div className="admin-alert" role="alert">{error}</div>}
    {notice && <div className="admin-block-notice" role="status"><Check size={15}/>{notice}</div>}
    <form className="admin-shop-settings-form" onSubmit={save}>
      <label>Nome da barbearia<input required minLength={2} maxLength={120} value={settings.name} onChange={(event) => set('name', event.target.value)}/></label>
      <label>Descrição<textarea rows={3} maxLength={500} value={settings.description} onChange={(event) => set('description', event.target.value)}/></label>
      <div className="admin-settings-grid"><label>Telefone<input type="tel" maxLength={30} value={settings.phone} onChange={(event) => set('phone', event.target.value)}/></label><label>E-mail<input type="email" maxLength={254} value={settings.email} onChange={(event) => set('email', event.target.value)}/></label></div>
      <label>Endereço<input maxLength={180} value={settings.address_line} onChange={(event) => set('address_line', event.target.value)}/></label>
      <div className="admin-settings-grid admin-settings-location"><label>Cidade<input maxLength={100} value={settings.city} onChange={(event) => set('city', event.target.value)}/></label><label>Estado (UF)<input maxLength={2} value={settings.state} onChange={(event) => set('state', event.target.value)}/></label><label>CEP<input maxLength={12} value={settings.postal_code} onChange={(event) => set('postal_code', event.target.value)}/></label></div>
      <label>Política de cancelamento<textarea rows={3} maxLength={2000} placeholder="Informe com quanto tempo de antecedência o cliente pode cancelar." value={settings.cancellation_policy} onChange={(event) => set('cancellation_policy', event.target.value)}/></label>
      <label className="admin-settings-reservation">Prazo para concluir a reserva online (minutos)<input type="number" required min={1} max={120} value={settings.reservation_minutes} onChange={(event) => set('reservation_minutes', Number(event.target.value))}/><small>Se o cliente não concluir o checkout, o horário volta a ficar disponível após esse prazo.</small></label>
      <div className="admin-settings-note">O endereço web e o fuso horário são definidos nas variáveis do ambiente. Para outra barbearia, configure <code>VITE_BARBERSHOP_ID</code> e <code>VITE_SHOP_TIME_ZONE</code> antes de publicar.</div>
      <button type="submit" className="button button-gold" disabled={saving}><Save size={15}/>{saving ? 'Salvando…' : 'Salvar configurações'}</button>
    </form>
  </section>
}
