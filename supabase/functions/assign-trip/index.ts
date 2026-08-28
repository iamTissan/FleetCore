/**
 * EDGE FUNCTION: assign-trip
 * Assigns a vehicle + driver to a trip — runs with service role to bypass RLS.
 * Called by Company Admin when dispatching a trip.
 *
 * Body: { trip_id, vehicle_id, driver_id, org_id }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header.');

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !user) throw new Error('Not authenticated.');

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles').select('role, organization_id').eq('id', user.id).single();

    if (!callerProfile || callerProfile.role !== 'company_admin') {
      throw new Error('Only Company Admins can assign trips.');
    }

    const { trip_id, vehicle_id, driver_id, org_id } = await req.json();
    if (org_id !== callerProfile.organization_id) throw new Error('Organization mismatch.');

    const { error: updateErr } = await supabaseAdmin
      .from('trips')
      .update({ vehicle_id, driver_id, status: 'pending' })
      .eq('id', trip_id)
      .eq('organization_id', org_id);

    if (updateErr) throw updateErr;

    await supabaseAdmin.from('notifications').insert({
      organization_id: org_id,
      user_id: driver_id,
      title: 'New Trip Assigned',
      message: 'You have a new trip assignment. Check your dashboard.',
      type: 'trip',
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
