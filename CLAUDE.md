# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

KAIZEN Proposal Program for Suntory Wellness — employees submit KAIZEN (continuous-improvement)
projects, a committee scores them on 7 criteria, admins run evaluation periods and publish results
to a leaderboard.

**Read `Spec.md` before making non-trivial changes.** It is the living decision log for this
project (business rules D1–D8, architecture decisions, deviations made during implementation, and
a dated smoke-test checklist). It is more current than anything else in the repo, including
`docs/*.md` — see below.

## `docs/*.md` describe a different, unbuilt design — do not treat as current

`docs/01-architecture.md` through `docs/04-project-structure.md` are the *original* full design
(Next.js/TypeScript, ~20 DB tables, TanStack Query, next-intl, automated translation pipeline,
Vercel deploy, pgTAP). That design was explicitly abandoned before implementation. What was
actually built is a deliberately smaller MVP — see `Spec.md` §1–2 for the full rationale. Treat
`docs/*.md` only as long-term reference for features that are currently out of scope (listed as
backlog items B1–B11 in `Spec.md` §3), never as a description of the current codebase.

## Git hygiene — what gets committed, what doesn't

**Never commit:** `js/config.js` (real Supabase URL/anon key — copy from `js/config.js.example`),
`.env`/`.env.*`, `.claude/settings.local.json` (personal permission overrides, not project config),
or anything containing a `service_role` key, password, or token. All of these are already in
`.gitignore` — don't remove those lines, and re-check file contents (not just filenames) before any
broad `git add`.

**Also gitignored, by policy rather than secrecy** (2026-09-17): stakeholder source files
(`*.xlsx`, `*.docx`), `docs/*.md`, and `apple.design.md`. `docs/*.md` is the abandoned Next.js-era
design (see above) and `apple.design.md` is an unrelated generic design-system reference — neither
is needed to run or understand the current app, so they stay local-only rather than bloating the
repo. Don't re-add these unless the user explicitly asks.

**Commit:** everything under `js/`, `css/`, `assets/`, `supabase/*.sql`, `index.html`, `CLAUDE.md`,
`Spec.md`, `.claude/settings.json` (project-scope, no secrets), `js/config.js.example`.

## Deploying (Netlify, decided 2026-09-17)

Hosted on Netlify — a plain static site (no build step for local dev, see below), but Netlify *does*
run one build step in production solely to materialize `js/config.js` (gitignored, see above) from
env vars, since there's no other way to get real secrets onto a static host without committing them.
(Originally set up on Vercel the same day, then switched: Vercel's free Hobby tier disallows
commercial use by ToS, and this is an internal company tool — Pro is $20/mo/seat. Netlify's free
tier has no such commercial-use restriction, and the setup below is otherwise identical.)

`netlify.toml` sets `build.command = "bash scripts/gen-config.sh"` (writes `js/config.js` from
`SUPABASE_URL`/`SUPABASE_ANON_KEY`/`MAX_UPLOAD_MB` env vars — see that script) and
`build.publish = "."` (serve the repo root as-is, no separate build output dir).

**One-time project setup on netlify.com:** "Add new site" → "Import an existing project" → the
`NBD-Health-Care-Company-Limited/KAIZEN-proposal-program` GitHub repo → build settings are picked
up from `netlify.toml` automatically → in Site configuration → Environment variables, set
`SUPABASE_URL` and `SUPABASE_ANON_KEY` (same values as a local `js/config.js`; `MAX_UPLOAD_MB`
optional, defaults to 20) → deploy. No routing rewrites needed — `js/router.js` is a hash router
(`#/...`), so there's nothing after `#` for the server to ever see.

## Running locally

There is no build step, bundler, package.json, or npm scripts — this is plain HTML/CSS/JS.

1. Copy `js/config.js.example` to `js/config.js` and fill in a real Supabase project's URL + anon
   key (this file is gitignored).
2. Run `supabase/schema.sql` then `supabase/seed.sql` against that Supabase project (SQL editor or
   CLI) to create the schema and demo master data.
3. Serve the repo root over HTTP — ES module imports don't work over `file://`:
   ```
   python3 -m http.server 8123
   ```
   then open `http://localhost:8123`.

**Cache-busting `index.html`'s static assets**: `css/style.css` and `js/app.js` are loaded from
`index.html` with a static `?v=YYYYMMDD` query string (unlike view modules, which `router.js`
cache-busts dynamically with `?v=${Date.now()}` on every import — see below). Editing either file
again on a day you've already bumped that string does **not** get picked up by a browser that
already cached the old URL — bump the suffix again (`?v=20260910` → `?v=20260910b`) after every
meaningful edit to `style.css`/`app.js`, not just once per day.

