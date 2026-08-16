# MBA 8660 Decision Tools

Twelve framing tools, one per course week, supporting **MBA 8660: Big Data Management for Analytics**, Fall 2026, Wilbur O. and Ann Powers College of Business, Clemson University.

Instructor: Matthew J. Kolakowski, Ph.D. (mkolako@clemson.edu)
Sessions: Saturday 12:30 to 2:30 PM ET on Zoom
Term: August 19 through December 4, 2026

---

## Table of contents

- [What this is](#what-this-is)
- [The design rule](#the-design-rule)
- [How the tools map to the syllabus](#how-the-tools-map-to-the-syllabus)
- [How a student uses it](#how-a-student-uses-it)
- [Privacy and FERPA posture](#privacy-and-ferpa-posture)
- [Architecture](#architecture)
- [Database schema](#database-schema)
- [Running locally](#running-locally)
- [Environment variables](#environment-variables)
- [Deploying to Railway](#deploying-to-railway)
- [Seeding reference data](#seeding-reference-data)
- [Testing](#testing)
- [Coding standards](#coding-standards)
- [Extending the application](#extending-the-application)
- [Instructor operations](#instructor-operations)
- [Troubleshooting](#troubleshooting)

---

## What this is

MBA 8660 has no textbook. It runs on specifications, statutory text, financial disclosures, incident post-mortems, and research papers. Every week ends in a **Decision Owed**, and students answer it in a one-page BLUF memo.

Several of those decisions rest on arithmetic that is tedious by hand and easy to get wrong: working set sizing, budget fit under a ceiling, build versus buy break-even, a twenty percent spend reduction across five categories, compliance path costing across nineteen states.

This application does that arithmetic. It does nothing else, and the "nothing else" is the point.

## The design rule

**A tool that outputs the recommendation destroys the course.**

The assessment design of MBA 8660 rests on the student supplying judgment a language model cannot supply on their behalf. The Live Defense is worth 200 points precisely because it tests whether the reasoning in the artifact belongs to the student. A calculator that prints "use single-node compute" hands that reasoning back to the machine and turns the defense into theater.

Every tool returns exactly three things:

| Field | Contents |
|---|---|
| `computed` | Arithmetic the student should not have to redo by hand |
| `assumptions` | Every input, echoed back with units, attributed to the student |
| `unresolved` | The judgments the tool explicitly refuses to make |

**Export stays locked until every unresolved question carries a written answer.** The student does the deciding, in writing, before the PDF exists.

This rule is enforced by tests, not by good intentions. Four invariant sweeps run against every registered tool:

1. Every tool surfaces at least two unresolved judgments.
2. No tool emits recommendation language in its computed output.
3. Every tool is deterministic for identical input.
4. No tool mutates its input object.

A new tool that violates any of these fails the suite the moment it is registered in the catalog.

## How the tools map to the syllabus

| Week | Session | Syllabus theme | Tool slug | Decision Owed |
|---|---|---|---|---|
| 1 | Aug 22 | Constraint is Not the Constraint. Cost is. | `sizing` | Does this workload need a distributed system? |
| 2 | Aug 29 | Storage and Open Table Formats | `lock-in` | Recommend a table format. Name the lock-in you accept. |
| 3 | Sep 5 | Catalog as Control Plane | `catalog-failure` | Choose a catalog. Name the failure mode you inherit. |
| 4 | Sep 12 | Compute and Engine Selection | `engine-budget` | Recommend an engine under a fixed annual budget. |
| 5 | Sep 19 | FinOps and Unit Economics | `finops-cut` | Cut 20 percent of platform spend. |
| 6 | Sep 26 | Ingestion, Build Versus Buy, Data Contracts | `build-vs-buy` | Build or buy. Show the break-even in months. |
| 7 | Oct 3 | Data Quality, Observability, and Failure | `control-cost` | Which control would have caught this, and what does it cost? |
| 8 | Oct 10 | Governance Operating Models | `governance-model` | Centralize or federate data ownership. |
| 9 | Oct 17 | US Privacy Law as a Patchwork | `privacy-paths` | One national standard, or comply state by state. |
| 10 | Oct 24 | EU AI Act | `ai-act` | Does your roadmap change, and by how much? |
| 11 | Oct 31 | Unstructured Data, RAG, and Provenance | `rag-retention` | Write the retention, lineage, and evaluation policy. |
| 12 | Nov 7 | Agents as Data Consumers | `agent-access` | How does an agent authenticate, and what may it read? |

> **Session dates above are Saturdays**, following the syllabus meeting time of Saturday 12:30 to 2:30 PM ET and a first session of Saturday, August 22. If the Canvas module titles still carry Thursday dates, they need updating. See [Instructor operations](#instructor-operations).

Weeks 13 through 15 have no tool. Week 13 is the final project workshop, and Weeks 14 and 15 are Live Defenses.

### How the tools support the graded work

- **Decision Memos**, 200 points, best 8 of 11, Weeks 1 through 11. Tier 1 AI policy. The assumption log attaches alongside the memo and the AI-Use Appendix.
- **Module 1 Deliverable**, Wednesday September 16. Consolidates Weeks 1 through 4: `sizing`, `lock-in`, `catalog-failure`, `engine-budget`.
- **Module 2 Deliverable**, Wednesday October 7. Consolidates Weeks 5 through 7: `finops-cut`, `build-vs-buy`, `control-cost`.
- **Module 3 Deliverable**, Sunday November 8. Consolidates Weeks 8 through 12: `governance-model`, `privacy-paths`, `ai-act`, `rag-retention`, `agent-access`. Week 12 carries no separate memo; its agent access decision is a required component here.
- **Final Project Artifact**, Sunday November 15, 300 points. The four binding constraints map directly onto tool behavior:

  | Syllabus constraint | Enforced by |
  |---|---|
  | Work under a stated annual budget ceiling | `engine-budget` warns when the ceiling is breached; the ceiling comes from the seeded case organization |
  | Published list prices with retrieval date recorded | `engine-budget` and `build-vs-buy` reject a missing, malformed, or future retrieval date |
  | Name one architecture you rejected | Surfaced as an unresolved question in `lock-in` and `build-vs-buy` |
  | Identify what is most likely wrong | Surfaced as an unresolved question in `sizing`, `control-cost`, and `ai-act` |

- **Live Defense**, November 19 or December 3, 200 points. Tier 3 AI policy, no assistance. The assumption logs are what the student defends.

## How a student uses it

1. Open the app and pick the current week from the dropdown.
2. Read the Decision Owed, restated from the syllabus.
3. Enter the inputs. Everything typed is an assumption, and every one is reproduced in the export attributed to the student.
4. Press **Compute**. Results, echoed assumptions, and any warnings appear.
5. Answer every question under **Judgments this tool refuses to make**. Each needs at least 40 characters.
6. Press **Export assumption log as PDF**.
7. Attach the PDF to the Canvas submission alongside the memo and the AI-Use Appendix.

Nothing is saved. Closing the tab discards the work. This is deliberate, and students should be told so on day one.

## Privacy and FERPA posture

**No student work is stored. Anywhere. Ever.**

There are no accounts, no names, no email addresses, no Clemson usernames, no IP logging, and no session identifiers. Tool inputs travel in the request body, get computed, and are discarded when the response is sent. The exported PDF is generated in memory and streamed to the browser.

The database holds three kinds of instructor-authored reference data and one aggregate counter table. That is all.

### The guard, and why it is code rather than a promise

`server/privacy-guard.js` holds an explicit allowlist of every column this application may create. At boot, the server reads the live schema from `information_schema` and **refuses to start** if it finds anything outside the allowlist, or any column name containing a forbidden fragment such as `student`, `email`, `answer`, `memo`, `submission`, `grade`, `user_id`, `session_id`, or `ip_address`.

Nobody can add a column that holds student work without editing that file, which shows up in a diff.

Verified behavior, from the integration suite:

```
ok - passes the privacy guard on the real migrated schema
ok - fails the privacy guard the moment a student column appears
ok - increments usage counters without storing anything else
ok - rejects a tool slug long enough to smuggle content
```

After a student runs a real Week 1 sizing calculation, the complete database record of that event is:

```
 tool_slug | usage_date | run_count | export_count
-----------+------------+-----------+--------------
 sizing    | 2026-08-15 |         3 |            1
```

No inputs. No answers. No identity. A counter.

### What this posture buys

The application sits outside the scope of a Clemson third-party data review, because there is nothing to review. It is not a system of record, holds no education records under FERPA, and losing the database entirely would cost only seed data you can re-run in ten seconds.

**Canvas remains the system of record for all student work.** Every graded artifact is submitted there.

## Architecture

```
Browser (React + Vite)
   |
   |  POST /api/tools/:slug/run          inputs in, results out, nothing stored
   |  POST /api/tools/:slug/export.pdf   validates written answers, streams PDF
   |  GET  /api/scenarios                instructor-authored case organizations
   |  GET  /api/prices                   instructor-seeded reference prices
   |  GET  /api/sources/:week            assigned sources for one week
   |  GET  /api/usage                    aggregate counters only
   v
Express (Node 22, ESM)
   |
   |  server/tools/*.js         pure functions: (input, now) -> ToolResult
   |  server/pdf.js             pdfmake vector rendering
   |  server/privacy-guard.js   schema allowlist enforced at boot
   v
PostgreSQL (optional)
   scenario | price_reference | source_link | tool_usage_daily
```

**The database is optional.** Without `DATABASE_URL` the application runs fully: every tool computes, every export works, and the reference endpoints return `503` with a clear message. Tool computation never touches the database.

### Directory layout

```
data/                      instructor-authored seed data, version controlled
  scenarios.json           case organizations with budget ceilings and workload profiles
  price-reference.json     reference price snapshot
  sources.json             assigned sources by week
server/
  config.js                every environment variable, declared in one place
  db.js                    pool creation, connect with bounded exponential backoff
  migrate.js               additive idempotent DDL, run on every boot
  privacy-guard.js         column allowlist, enforced against the live schema
  seed.js                  npm run seed
  assumption-log.js        pairs unresolved questions with written answers
  pdf.js                   pdfmake document definition
  index.js                 boot order: connect, migrate, guard, then listen
  repository/reference.js  read reference data, increment counters
  routes/tools.js          compute and export
  routes/reference.js      read-only reference endpoints
  tools/
    kit.js                 shared result shape and input guards
    catalog.js             ToolDef entries, drives API and UI
    platform.js            weeks 1 to 4
    economics.js           weeks 5 to 7
    governance.js          weeks 8 to 12
src/
  App.jsx                  root, tool picker
  useToolSession.js        session state, split into small hooks
  api.js                   fetch client, discriminated results
  components/              AssumptionForm, ResultPanel, UnresolvedPanel
test/
  tools.test.js            33 tests, no database required
  privacy.test.js          11 tests, pure guard and migration checks
  integration.test.js       9 tests, requires TEST_DATABASE_URL
```

## Database schema

### `scenario`

Instructor-authored case organizations. Week 1 assigns one to each student.

| Column | Type | Notes |
|---|---|---|
| `code` | TEXT PK | e.g. `MERIDIAN` |
| `name` | TEXT | |
| `sector` | TEXT | |
| `annual_budget_ceiling_usd` | NUMERIC(14,2) | The Final Artifact ceiling. Must be positive. |
| `workload_profile` | JSONB | Row counts, growth, concurrency, states in scope |
| `narrative` | TEXT | The situation description |
| `is_active` | BOOLEAN | Deactivate rather than delete between terms |

### `price_reference`

A dated snapshot of published vendor prices. **This does not replace the student's obligation** to retrieve and date their own prices. It exists so you can show the class what a properly dated price record looks like.

| Column | Type | Notes |
|---|---|---|
| `vendor`, `product`, `unit_label` | TEXT | |
| `unit_price_usd` | NUMERIC(14,6) | Non-negative |
| `retrieved_at` | DATE | The syllabus requirement, made structural |
| `source_url`, `note` | TEXT | |

### `source_link`

Assigned sources per week, matching the syllabus sourcing policy. `is_foundational` marks the exception to the 24-month currency rule.

Unique on `(week, url)`, so re-seeding updates rather than duplicates.

### `tool_usage_daily`

The only table written at runtime. Four columns, three of them counters.

| Column | Type | Notes |
|---|---|---|
| `tool_slug` | TEXT | CHECK length <= 32, so nothing can be smuggled through it |
| `usage_date` | DATE | Day granularity, not timestamp |
| `run_count` | INTEGER | |
| `export_count` | INTEGER | |

Primary key `(tool_slug, usage_date)`, incremented via `ON CONFLICT DO UPDATE`. Counter writes are fire-and-forget with a caught rejection, so a database hiccup can never break a student mid-memo.

## Running locally

```bash
npm install
npm run build     # build the client into dist/
npm start         # serve API and client on PORT, default 3000
```

Two-terminal development, with hot reload:

```bash
npm start         # terminal 1: API on 3000
npm run dev       # terminal 2: Vite on 5173, /api proxied to 3000
```

Without a database:

```bash
npm start         # logs "No DATABASE_URL. Running stateless."
```

With a local database:

```bash
export DATABASE_URL="postgresql://postgres@localhost:5432/mba8660"
npm run seed
npm start
```

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PORT` | No | `3000` | Injected by Railway |
| `DATABASE_URL` | No | empty | Injected by Railway when Postgres is attached. Absent means stateless mode. |
| `DATABASE_SSL` | No | auto | Forced true when the URL contains `proxy.rlwy.net` |
| `DB_POOL_SIZE` | No | `5` | Sized for a 30-student section |
| `COURSE_CODE` | No | `MBA 8660` | Appears in the PDF header |

## Deploying to Railway

1. Push the repository to GitHub, per the instructions provided separately.
2. In Railway: **New Project**, then **Deploy from GitHub repo**, then select the repository.
3. Add PostgreSQL: **New**, then **Database**, then **Add PostgreSQL**. Railway injects `DATABASE_URL` automatically.
4. Set `COURSE_CODE` under **Variables** if you want something other than the default.
5. Railway runs `npm run build` on deploy, then `npm start`.
6. Set the health check path to `/healthz` under **Settings**, then **Deploy**.
7. After the first successful deploy, run the seed once from the Railway shell:
   ```bash
   npm run seed
   ```
8. Generate a public domain under **Settings**, then **Networking**, and post it in Canvas.

Migrations run automatically on every boot and are additive and idempotent, so redeploys are safe.

## Seeding reference data

Edit the JSON under `data/`, commit, push, then run `npm run seed`. Scenarios and sources upsert on their natural keys, so re-running updates rather than duplicating.

Before Week 4, replace the placeholder row in `data/price-reference.json` with real published prices and real retrieval dates. Rows with vendor `REPLACE_ME` are skipped by the seeder.

## Testing

```bash
npm test          # 44 tests, zero external test dependencies, no database needed
npm run lint      # ESLint 9 flat config, zero warnings
npm run test:db   # integration tests, requires TEST_DATABASE_URL
```

Integration tests skip themselves cleanly when `TEST_DATABASE_URL` is absent:

```bash
export TEST_DATABASE_URL="postgresql://postgres@localhost:5432/mba8660_test"
npm run test:db
```

> The integration suite **drops and recreates the public schema**. Never point `TEST_DATABASE_URL` at a database you care about.

## Coding standards

The project follows the ten strict principles adapted from NASA's Power of Ten:

- ESM modules throughout, Node 22, `"type": "module"`
- `const` by default, no `var`, no `eval`, no prototype mutation
- Early returns and guard clauses; maximum nesting depth of 3, enforced by ESLint
- Functions under 50 lines, enforced by ESLint
- Pure functions for all tool logic: no I/O, no clock, no database
- Explicit JSDoc shapes on every exported function
- `async`/`await` with `try`/`catch`; no floating promises
- `node:test` with zero external test dependencies
- Additive idempotent migrations only; the test suite rejects `DROP`, `TRUNCATE`, and `DELETE FROM` in migration statements
- Finite-number guards on every numeric input, because `Number(null) === 0` corrupts calculations silently

## Extending the application

To add a tool:

1. Write a pure function in `platform.js`, `economics.js`, or `governance.js`. Signature is `(input, now) => ToolResult`. No I/O.
2. Add a `ToolDef` to `server/tools/catalog.js` with its field definitions.
3. Add a fixture to `VALID` in `test/tools.test.js`.

The catalog drives both the API and the entire user interface. **No new React page is required.** The invariant sweeps immediately hold the new tool to the no-recommendation rule.

To add a database column:

1. Add the DDL to `STATEMENTS` in `server/migrate.js`, additive and idempotent.
2. Add the column name to `COLUMN_ALLOWLIST` in `server/privacy-guard.js`.

If you skip step 2, the server will not start. That is the design.

## Instructor operations

**Before the term.** Seed the scenarios, assign one to each student in Week 1, and replace the placeholder price rows. Tell students explicitly on day one that nothing is saved and they must export before closing the tab.

**During the term.** `GET /api/usage` returns aggregate run and export counts per tool. Low export counts relative to runs mean students are computing but not answering the unresolved questions, which is worth raising in session.

**Canvas alignment.** The syllabus sets sessions on Saturday 12:30 to 2:30 PM ET, with Week 1 on Saturday, August 22. If the Canvas modules still carry Thursday dates, update the module titles. Assignment due dates are unaffected, since memos are due Sunday and module deliverables carry fixed calendar dates.

**Between terms.** Set `is_active = FALSE` on retired scenarios rather than deleting them. Re-run `npm run seed` after editing the JSON.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Privacy guard failed. Refusing to start.` | A column exists that is not on the allowlist | Read the listed violations. Either drop the column or add it deliberately to `COLUMN_ALLOWLIST`. |
| `Startup failed: ... ECONNREFUSED` | Postgres unreachable after 8 retries | Confirm `DATABASE_URL`. Railway occasionally needs a redeploy after attaching a database. |
| Reference endpoints return `503` | No `DATABASE_URL` | Expected in stateless mode. Attach Postgres if you want scenarios and sources. |
| Export button stays disabled | An unresolved answer is under 40 characters | The character counter under each box shows progress. |
| `Price retrieval date must be formatted YYYY-MM-DD` | Browser date input not used | Use the date picker. The syllabus requires a dated price. |
| PDF downloads but is empty | Popup or download blocker | Allow downloads for the domain. |

---

Built for Clemson University MBA 8660, Fall 2026. Course materials are provided in compliance with the TEACH Act and are intended for enrolled students only.
