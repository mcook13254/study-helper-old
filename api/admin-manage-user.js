const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anonKey || !serviceKey) return res.status(503).json({ error: 'Supabase is not configured on the server.' });
    if (!token) return res.status(401).json({ error: 'Missing access token.' });

    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await client.auth.getUser(token);
    if (authError || !authData.user) return res.status(401).json({ error: 'Invalid session.' });

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: me, error: meError } = await admin.from('profiles').select('role,status').eq('id', authData.user.id).single();
    if (meError || me?.role !== 'admin' || me?.status !== 'active') return res.status(403).json({ error: 'Administrator access required.' });

    const { userId, action, role, status } = req.body || {};
    if (!userId || !['role', 'status', 'delete'].includes(action)) return res.status(400).json({ error: 'Invalid user action.' });
    if (userId === authData.user.id) return res.status(400).json({ error: 'You cannot modify or delete your own administrator account here.' });

    if (action === 'delete') {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    const patch = action === 'role' ? { role } : { status };
    if (action === 'role' && !['student', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
    if (action === 'status' && !['active', 'disabled'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    const { data, error } = await admin.from('profiles').update(patch).eq('id', userId).select('id,name,email,role,status,created_at').single();
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ user: data });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unexpected server error.' });
  }
};