**Every cross-module `import` also carries a `?v=...` query string** — not just `app.js`'s own
imports of `api.js`/`router.js`/`i18n.js`/`ui.js`, but *every* `js/views/*.js` file's imports of
`../api.js`/`../ui.js`/`../i18n.js`/`../router.js`/`../constants.js`/`../config.js`, and `ui.js`'s
own import of `constants.js` and `api.js`'s import of `config.js`. This wasn't the case originally
— view files imported these unversioned, which meant `router.js`'s per-view `?v=${Date.now()}`
busting kept the *view* module itself always fresh, but a stale already-cached copy of e.g. `api.js`
could still get reused underneath it. That surfaced as a real bug on 2026-09-11: a browser had
`api.js` cached from before `getQuarterlyAwards` was added to it, so a freshly-fetched `dashboard.js`
failed at import time with `SyntaxError: Importing binding name 'getQuarterlyAwards' is not found`
even though `dashboard.js` itself loaded fine. All of these shared-module imports now use one
common version tag (currently `20260911`) — bump it **everywhere it appears** (a project-wide
find/replace, not per-file) whenever you edit `api.js`, `ui.js`, `i18n.js`, `router.js`,
`constants.js`, or `config.js`, the same way `index.html`'s `style.css`/`app.js` tags get bumped.

No lint config and no automated test suite exist. Correctness is verified with the manual
smoke-test checklist in `Spec.md` §3.1 (full flow: login → submit → score → close/publish period →
leaderboard, plus RLS isolation and anon-block checks against the live Supabase project).

## Architecture

**No frontend framework, no bundler.** Vanilla ES modules loaded directly via
`<script type="module" src="js/app.js">`. Supabase (Postgres + Auth + Storage) is the only backend
— the browser talks to it directly with the anon key; there is no custom server. `js/app.js`
bootstraps the session, wires `onAuthStateChange`, and mounts the router.

**Routing (`js/router.js`):** a hand-written hash router. Routes are declared in the `ROUTES`
array (pattern, view module path, required roles, `public` flag). On every hash change it matches
the route, checks the session against `route.roles`, and dynamically imports the matching view
from `js/views/`. The view import is cache-busted with `?v=${Date.now()}` — without this, editing
a view file during development silently keeps serving the old module because the browser caches
dynamic imports per exact URL. One view module = one exported `async function render(container,
params, session)`.

**Data contract (`js/api.js`):** the DB is `snake_case`, everything in view code is `PascalCase`.
`dbToUI()`/`uiToDB()` convert recursively at the `api.js` boundary — view files must never read or
write snake_case fields directly, and DB calls must never go through anything but `api.js`. A few
keys (`Items`, `CommitteeWeights`, `Extra`) are jsonb "maps" whose *inner* keys are not field names
(e.g. `Items` maps criterion code → score) and are listed in `PASSTHROUGH_KEYS` so the recursive
converter skips them.

**Schema (`supabase/schema.sql`), 8 tables:** `profiles`, `master_data` (departments/plants/
committee roles/budget bands/cost-saving bands, discriminated by a `type` column), `evaluation_periods`,
`kaizen_projects`, `kaizen_attachments`, `kaizen_progress_updates`, `committee_scores`, `audit_log`.
Several tables intentionally fold in what would otherwise be separate child tables as `array`/`jsonb`
columns (e.g. `kaizen_projects.categories`, `evaluation_periods.committee_weights jsonb` as
`{user_id: weight_pct}`). Scoring criteria (7 fixed criteria, 5 levels each) are **not** a DB table —
they live as constants in `js/constants.js`.

**RLS is the actual security boundary, not the UI.** Every table has row-level security enabled and
forced; role checks in view code are just UX, not the enforcement point. State transitions for both
`kaizen_projects.status` and `evaluation_periods.status` are guarded by Postgres triggers
(`guard_kaizen_transition`, `guard_period_status`) so invalid transitions fail even from the SQL
editor. Privileged operations that need to cross RLS safely go through `security definer` RPCs
called via `supabase.rpc(...)`: `open_period`, `close_period`, `publish_period`, `submit_kaizen`,
`submit_score`. Results (weighted scores, ranks) are not a stored table — `v_kaizen_results` is a
view computed live, gated by `evaluation_periods.status` (published for everyone, closed for
admins only); there is no frozen snapshot, so editing committee weights after a period closes
would change historical results (a known, accepted MVP limitation — see `Spec.md` §3 B5). Since
committee members can now own KAIZEN projects too and are blocked (UI-level only) from scoring
their own project (`Spec.md` §2.8), `v_kaizen_results` doesn't read `committee_weights` directly —
it calls `committee_weight_for_kaizen(period_id, kaizen_owner_id, committee_user_id)`, which
redirects a self-scoring-excluded owner's weight to whoever holds `committee_role = 'director'` in
that period (split evenly if more than one, silently dropped if none exist or the owner *is* the
director — see `Spec.md` §2.9 for the accepted edge cases).

