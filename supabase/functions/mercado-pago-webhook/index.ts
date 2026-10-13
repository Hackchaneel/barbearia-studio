import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

async function isValidSignature(signature: string | null, requestId: string | null, dataId: string, secret: string) {
  if (!signature) return false
  const parts = new Map(signature.split(',').map((part) => {
    const separator = part.indexOf('=')
    return separator < 0 ? ['', ''] : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()]
  }))
  const timestamp = parts.get('ts')
  const receivedHash = parts.get('v1')
  if (!timestamp || !receivedHash) return false

  const manifest = [
    `id:${dataId.toLowerCase()};`,
    requestId ? `request-id:${requestId};` : '',
    `ts:${timestamp};`,
  ].join('')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest))
  const expectedHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return constantTimeEqual(expectedHash, receivedHash.toLowerCase())
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ received: true })

  let notification: Record<string, unknown> = {}
  try {
    notification = await request.json()
  } catch {
    return json({ error: 'Payload inválido.' }, 400)
  }
  const url = new URL(request.url)
  const notificationType = url.searchParams.get('type') ?? notification.type
  if (notificationType !== 'payment') return json({ received: true, ignored: true })

  const dataId = url.searchParams.get('data.id') ?? url.searchParams.get('data_id') ?? ''
  const secret = Deno.env.get('MERCADO_PAGO_WEBHOOK_SECRET')
  const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!secret || !accessToken || !supabaseUrl || !serviceRoleKey) return json({ error: 'Webhook não configurado.' }, 503)
  if (!dataId || !/^\d+$/.test(dataId)) return json({ error: 'Identificador de pagamento inválido.' }, 400)

  const valid = await isValidSignature(
    request.headers.get('x-signature'),
    request.headers.get('x-request-id'),
    dataId,
    secret,
  )
  if (!valid) return json({ error: 'Assinatura inválida.' }, 401)

  let providerResponse: Response
  try {
    providerResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch {
    return json({ error: 'Não foi possível consultar o pagamento.' }, 502)
  }
  if (!providerResponse.ok) return json({ error: 'Não foi possível confirmar o pagamento no Mercado Pago.' }, 502)

  const payment = await providerResponse.json()
  const appointmentId = payment.external_reference
  if (typeof appointmentId !== 'string' || !/^[0-9a-f-]{36}$/i.test(appointmentId)) {
    return json({ received: true, ignored: true })
  }
  if (String(payment.id) !== dataId || !Number.isFinite(Number(payment.transaction_amount))) {
    return json({ error: 'Dados do pagamento inválidos.' }, 422)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: result, error } = await admin.rpc('sync_mercado_pago_payment', {
    _appointment_id: appointmentId,
    _provider_payment_id: dataId,
    _status: String(payment.status ?? 'pending'),
    _amount_cents: Math.round(Number(payment.transaction_amount) * 100),
    _currency: String(payment.currency_id ?? ''),
  })
  if (error) {
    console.error('sync_mercado_pago_payment failed:', error.code)
    if (error.code === 'P0002') return json({ received: true, ignored: true })
    return json({ error: 'O pagamento não passou pela validação do agendamento.' }, 422)
  }

  return json({ received: true, appointment: result })
})
