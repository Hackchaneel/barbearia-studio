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

  let appointmentId: unknown
  try {
    appointmentId = (await request.json()).appointment_id
  } catch {
    return json({ error: 'Envie o identificador do agendamento.' }, 400)
  }
  if (typeof appointmentId !== 'string' || !/^[0-9a-f-]{36}$/i.test(appointmentId)) {
    return json({ error: 'Agendamento inválido.' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN')
  const siteUrl = Deno.env.get('PUBLIC_SITE_URL')?.replace(/\/$/, '')
  if (!supabaseUrl || !serviceRoleKey || !accessToken || !siteUrl) {
    return json({ error: 'Checkout ainda não está configurado no servidor.' }, 503)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: claimed, error: claimError } = await admin.rpc('claim_payment_checkout', {
    _appointment_id: appointmentId,
  })
  const intent = claimed?.[0]
  if (claimError || !intent) {
    if (claimError?.code === '55P03') return json({ error: 'O checkout deste horário já está sendo preparado. Tente novamente em instantes.' }, 409)
    if (claimError?.code === 'P0002') return json({ error: 'A reserva expirou. Escolha outro horário.' }, 410)
    console.error('claim_payment_checkout failed:', claimError?.code)
    return json({ error: 'Não foi possível iniciar o pagamento.' }, 500)
  }
  if (!intent.should_create && intent.checkout_url) {
    return json({ checkout_url: intent.checkout_url, reused: true })
  }

  const { data: appointment, error: appointmentError } = await admin.from('appointments')
    .select('id, service_id, customer_name, customer_email')
    .eq('id', appointmentId)
    .maybeSingle()
  const { data: service, error: serviceError } = appointment
    ? await admin.from('services')
      .select('name')
      .eq('barbershop_id', intent.barbershop_id)
      .eq('id', appointment.service_id)
      .maybeSingle()
    : { data: null, error: null }
  if (appointmentError || serviceError || !appointment || !service) {
    await admin.rpc('release_payment_checkout', { _payment_id: intent.payment_id })
    return json({ error: 'Não foi possível carregar os dados do agendamento.' }, 500)
  }

  const expiresAt = new Date(intent.hold_expires_at)
  const now = new Date()
  if (expiresAt <= now) {
    await admin.rpc('release_payment_checkout', { _payment_id: intent.payment_id })
    return json({ error: 'A reserva expirou. Escolha outro horário.' }, 410)
  }

  const webhookUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/mercado-pago-webhook`
  const preference = {
    items: [{
      id: appointmentId,
      title: `Agendamento: ${service.name}`.slice(0, 250),
      quantity: 1,
      currency_id: 'BRL',
      unit_price: intent.amount_cents / 100,
    }],
    payer: {
      name: appointment.customer_name,
      ...(appointment.customer_email ? { email: appointment.customer_email } : {}),
    },
    external_reference: appointmentId,
    notification_url: webhookUrl,
    back_urls: {
      success: `${siteUrl}/agendar?pagamento=retorno`,
      pending: `${siteUrl}/agendar?pagamento=pendente`,
      failure: `${siteUrl}/agendar?pagamento=falhou`,
    },
    auto_return: 'approved',
    expires: true,
    expiration_date_from: now.toISOString(),
    expiration_date_to: expiresAt.toISOString(),
    metadata: { appointment_id: appointmentId, payment_intent_id: intent.payment_id },
  }

  let response: Response
  try {
    response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(preference),
    })
  } catch {
    await admin.rpc('release_payment_checkout', { _payment_id: intent.payment_id })
    return json({ error: 'Não foi possível conectar ao Mercado Pago. Tente novamente.' }, 502)
  }

  if (!response.ok) {
    await admin.rpc('release_payment_checkout', { _payment_id: intent.payment_id })
    console.error('Mercado Pago preference request failed:', response.status)
    return json({ error: 'O Mercado Pago não conseguiu iniciar o checkout. Tente novamente.' }, 502)
  }

  const created = await response.json()
  const checkoutUrl = accessToken.startsWith('TEST-')
    ? (created.sandbox_init_point ?? created.init_point)
    : created.init_point
  if (typeof created.id !== 'string' || typeof checkoutUrl !== 'string') {
    await admin.rpc('release_payment_checkout', { _payment_id: intent.payment_id })
    return json({ error: 'O Mercado Pago retornou um checkout incompleto.' }, 502)
  }

  const { error: saveError } = await admin.rpc('finish_payment_checkout', {
    _payment_id: intent.payment_id,
    _preference_id: created.id,
    _checkout_url: checkoutUrl,
  })
  if (saveError) {
    console.error('finish_payment_checkout failed:', saveError.code)
    return json({ error: 'Checkout criado, mas não foi possível registrar o pagamento. Tente novamente.' }, 500)
  }

  return json({ checkout_url: checkoutUrl, reused: false }, 201)
})
