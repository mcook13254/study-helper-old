const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anonKey || !serviceKey) return res.status(503).json({ error: "Supabase is not configured on the server." });
    if (!token) return res.status(401).json({ error: "Missing access token." });

    const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return res.status(401).json({ error: "Invalid session." });

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: profileError } = await admin.from("profiles").select("role,status").eq("id", authData.user.id).single();
    if (profileError || profile?.role !== "admin" || profile?.status !== "active") return res.status(403).json({ error: "Administrator access required." });

    const { name, email, password, role = "student" } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: "Name, email, and password are required." });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
    if (!['student', 'admin'].includes(role)) return res.status(400).json({ error: "Invalid role." });

    const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
    if (createError) return res.status(400).json({ error: createError.message });
    const { error: insertError } = await admin.from("profiles").upsert({ id: created.user.id, name, email, role, status: "active" });
    if (insertError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return res.status(500).json({ error: insertError.message });
    }
    res.status(200).json({ user: { id: created.user.id, name, email, role, status: "active" } });
  } catch (error) {
    res.status(500).json({ error: error.message || "Unexpected server error." });
  }
};
