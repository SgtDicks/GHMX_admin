# GHMX Convention Portal (GitHub Pages)

Static website for GHMX staff, vendors, judges, and volunteers. It runs without a backend, so it works on GitHub Pages.

The portal now supports an optional Supabase-backed data layer for live users and judge submissions. If the Supabase SQL setup has not been applied yet, the app automatically falls back to the existing local JSON plus browser storage flow.

## Features

- Role-based login from `data/users.json` or Supabase RPCs
- User account manager:
  - `Super admin` can manage all companies and all users
  - `admin` can manage users in their own company
  - `owner` can add users for their own company only
- Optional Supabase-backed user storage with hashed passwords
- Optional Supabase-backed judge score storage
- Judge desk form with a recent-results area
- Judge desk form that posts to Google Sheets via Apps Script endpoint
- Volunteer intake section that opens or embeds a Google Form
- Dedicated `Venue Map` and `Bump-in Map` pages

## File Layout

- `index.html` - app shell and sections
- `styles.css` - UI styling
- `app.js` - login, role checks, forms, user management
- `data/users.json` - seed users and role flags
- `data/site-config.json` - event text, Google URLs, map URLs
- `docs/google-apps-script.gs` - Apps Script sample for judge submissions
- `docs/supabase-schema.sql` - Supabase tables, RPC functions, and seed users

## Deploy to GitHub Pages

1. Create a GitHub repository and push these files.
2. In GitHub: `Settings -> Pages`.
3. Set source to `Deploy from branch`, then choose `main` and root (`/`).
4. Save and open the Pages URL.

## Configure Google Integrations

### Volunteer Form (Google Forms -> Google Sheets)

1. Create a Google Form for volunteer intake.
2. Link the form responses to a Google Sheet in Google Forms.
3. Update `data/site-config.json`:
   - `google.volunteerFormUrl`
   - `google.volunteerEmbedUrl` (optional)

### Judge Desk (Frontend -> Apps Script -> Google Sheets)

1. Open Google Sheets and create a sheet for judge data.
2. In Google Apps Script, paste `docs/google-apps-script.gs`.
3. Set `SPREADSHEET_ID` in that script.
4. Deploy as Web App:
   - Execute as: Me
   - Who has access: Anyone
5. Copy Web App URL and set `google.judgeAppsScriptUrl` in `data/site-config.json`.
6. Optional: set `google.judgeFallbackFormUrl` as a backup Google Form.

### Maps

1. Add venue and bump-in map URLs (image, PDF, or web page) in `data/site-config.json`:
2. `maps.venueMapUrl`
3. `maps.bumpInMapUrl`

## Configure Supabase

The frontend is already configured for this project:

- `supabase.url`: `https://dzelezydmrxzpjznjymx.supabase.co`
- `supabase.publishableKey`: set in `data/site-config.json`

To turn on the live Supabase mode:

1. Open the Supabase project SQL editor.
2. Run [`docs/supabase-schema.sql`](./docs/supabase-schema.sql).
3. Reload the app.
4. Confirm the header badge changes from local fallback to `Storage: Supabase live.`

What the SQL file does:

- Creates `portal_users` with bcrypt-style password hashes via `pgcrypto`
- Creates `judge_scores` for judge desk submissions
- Exposes RPC functions the static frontend can call with the publishable key
- Seeds the initial GHMX demo users from `data/users.json`

When Supabase is live:

- Login uses the `portal_login` RPC instead of reading raw passwords from `data/users.json`
- User management reads and writes through RPC functions
- Judge score submissions are inserted into `judge_scores`
- Judge results can be listed back into the portal via RPC
- User exports omit passwords because hashes cannot be reversed

If the SQL file has not been applied yet, the app keeps working in local fallback mode and shows that state in the header.

## User Data Notes

- `data/users.json` fields:
  - `Username`, `password`, `company`
  - `Volunteer`, `owner`, `Judge`, `admin`, `Super admin`
- Enabled role fields must be `"1"`. Disabled roles should be `""`.
- In local fallback mode, runtime account edits are stored in browser `localStorage`.

## Security Warning

Local fallback mode is still a static-site login pattern and is not secure for production auth. Passwords are visible to anyone with repo or browser access.

The Supabase mode is safer because passwords are hashed in the database and the frontend talks to RPC functions instead of selecting user rows directly, but it is still a custom password flow running from a public client. For a production internet-facing deployment, move the sign-in flow to Supabase Auth or an API/Edge Function layer with stronger session handling.
