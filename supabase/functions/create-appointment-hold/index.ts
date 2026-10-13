import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  let input: Record<string, unknown>
  try {
    input = await request.json()
  } catch {
    return json({ error: 'Envie os dados do agendamento em JSON.' }, 400)
  }

  const requiredText = ['barbershop_id', 'service_id', 'barber_member_id', 'starts_at', 'customer_name', 'customer_phone']
  if (requiredText.some((key) => typeof input[key] !== 'string' || !(input[key] as string).trim())) {
    return json({ error: 'Preencha serviço, profissional, horário, nome e telefone.' }, 400)
  }
  if (input.customer_email != null && typeof input.customer_email !== 'string') {
    return json({ error: 'O e-mail informado é inválido.' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'A função ainda não está configurada.' }, 503)

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await admin.rpc('create_appointment_hold', {
    _barbershop_id: input.barbershop_id,
    _service_id: input.service_id,
    _barber_member_id: input.barber_member_id,
    _starts_at: input.starts_at,
    _customer_name: input.customer_name,
    _customer_phone: input.customer_phone,
    _customer_email: input.customer_email ?? null,
  })

  if (error) {
    if (error.code === '23P01') return json({ error: 'Esse horário acabou de ficar indisponível. Escolha outro.' }, 409)
    if (error.code === '22023') return json({ error: 'Confira os dados enviados.' }, 400)
    console.error('create_appointment_hold failed:', error.code, error.message)
    return json({ error: 'Não foi possível reservar esse horário agora.' }, 500)
  }

  return json({ appointment: data?.[0] ?? null }, 201)
})
