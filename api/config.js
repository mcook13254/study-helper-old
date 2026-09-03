module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const url = process.env.SUPABASE_URL || "";
  const anonKey = process.env.SUPABASE_ANON_KEY || "";
  res.status(200).json({ configured: Boolean(url && anonKey), url, anonKey });
};
