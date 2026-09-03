const { createClient } = require('@supabase/supabase-js');

async function adminContext(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return { error: 'Supabase is not configured on the server.', status: 503 };
  if (!token) return { error: 'Missing access token.', status: 401 };
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData.user) return { error: 'Invalid session.', status: 401 };
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: me, error: meError } = await admin.from('profiles').select('role,status').eq('id', authData.user.id).single();
  if (meError || me?.role !== 'admin' || me?.status !== 'active') return { error: 'Administrator access required.', status: 403 };
  return { admin, authData };
}

module.exports = async function handler(req, res) {
  const ctx = await adminContext(req);
  if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
  const { admin } = ctx;
  try {
    if (req.method === 'GET') {
      const { data, error } = await admin.from('access_requests').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ requests: data || [] });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { requestId, action } = req.body || {};
    if (!requestId || !['approve', 'deny'].includes(action)) return res.status(400).json({ error: 'Invalid request action.' });
    const { data: request, error: requestError } = await admin.from('access_requests').select('*').eq('id', requestId).single();
    if (requestError || !request) return res.status(404).json({ error: 'Access request not found.' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'This request has already been reviewed.' });

    if (action === 'deny') {
      const { data, error } = await admin.from('access_requests').update({ status: 'denied', reviewed_at: new Date().toISOString() }).eq('id', requestId).select('*').single();
      if (error) throw error;
      return res.status(200).json({ request: data });
    }

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(request.email, { data: { name: request.name } });
    if (inviteError) return res.status(400).json({ error: inviteError.message });
    const userId = invited.user.id;
    const { data: profile, error: profileError } = await admin.from('profiles').upsert({ id: userId, name: request.name, email: request.email, role: 'student', status: 'active', major: request.major || '' }).select('id,name,email,role,status,created_at').single();
    if (profileError) throw profileError;
    const { data: updated, error: updateError } = await admin.from('access_requests').update({ status: 'approved', reviewed_at: new Date().toISOString(), approved_user_id: userId }).eq('id', requestId).select('*').single();
    if (updateError) throw updateError;
    return res.status(200).json({ request: updated, user: { ...profile, created: profile.created_at || '' } });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unexpected error.' });
  }
};
