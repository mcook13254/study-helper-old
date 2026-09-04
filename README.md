# StudyHelper v1.2 — Free Qwen AI

This build keeps StudyHelper's existing Vercel + Supabase architecture and changes the AI tutor to use **Qwen via Groq's free plan**. The application does not fall back to a paid provider.

## AI environment variables

Add this Vercel Production environment variable:
- `GROQ_API_KEY` — your Groq API key. Keep it server-side; never put it in GitHub or browser code.

Optional:
- `GROQ_MODEL` — defaults to `qwen/qwen3.6-27b`.

Groq currently publishes free-plan limits for Qwen models. If a free-plan limit is reached, StudyHelper displays the provider error and does not switch to OpenAI or any other paid service.

## Existing Supabase variables

Keep your existing:
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- `STUDYHELPER_SETUP_KEY`

## AI behavior

The AI endpoint:
- requires an authenticated StudyHelper user;
- reads selected course/study-set material from Supabase;
- sends only the selected context plus chat history to Qwen;
- never exposes the provider key to the browser;
- reports provider/rate-limit errors instead of silently charging another provider.

Textbook PDFs are still browser-local until private Supabase Storage + text extraction is added.

## v1.3 AI policy
- Provider is Qwen via Groq.
- No paid-provider fallback is implemented.
- AI settings show provider/model and paid fallback status.
- HTTP 429 responses produce a free-tier-unavailable message rather than switching providers.
