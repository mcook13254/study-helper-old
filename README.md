# StudyHelper v1.5

This build keeps StudyHelper's existing Vercel + Supabase architecture.

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


## v1.5 Sharing-only rebuild
Built from the stable v1.4.1 base. Adds username-based study-set sharing and Library without the later stats/groups/game changes. Existing study data is preserved; only the new sharing table is created.

Sharing uses StudyHelper usernames for discovery; email remains only for authentication/access requests. The Library contains personal sets plus received shares.


## Security hardening
- Removed the local administrator demo path.
- Logged-out users cannot enter the dashboard through a local demo session.
- Added a 15-minute inactivity timeout that signs the user out and returns to the locked login screen.
- Access requests require the cloud backend.


## v1.5.3 stats/admin update
Admin content totals now load from Supabase across the platform, and each account displays its persisted current/best streak. Study activity persists `last_study_date` non-destructively.

## v1.5.4 Admin textbook storage
Adds a server-side Admin Storage endpoint and dashboard panel reporting actual private `textbooks` bucket usage, free allowance, file count, largest files, and an 80% warning. No textbook data is changed.
