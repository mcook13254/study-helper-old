# StudyHelper 1.8.0

Adaptive review and safe performance improvements. Start with [UPGRADE.md](UPGRADE.md), [CHANGELOG.md](CHANGELOG.md), and [TEST-RESULTS.md](TEST-RESULTS.md). For an existing Supabase deployment, run the additive migration-v1.8.0.sql before deploying.

The earlier project documentation follows for reference.

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


## v1.4 feature update
- Removed the unfinished AI Study Chat from the main app.
- Added private cloud textbook storage with Supabase Storage.
- Added a two-path study-set workflow: manual creation or TXT import.
- TXT import supports Question/Q, A/Answer/Choice/Option lines, Correct answers by letter/number/text, Concept/Topic, Difficulty, and Explanation. Multiple correct answers are supported with comma-separated values such as `Correct: A,B`.
- For cloud textbook storage, rerun the full `supabase-schema.sql` in Supabase SQL Editor so the `textbooks` table, private bucket, and RLS policies are created.

## v1.4.1 import fix
The TXT importer now recognizes A-F and numbered choice labels such as `A:`, `B:`, `1:`, and `A)` in addition to the existing format. Your attached questions.txt parses successfully as 80 questions.


## v1.5: Sharing, Library, Admin Dashboard
- Non-destructive database migration adds study-set visibility/sharing metadata and `study_set_shares`.
- Study sets can remain private, be shared with specific active StudyHelper accounts, or be public.
- Library browsing shows sets available through direct sharing or public visibility.
- Adding a shared set creates a private copy owned by the current user, with source attribution.
- Admin dashboard includes high-level counts from the cloud backend.
- Existing courses, study sets, questions, progress, and textbooks are not dropped or recreated.

Run the full `supabase-schema.sql` in Supabase SQL Editor before deploying. The migration only adds columns/tables and replaces read policies to permit explicitly shared/public sets.


## v1.5.1 reliability update
- Cloud sync is merge-only; it no longer deletes records merely because an older/local state omitted them.
- Existing study-set course assignments are preserved when a sync payload is missing a course id.
- Practice and game sessions use one stable timer per session and guard against duplicate/late answers.
- Library now includes all of the signed-in user's own study sets plus shared sets and library copies.

## v1.6 reliability update
- Study-set course assignments are preserved during cloud sync unless explicitly changed.
- Library is the primary home for personal study sets; Courses remains focused on course organization.
- Practice mode choices are now interactive.
- Progress tracks current streak, best streak, XP this week, questions this week, and sessions this week.
- The v1.6 Supabase migration is non-destructive and only adds progress/stat columns.


## v1.7 Friend usernames
Sharing now uses unique StudyHelper usernames rather than email addresses. Email remains private for authentication. Existing profiles are backfilled with stable usernames.


### v1.7 username sharing
Friend sharing uses unique StudyHelper usernames (3-24 letters, numbers, underscores). Email remains private to account/authentication workflows and is not used by the study-set sharing UI. Existing study sets and course assignments are preserved; this migration only adds username fields/indexes and sharing behavior.

