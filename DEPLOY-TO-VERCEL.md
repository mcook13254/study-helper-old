# Deploy StudyHelper 1.8.1 on Vercel Hobby

This release has **one** Vercel function: `api/router.js`. The ten existing endpoint implementations live in `server/handlers/` and are bundled as dependencies of that function. Existing API addresses and authentication checks are preserved.

## Existing project

1. Export a backup in the currently deployed app.
2. Extract this release into its own folder. Use its contents as the deployment project. Do not upload the whole parent StudyHelper workspace, which also contains older source projects.
3. If updating your existing Git repository, replace its old `api` folder with this release's `api` folder. It should contain **only `router.js`**. Also copy `server/handlers/`, `vercel.json`, `.vercelignore`, and the remaining release files. The old endpoint implementations now belong in `server/handlers/`; keeping old copies under `api` adds unnecessary functions.
4. In Vercel, set **Root Directory** to the directory containing this release's `package.json`, `vercel.json`, `index.html`, and `api` folder. If those files are at the repository root, leave Root Directory at its default. If you uploaded the outer `studyhelper-v1.8.1` folder into the repository, select that folder.
5. Use **Other** as the framework preset. Clear any old custom Build Command and Output Directory overrides; this app uses static frontend files and one Node function. Keep your existing environment variables and domain.
6. Deploy, then check the deployment's function list. This release should produce one backend function. If it still reports over 12, confirm the deployment used the new commit and correct root folder, and check for extra API files in that root.

## Database

No additional database migration is introduced by 1.8.1. If upgrading from 1.7.x, first run `migration-v1.8.0.sql` as described in UPGRADE.md. If that migration was already applied for 1.8.0, do not change the database again.

## Verification

Twenty automated tests pass, including checks for the single API entry point, all ten endpoint mappings, preserved request bodies and authorization headers, sharing query parameters, and rejection of unknown endpoints. Handler implementations are unchanged from 1.8.0.

A live Vercel deployment was not run from this workspace, and the original function-limit failure cannot be conclusively attributed without its deployment settings/build output. The package removes the need for ten separately deployed functions and supplies an explicit routing configuration.
