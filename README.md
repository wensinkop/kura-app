# Smara 🐢

Personal finance app — track **income, expenses and transfers** across multiple
accounts and currencies. Web + Android (installable PWA). Name from *kura-kura*
(Indonesian for turtle): steady, patient, protected wealth-building.

Built with Claude Code across chunked sessions. The living spec is in
`../specs/kura-app-master-specs.docx`; session summaries are in
`../session-summaries/`.

## Stack

- **React 19** + **Vite 8**
- **React Router 7**
- **Tailwind CSS 4** (via `@tailwindcss/vite`)
- **Supabase** (auth + Postgres) — project ref `sxknuilzilwmkwltporg` (region ap-southeast-1)
- Deployed on **Netlify** (branch/preview deploys for remote staging)

## Local setup

```bash
npm install
cp .env.example .env   # then fill in the Supabase URL + publishable key
npm run dev            # http://localhost:5173
```

`npm run lint` and `npm run build` should both pass clean.

## Environment variables

| Var | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable (or legacy anon) key |

`.env` is gitignored. On Netlify, set these in **Site settings → Environment variables**.

## Project layout

```
src/
  App.jsx              Routing + auth guards + providers
  AuthContext.jsx      Supabase session + profile
  ThemeContext.jsx     Light/dark (localStorage + DB), toggled in Settings only
  supabaseClient.js    Supabase client (reads VITE_ env vars)
  components/
    AppShell.jsx       Responsive shell: desktop sidebar / mobile bottom-nav + FAB
    AuthLayout.jsx     Shared auth-screen card + field styles
    Placeholder.jsx    Styled empty-state for not-yet-built screens
    NumberInput.jsx        ┐ ported from the Gelato app, reskinned to Smara tokens
    AutocompleteInput.jsx  │  (locale-aware money input, typeahead, combobox,
    SearchableSelect.jsx   │   native date) — power the Chunk 2 entry screen
    DatePicker.jsx         ┘
  lib/icons.jsx        Shared SVG icons (from the locked mockup)
  pages/               SignUp/SignIn/Forgot*/Reset, Home/Stats/Accounts/Settings, NewTransaction
design/                Static HTML design mockups — kura-v5.html is the LOCKED reference
public/                manifest.webmanifest, sw.js, icons/, favicon.svg
```

## Design

The locked visual reference is `design/kura-v5.html` (Emerald palette, neutral
near-black dark mode, Inter, card-per-day list, register-style desktop entry).
Tokens live in `src/index.css` as CSS variables (light = `:root`, dark = `.dark`),
exposed to Tailwind as semantic utilities (`bg-surface`, `text-muted`, `text-primary`…).

## Status

**Chunk 0 (Foundations)** complete: infra, auth (email-OTP signup, sign-in,
password reset, find-email), design system, responsive PWA shell, ported inputs.
See `../session-summaries/` for the roadmap (Chunks 1–7).
