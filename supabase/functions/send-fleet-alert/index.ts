/**
 * EDGE FUNCTION: send-fleet-alert
 * Two jobs in one function, selected by `type` in the body:
 *  - "expiry"   : scan roadworthiness/insurance/license expiries within 14
 *                 days and email the relevant Company Admin (run on a daily
 *                 Supabase Cron trigger).
 *  - "incident" : instant email to Company Admin when a driver files an
 *                 incident/SOS report (called directly from incident insert).
 *
 * Body: { type: 'expiry' | 'incident', org_id?, incident_id? }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL     = Deno.env.get('FROM_EMAIL') || 'noreply@fleetcore.app'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!BREVO_API_KEY) return
  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender: { email: FROM_EMAIL, name: 'FleetCore' }, to: [{ email: to }], subject, htmlContent: html }),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { type, org_id, incident_id } = await req.json()

    if (type === 'expiry') {
      const cutoff = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

      const { data: vehicles } = await supabaseAdmin.from('vehicles')
        .select('plate_number, roadworthiness_expiry, insurance_expiry, organization_id')
        .or(`roadworthiness_expiry.lte.${cutoff},insurance_expiry.lte.${cutoff}`)

      const { data: drivers } = await supabaseAdmin.from('profiles')
        .select('full_name, license_expiry, organization_id')
        .eq('role', 'driver').lte('license_expiry', cutoff)

      const orgIds = [...new Set([...(vehicles || []), ...(drivers || [])].map((r: any) => r.organization_id))]

      for (const oid of orgIds) {
        const { data: admins } = await supabaseAdmin.from('profiles')
          .select('email, full_name').eq('organization_id', oid).eq('role', 'company_admin')
        const vList = (vehicles || []).filter((v: any) => v.organization_id === oid)
        const dList = (drivers || []).filter((d: any) => d.organization_id === oid)
        const html = `
          <p>Upcoming document expiries in your fleet:</p>
          <ul>
            ${vList.map((v: any) => `<li>${v.plate_number} — roadworthiness/insurance expiring soon</li>`).join('')}
            ${dList.map((d: any) => `<li>${d.full_name} — driver's license expiring soon</li>`).join('')}
          </ul>`
        for (const admin of admins || []) {
          await sendEmail(admin.email, 'FleetCore: Upcoming document expiries', html)
        }
      }
    }

    if (type === 'incident' && incident_id) {
      const { data: incident } = await supabaseAdmin.from('incidents')
        .select('incident_type, severity, details, organization_id').eq('id', incident_id).single()
      if (incident) {
        const { data: admins } = await supabaseAdmin.from('profiles')
          .select('email').eq('organization_id', incident.organization_id).eq('role', 'company_admin')
        for (const admin of admins || []) {
          await sendEmail(admin.email, `FleetCore: New ${incident.severity} severity incident reported`,
            `<p>Type: ${incident.incident_type}</p><p>${incident.details || ''}</p>`)
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
