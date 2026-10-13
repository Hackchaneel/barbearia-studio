import { Scissors } from 'lucide-react'
import { barbers as demoBarbers, services as demoServices, type Service } from '../data/mock'
import { supabase } from './supabase'
import { BARBERSHOP_ID, DEMO_BARBERSHOP_ID } from './shopConfig'

export { BARBERSHOP_ID, DEMO_BARBERSHOP_ID }

export type PublicBarber = { id: string; name: string; role: string; image?: string }

export async function loadPublicServices(): Promise<Service[]> {
  if (!supabase) return demoServices
  const { data, error } = await supabase.from('services')
    .select('id, name, description, price_cents, duration_minutes, sort_order')
    .eq('barbershop_id', BARBERSHOP_ID)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error
  return (data ?? []).map((service) => ({
    id: service.id,
    name: service.name,
    description: service.description,
    price: service.price_cents / 100,
    duration: service.duration_minutes,
    icon: Scissors,
  }))
}

export async function loadPublicBarbers(): Promise<PublicBarber[]> {
  if (!supabase) return demoBarbers.map((barber, index) => ({ ...barber, id: `demo-${index}` }))
  const { data, error } = await supabase.from('barbershop_members')
    .select('id, display_name, bio, avatar_url')
    .eq('barbershop_id', BARBERSHOP_ID)
    .eq('role', 'barber')
    .eq('is_active', true)
    .eq('is_public', true)
    .order('display_name')
  if (error) throw error
  return (data ?? []).map((barber) => ({
    id: barber.id,
    name: barber.display_name,
    role: barber.bio || 'Barbeiro',
    image: barber.avatar_url ?? undefined,
  }))
}
