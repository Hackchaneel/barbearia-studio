import { Clock3, Scissors, Sparkles } from 'lucide-react'
export type Service = { id: string; name: string; description: string; price: number; duration: number; icon: typeof Scissors; tag?: string }
export const services: Service[] = [
  { id: 'classic', name: 'Corte clássico', description: 'Precisão nos detalhes, acabamento na navalha e finalização.', price: 65, duration: 45, icon: Scissors, tag: 'MAIS PEDIDO' },
  { id: 'beard', name: 'Barba & toalha quente', description: 'Ritual completo com toalha quente, desenho e hidratação.', price: 48, duration: 35, icon: Sparkles },
  { id: 'combo', name: 'Corte + barba', description: 'A experiência completa para sair renovado da cadeira.', price: 99, duration: 75, icon: Clock3, tag: 'COMBO' },
]
export const barbers = [
  { name: 'Rafael Costa', role: 'Especialista em cortes clássicos', image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=85' },
  { name: 'André Lima', role: 'Barba & visagismo', image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=85' },
  { name: 'Caio Mendes', role: 'Cortes contemporâneos', image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=600&q=85' },
]
