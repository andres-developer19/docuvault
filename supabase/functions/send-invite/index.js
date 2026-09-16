import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const resendApiKey = Deno.env.get('RESEND_API_KEY')
const appUrl = Deno.env.get('APP_URL') || 'https://docuvault-five.vercel.app'
const fromEmail = Deno.env.get('FROM_EMAIL') || 'DocuVault <onboarding@resend.dev>'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), { status: 405, headers: corsHeaders })
  }
  try {
    const body = await req.json()
    const familyId = body.family_id
    const invitedEmail = String(body.invited_email || '').trim().toLowerCase()
    if (!familyId || !invitedEmail.includes('@')) {
      return new Response(JSON.stringify({ error: 'Faltan datos: family_id e invited_email' }), { status: 400, headers: corsHeaders })
    }

    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401, headers: corsHeaders })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt)
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401, headers: corsHeaders })
    }

    const { data: family, error: famError } = await supabase
      .from('families')
      .select('id, name, user_id')
      .eq('id', familyId)
      .single()
    if (famError || !family) {
      return new Response(JSON.stringify({ error: 'Familia no encontrada' }), { status: 404, headers: corsHeaders })
    }
    if (family.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'No eres propietario de esta familia' }), { status: 403, headers: corsHeaders })
    }

    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY no configurado' }), { status: 500, headers: corsHeaders })
    }

    const inviter = user.user_metadata?.full_name || user.email || 'Alguien de tu familia'
    const subject = `Invitación a la familia "${family.name}" en DocuVault`
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #1f2937;">
        <div style="font-size: 22px; font-weight: 800; color: #4f46e5; margin-bottom: 16px;">&#128193; DocuVault</div>
        <p>¡Hola!</p>
        <p><strong>${escapeHtml(inviter)}</strong> te invita a la familia <strong>"${escapeHtml(family.name)}"</strong> en DocuVault, tu gestor de documentos familiar.</p>
        <p>Para aceptar la invitación:</p>
        <ol style="line-height: 1.7;">
          <li>Si aún no tienes cuenta, regístrate en <a href="${appUrl}" style="color:#4f46e5;">${appUrl}</a> <strong>con este mismo correo</strong>.</li>
          <li>Inicia sesión y ve a la pestaña <strong>Familias</strong>.</li>
          <li>Arriba verás la invitación a "<strong>${escapeHtml(family.name)}</strong>" con un botón <strong>Aceptar</strong>.</li>
        </ol>
        <p style="margin-top: 24px; color: #6b7280; font-size: 13px;">Si el enlace no funciona, cópialo y pégalo en tu navegador. No respondas a este correo.</p>
      </div>`

    const resend = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [invitedEmail],
        subject,
        html
      })
    })

    const resendBody = await resend.text()
    if (!resend.ok) {
      console.error('Resend error:', resend.status, resendBody)
      return new Response(JSON.stringify({ error: 'No se pudo enviar el correo', detail: resendBody }), { status: 500, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ ok: true, id: resendBody }), { status: 200, headers: corsHeaders })
  } catch (err) {
    console.error('send-invite error:', err)
    return new Response(JSON.stringify({ error: 'Error interno', detail: String(err) }), { status: 500, headers: corsHeaders })
  }
})

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}