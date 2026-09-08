const { createClient } = require('@supabase/supabase-js');

const FREE_STORAGE_BYTES = 1024 * 1024 * 1024;

async function getUser(req, url, anonKey) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  if (!token) return { error: 'Missing access token.', status: 401 };
  const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return { error: 'Invalid session.', status: 401 };
  return { user: data.user };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
    const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anonKey || !secretKey) return res.status(503).json({ error: 'Supabase is not configured on the server.' });

    const authResult = await getUser(req, url, anonKey);
    if (authResult.error) return res.status(authResult.status).json({ error: authResult.error });

    const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: profileError } = await admin.from('profiles').select('role,status').eq('id', authResult.user.id).single();
    if (profileError || profile?.role !== 'admin' || profile?.status !== 'active') {
      return res.status(403).json({ error: 'Administrator access required.' });
    }

    const files = [];
    let offset = 0;
    const limit = 100;
    while (true) {
      const { data, error } = await admin.storage.from('textbooks').list('', {
        limit,
        offset,
        sortBy: { column: 'created_at', order: 'desc' }
      });
      if (error) throw error;
      const batch = (data || []).filter(item => item.name);
      files.push(...batch);
      if (!data || data.length < limit) break;
      offset += limit;
    }

    // The bucket stores files under user-id folders. Supabase Storage's list() returns
    // folders as entries too, so only count entries carrying a byte-size value.
    const actualFiles = files.filter(file => file.metadata?.size != null || file.size != null);
    const totalBytes = actualFiles.reduce((sum, file) => sum + Number(file.metadata?.size ?? file.size ?? 0), 0);
    const largest = actualFiles
      .map(file => ({ name: file.name, bytes: Number(file.metadata?.size ?? file.size ?? 0), createdAt: file.created_at || null }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 10);

    return res.status(200).json({
      bucket: 'textbooks',
      freePlanBytes: FREE_STORAGE_BYTES,
      usedBytes: totalBytes,
      fileCount: actualFiles.length,
      largestFiles: largest
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Could not load textbook storage.' });
  }
};
