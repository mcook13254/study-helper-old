# Upgrade to StudyHelper 1.8.0

1. In the currently deployed app, export a JSON backup from Settings. Keep the existing deployment and textbook files available for rollback.
2. For an existing Supabase project, run **only `migration-v1.8.0.sql`** in its SQL Editor before deploying the new application. It adds one JSONB column and is safe to rerun. It does not modify existing progress values or records. A new Supabase project can use the complete `supabase-schema.sql` instead.
3. Deploy this folder as the Vercel project root using your existing Supabase environment variables and setup key. Keep the same public app origin and sign in with the same account so browser-local storage remains accessible.
4. Check a course, a saved set, untimed practice, each game, and cloud textbook access. Confirm that XP and saved material are present. Export another backup after studying to capture the new review history.

No automatic progress reset or database replacement is required. New scoped mastery starts from the old global concept values, while future answers remain separate for each set/course.

## Run locally

With Node.js 18 or newer installed:

```sh
npm install
npm test
npm start
```

Open http://localhost:3000 and choose Local demo. The included `server.js` serves static files for demo use; it does not run Vercel serverless endpoints. Cloud functionality requires deployment to the existing Vercel/Supabase setup. Tests themselves need no downloaded packages and can also run directly with `node --test tests/*.test.js`.

## Rollback

Redeploy the previous application files. Leave the additive `adaptive` column in place; removing it is unnecessary. Keep the same browser origin and user account. An older client can continue reading its legacy progress fields, although it cannot use or update the new review schedule. Keep the pre-upgrade JSON backup; do not import it over newer work unless intentionally restoring that earlier snapshot. Textbook PDF contents are not included in JSON backups.
