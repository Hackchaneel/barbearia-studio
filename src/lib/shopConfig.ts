export const DEMO_BARBERSHOP_ID = '10000000-0000-4000-8000-000000000001'

// Set this per deployment when installing the app for another barbershop.
export const BARBERSHOP_ID = import.meta.env.VITE_BARBERSHOP_ID?.trim() || DEMO_BARBERSHOP_ID
export const SHOP_TIME_ZONE = import.meta.env.VITE_SHOP_TIME_ZONE?.trim() || 'America/Sao_Paulo'

export function shopLocalDateTime(day: string, time: string) {
  const [year, month, date] = day.split('-').map(Number)
  const [hour = 0, minute = 0] = time.split(':').map(Number)
  const targetWallTime = Date.UTC(year, month - 1, date, hour, minute)
  let instant = targetWallTime
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: SHOP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  })
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatter.formatToParts(new Date(instant))
    const part = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? 0)
    const representedWallTime = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'))
    instant += targetWallTime - representedWallTime
  }
  return new Date(instant)
}

export function shopDayStart(day: string) {
  return shopLocalDateTime(day, '00:00')
}

export function nextShopDay(day: string) {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10)
}

export function shiftShopDay(day: string, offset: number) {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date + offset)).toISOString().slice(0, 10)
}