**Shared UI helpers (`js/ui.js`):** `escapeHtml`, `pageHeader`, `stateCard`, `emptyState`,
`statusBadge`, `thaiDate`, `initials`, `openLightbox`/`closeLightbox`, etc. — view files should
import from here rather than redefining these locally.

**Styling (`css/style.css`):** one stylesheet, no framework, no dark mode (deliberate). Almost all
custom interactive components (`.score-option`, `.chip`, `.dropzone`, `.field-label`-with-input,
etc.) are built on `<label>`, and there is a global `label { display: flex; flex-direction: column }`
rule for ordinary text-above-input form labels. Any new label-based component that needs a
*horizontal* layout must explicitly set `flex-direction: row`, or it will silently inherit the
column direction and stack its contents instead of laying them out side by side — this has been
the root cause of more than one layout bug in this codebase.

**Mobile chrome (`<760px`, see `Spec.md` §2.5/§4.4):** below the breakpoint, `#sidebar` is hidden
and replaced by a fixed bottom tab bar (`#mobile-tabbar`) plus a bottom-sheet drawer
(`#mobile-drawer`) for secondary/admin nav — both rendered by `js/app.js`'s `renderChrome()`, which
builds `primaryItems`/`adminItems` once and feeds both the desktop sidebar and this mobile chrome
from the same data. Desktop output is untouched by design. The tab bar is icon-only (labels are
still in the markup via `tabLink()` but visually hidden with a sr-only `clip`, so the accessible
name survives); a "+" button that navigates to `#/kaizen/new` is spliced into the middle of
`primaryItems` for roles that can create a KAIZEN project, and the last tab's icon is the user's
avatar initials rather than a hamburger glyph. `.data-table` gets a `@media (max-width:760px)` rule
that restacks each `<tr>` into a card (`display:block` on table/tbody/tr/td, `<thead>` hidden)
without touching any view's markup or JS — this is why table views (`adminUsers.js`,
`adminMaster.js`, `adminPeriods.js`, `kaizenList.js`, `leaderboard.js`) need no per-file mobile
handling for their tables.

**Recurring mobile-overflow bug class:** a flex/grid child holding user-generated text (a project
title, email, department name) that lacks `min-width: 0` will force its row wider than the
viewport at narrow widths, because flex/grid items default to `min-width: auto` (shrink-to-content),
not `0`. This has been the root cause of overflow bugs in `.section-head h2`, `.tabbar-link`,
`.hstack`, `.breadcrumb`, `.score-option`, `.def-grid dd`, `.review-summary`, and `.task-row` at
various points — when adding a new flex/grid row with unbounded text content, add `min-width: 0`
(and usually `overflow-wrap: anywhere`) on the text-holding child up front rather than waiting for
it to overflow on a real device.

**Recurring mobile-field-width bug class (see `Spec.md` §2.13 for full detail/checklist):**
inconsistent input widths within the same form, found 3 times in one day (2026-09-11) from 3
different causes — hardcoded `style="max-width:...px"` on a text input with no mobile override,
a `.field-row` (2-column grid) placed inside a container whose own `max-width` is narrow enough
that the grid never collapses to 1 column on mobile, and `input[type="date"]` rendering with
different native chrome than a text input on iOS Safari specifically (invisible in Chromium/
Chrome DevTools testing — confirm any native-form-control fix on a real iOS Safari/simulator,
never from Chromium measurements alone). Before shipping a mobile form change, grep the file for
`style="max-width:`/`style="width:"` and measure `getBoundingClientRect()` of every field to
confirm siblings match.

**i18n (`js/i18n.js`):** a plain TH/EN dictionary object with a `t(key)` lookup, no library.

**Avatars (`profiles.avatar_path`, see `Spec.md` §2.7/§4.5):** a private `avatars` storage bucket,
one file per user at a fixed path `{user_id}/avatar` (uploaded with `upsert: true`, so re-uploading
just overwrites — no orphaned files, no delete-then-upload dance). Display is progressive
enhancement: every avatar call site still renders `escapeHtml(initials(...))` as before and only
adds a `data-avatar-path` attribute when `AvatarPath` is present; `hydrateAvatars(root,
getSignedUrl)` in `js/ui.js` runs after render, swaps matching elements to an `<img>` once the
signed URL resolves, and leaves the initials in place as the fallback if that fails. `team_members`
on `kaizen_projects` is a denormalized jsonb snapshot (`{employee_id, full_name}`), not a join to
`profiles`, so team-member rows in `kaizenDetail.js`/`reviewScore.js` have no avatar to show and
intentionally keep showing initials only.
