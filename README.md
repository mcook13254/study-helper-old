# StudyHelper v0.7

Vercel + Supabase-ready StudyHelper build.

## Local demo
Requires Node 18+. Run `npm install` then `npm run dev` and open http://localhost:3000.
If Supabase environment variables are not configured, the app automatically uses a clearly separated local demo mode so existing prototype features remain usable.

## Cloud deployment
1. Create a Supabase project.
2. Run `supabase-schema.sql` in the Supabase SQL Editor.
3. Deploy this repository to Vercel.
4. Add Vercel environment variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. The service-role key is used only by the `/api/admin-create-user` serverless function and must never be exposed to the browser.
5. Create your first account in StudyHelper, then run the bootstrap UPDATE in `supabase-schema.sql` to promote it to admin. Sign out and sign back in.

Admin account creation goes through the serverless endpoint and requires an authenticated admin session. Student accounts cannot access the Admin tab.

## Account workflow update
- Cloud users cannot self-create accounts from the login page.
- Visitors can submit an access request without setting a password.
- Administrators review pending requests in Admin -> Access requests.
- Approving a request sends a Supabase invitation email and creates an active student profile.
- Direct account creation remains administrator-only.
- Login UI is a full-screen gate; dashboard navigation is hidden until authenticated.


## v0.7 account gate and approval workflow
- Unauthenticated visitors see only the full-screen login/request-access experience.
- Public self-signup is disabled.
- Visitors can submit a pending access request without creating a password.
- Admins can approve requests, which invites the user by email as a student.
- Admins can also create accounts directly.
- Logout is available from the header.
- Student accounts cannot change their own role or status through the client database API.

## v0.8 authentication setup

For the real cloud mode, set these Vercel environment variables:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only; never expose it to the browser)
- `STUDYHELPER_SETUP_KEY` (a strong one-time setup secret)

On a brand-new Supabase project with zero users, StudyHelper shows **Create first administrator** on the login screen. Enter the Vercel `STUDYHELPER_SETUP_KEY` to create the first admin account. After that, the setup endpoint refuses to create another first admin.

Logging out now signs out of Supabase, clears the in-memory authenticated user, closes open modals, and returns to an auth-only screen. The dashboard shell remains hidden while logged out.


## v0.8 first-admin and logout

Cloud setup uses these Vercel environment variables:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- `STUDYHELPER_SETUP_KEY` (strong one-time bootstrap secret)

On a brand-new Supabase project with zero auth users, StudyHelper displays **Create first administrator**. The setup endpoint creates exactly one administrator and then refuses further bootstrap attempts.

Logout calls Supabase sign-out, clears session storage/in-memory authentication state, closes open modals, and returns to an auth-only page. The dashboard shell and navigation are hidden while logged out.


## Current Supabase key names
The deployment accepts SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY, with backward compatibility for SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.
