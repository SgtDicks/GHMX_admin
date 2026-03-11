# GHMX Convention Portal (GitHub Pages)

Static website for GHMX staff, vendors, judges, and volunteers. It runs without a backend, so it works on GitHub Pages.

## Features

- Role-based login from `data/users.json`
- User account manager:
  - `Super admin` can manage all companies and all users
  - `admin` can manage users in their own company
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

## User Data Notes

- `data/users.json` fields:
  - `Username`, `password`, `company`
  - `Volunteer`, `owner`, `Judge`, `admin`, `Super admin`
- Enabled role fields must be `"1"`. Disabled roles should be `""`.
- Runtime account edits are stored in browser `localStorage` (because GitHub Pages has no server-side write support).

## Security Warning

This is a static-site login pattern and is not secure for production auth. Passwords are visible to anyone with repo or browser access. If you need production security, move auth and user storage to a proper backend (Firebase Auth, Supabase Auth, or your own API + database).
