import { Scissors } from 'lucide-react'
import { services as demoServices, type Service } from '../data/mock'
import { supabase } from './supabase'

export const DEMO_BARBERSHOP_ID = '10000000-0000-4000-8000-000000000001'

export async function loadPublicServices(): Promise<Service[]> {
  if (!supabase) return demoServices
  const { data, error } = await supabase.from('services')
    .select('id, name, description, price_cents, duration_minutes, sort_order')
    .eq('barbershop_id', DEMO_BARBERSHOP_ID)
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
