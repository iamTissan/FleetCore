/**
 * EDGE FUNCTION: send-invite
 * Sends an org invite email with a signup link pre-filled with the
 * organization's tenant code. Called from admin/team.html "Invite" flow.
 *
 * Body: { email, role, org_id }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL     = Deno.env.get('FROM_EMAIL') || 'noreply@fleetcore.app'
const APP_URL        = Deno.env.get('APP_URL')    || 'https://fleetcore.vercel.app'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_KEY)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No authorization header.')
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) throw new Error('Not authenticated.')

    const { data: caller } = await supabaseAdmin.from('profiles')
      .select('role, organization_id').eq('id', user.id).single()
    if (!caller || caller.role !== 'company_admin') throw new Error('Only Company Admins can invite.')

    const { email, role } = await req.json()
    const { data: org } = await supabaseAdmin.from('organizations')
      .select('name, subdomain').eq('id', caller.organization_id).single()

    if (BREVO_API_KEY) {
      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { email: FROM_EMAIL, name: 'FleetCore' },
          to: [{ email }],
          subject: `You've been invited to join ${org?.name} on FleetCore`,
          htmlContent: `<p>You've been invited to join <strong>${org?.name}</strong> on FleetCore as a ${role.replace('_', ' ')}.</p><p>Company code: <strong>${org?.subdomain}</strong></p><p><a href="${APP_URL}">Create your account</a> using this code.</p>`,
        }),
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
