module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    configured: Boolean(process.env.GROQ_API_KEY),
    provider: 'qwen-via-groq',
    model: process.env.GROQ_MODEL || 'qwen/qwen3.6-27b',
    paidFallback: false,
    freeOnly: true
  });
};
