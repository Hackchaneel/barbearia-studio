import { useEffect, useState } from 'react'
import { BARBERSHOP_ID } from './shopConfig'
import { supabase } from './supabase'

export type ShopInfo = {
  name: string
  description: string
  phone: string | null
  email: string | null
  address_line: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  cancellation_policy: string
}
type BusinessHour = { weekday: number; is_closed: boolean; opens_at: string | null; closes_at: string | null }

const fallback: ShopInfo = {
  name: 'Noir Barbearia',
  description: 'Barbearia contemporânea em Pinheiros.',
  phone: null,
  email: null,
  address_line: 'Rua dos Pinheiros, 412',
  city: 'São Paulo',
  state: 'SP',
  postal_code: null,
  cancellation_policy: '',
}

function hourText(value: string) {
  const [hour, minute] = value.slice(0, 5).split(':').map(Number)
  return minute ? `${hour}h${String(minute).padStart(2, '0')}` : `${hour}h`
}

function formatSchedule(hours: BusinessHour[]) {
  const names = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const days = Array.from({ length: 7 }, (_, weekday) => hours.find((item) => item.weekday === weekday))
  const ranges: { start: number; end: number; value: string }[] = []
  days.forEach((day, index) => {
    const value = !day || day.is_closed || !day.opens_at || !day.closes_at ? 'Fechado' : `${hourText(day.opens_at)} às ${hourText(day.closes_at)}`
    const previous = ranges[ranges.length - 1]
    if (previous?.value === value) previous.end = index
    else ranges.push({ start: index, end: index, value })
  })
  return ranges.filter((range) => range.value !== 'Fechado').map((range) => {
    const label = range.start === range.end ? names[range.start] : `${names[range.start]} a ${names[range.end]}`
    return `${label} · ${range.value}`
  })
}

export function usePublicShop() {
  const [shop, setShop] = useState<ShopInfo>(fallback)
  const [hours, setHours] = useState<string[]>([])
  useEffect(() => {
    if (!supabase) return
    let active = true
    void Promise.all([
      supabase.from('barbershops').select('name, description, phone, email, address_line, city, state, postal_code, cancellation_policy')
        .eq('id', BARBERSHOP_ID).maybeSingle(),
      supabase.from('business_hours').select('weekday, is_closed, opens_at, closes_at')
        .eq('barbershop_id', BARBERSHOP_ID).is('barber_member_id', null).order('weekday'),
    ]).then(([shopResult, hoursResult]) => {
      if (!active) return
      if (!shopResult.error && shopResult.data) setShop(shopResult.data as ShopInfo)
      if (!hoursResult.error && hoursResult.data?.length) setHours(formatSchedule(hoursResult.data as BusinessHour[]))
    }).catch(() => {})
    return () => { active = false }
  }, [])
  const address = [shop.address_line, [shop.city, shop.state].filter(Boolean).join(' · '), shop.postal_code].filter(Boolean).join('\n')
  return { shop, hours, address }
}
