/**
 * EDGE FUNCTION: create-user
 * Creates a new staff account and sends a welcome email via Brevo.
 * Roles: company_admin | driver | maintenance_officer | account_manager
 * (bex_admin accounts are provisioned manually, never via self-service)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BREVO_API_KEY  = Deno.env.get('BREVO_API_KEY')!
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL      = Deno.env.get('FROM_EMAIL')     || 'noreply@fleetcore.app'
const FROM_NAME       = 'FleetCore'
const APP_URL          = Deno.env.get('APP_URL')        || 'https://fleetcore.vercel.app'

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ROLE_LABELS: Record<string, string> = {
  company_admin:       'Company Admin',
  driver:               'Driver',
  maintenance_officer:  'Maintenance Officer',
  account_manager:      'Account Manager',
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

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles').select('role, organization_id').eq('id', user.id).single()
    if (!callerProfile || (callerProfile.role !== 'company_admin' && callerProfile.role !== 'bex_admin')) {
      throw new Error('Only Company Admins and Bex Admin can create staff accounts.')
    }

    const { email, full_name, role, phone_number, organization_id } = await req.json()
    if (!ROLE_LABELS[role]) throw new Error('Invalid role.')

    // Company Admins can only create staff in their own org. Bex Admin
    // must explicitly pass organization_id (provisioning a new tenant's
    // first admin, or adding staff to any tenant for support purposes).
    let targetOrgId = callerProfile.organization_id
    if (callerProfile.role === 'bex_admin') {
      if (!organization_id) throw new Error('organization_id is required when Bex Admin creates a user.')
      targetOrgId = organization_id
    }

    const tempPassword = crypto.randomUUID().slice(0, 12)

    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email, password: tempPassword, email_confirm: true,
      user_metadata: { full_name, role, organization_id: targetOrgId },
    })
    if (createErr) throw createErr

    await supabaseAdmin.from('profiles').upsert({
      id: newUser.user.id, full_name, email, role, phone_number,
      organization_id: targetOrgId, status: 'active',
    }, { onConflict: 'id' })

    if (BREVO_API_KEY) {
      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { email: FROM_EMAIL, name: FROM_NAME },
          to: [{ email }],
          subject: `Welcome to FleetCore — ${ROLE_LABELS[role]} account created`,
          htmlContent: `<p>Hi ${full_name},</p><p>Your ${ROLE_LABELS[role]} account has been created.</p><p>Temporary password: <strong>${tempPassword}</strong></p><p><a href="${APP_URL}">Log in to FleetCore</a> and change your password immediately.</p>`,
        }),
      })
    }

    return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
