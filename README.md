# MBA 8660 Decision Tools

Twelve framing tools, one per course week, supporting **MBA 8660: Big Data Management for Analytics**, Fall 2026, Wilbur O. and Ann Powers College of Business, Clemson University.

Instructor: Matthew J. Kolakowski, Ph.D. (mkolako@clemson.edu)
Sessions: Saturday 12:30 to 2:30 PM ET on Zoom
Term: August 19 through December 4, 2026

---

## Table of contents

- [What this is](#what-this-is)
- [The design rule](#the-design-rule)
- [What every week costs](#what-every-week-costs)
- [Terminology](#terminology)
- [Figures](#figures)
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

Every tool returns exactly four things:

| Field | Contents |
|---|---|
| `computed` | Arithmetic the student should not have to redo by hand. Every figure carries a note saying what it means and, where money is involved, which published rate produced it |
| `assumptions` | Every input, echoed back with units, attributed to the student |
| `unresolved` | The judgments the tool explicitly refuses to make |
| `visuals` | Chart specifications. Declarative data only; the tool knows nothing about pixels or colour |

**Export stays locked until every unresolved question carries a written answer.** The student does the deciding, in writing, before the PDF exists.

This rule is enforced by tests, not by good intentions. Ten invariant sweeps run against every registered tool:

1. Every tool surfaces at least two unresolved judgments.
2. No tool emits recommendation language in its computed output, **or in a chart title or caption**.
3. Every tool is deterministic for identical input.
4. No tool mutates its input object.
5. Every computed figure carries an explanatory note. A bare number fails.
6. Every input field carries help text. An unexplained input fails.
7. Every glossary key a tool references resolves to a real definition.
8. Every tool emits at least one figure, and every mark on it is directly labelled.
9. Every preset fills every field, runs to a valid result, and stays inside its field's declared bounds.
10. Every tool that uses a vendor price cites that price with its retrieval date.

A new tool that violates any of these fails the suite the moment it is registered in the catalog.

## What every week costs

Every week is denominated in dollars, at published US-region list prices. The
figures come from `server/reference/rates.js`, a dated snapshot carrying a
source URL and a retrieval date for all 22 rates, mirrored into
`data/price-reference.json` for database seeding. **A test fails if the two
drift apart.**

The tools are pure functions with no I/O, so they cannot read prices from
Postgres. Rates are declared in code, echoed into every assumption log, and
printed in the exported PDF beside the figure they produced.

> **These are list prices, which is the worst price anybody pays.** No
> negotiated, reserved, or spot discount is applied. They do not discharge the
> syllabus requirement that each student retrieve and date their own prices;
> they exist so the class has a worked example of a properly dated price record
> and so a Week 1 answer can be given in dollars rather than gibibytes.

### The rates in use

| What | Rate | Source |
|---|---|---|
| S3 Standard | $0.023 per GB-month | AWS S3 pricing |
| S3 Standard-IA / Glacier Instant / Deep Archive | $0.0125 / $0.004 / $0.00099 per GB-month | AWS S3 pricing |
| Snowflake storage | $23.00 per TB-month | Snowflake pricing |
| S3 PUT / GET requests | $0.005 / $0.0004 per 1,000 | AWS S3 pricing |
| EC2 r5.16xlarge (64 vCPU, 512 GiB) | $4.032 per node-hour | AWS EC2 on-demand |
| EC2 r5.4xlarge (16 vCPU, 128 GiB) | $1.008 per node-hour | AWS EC2 on-demand |
| Athena | $5.00 per TB scanned | AWS Athena pricing |
| BigQuery on-demand | $6.25 per TiB scanned | Google Cloud pricing |
| BigQuery Standard capacity | $0.04 per slot-hour | Google Cloud pricing |
| Snowflake credit, Standard edition | $2.00 per credit | Snowflake pricing |
| Databricks Jobs / All-Purpose | $0.15 / $0.55 per DBU | Databricks pricing |
| Egress to internet | $0.09 per GB | AWS pricing |
| Cross-AZ transfer, each direction | $0.01 per GB | AWS pricing |
| Glue Data Catalog objects / requests | $1.00 per 100,000 / per 1,000,000 | AWS Glue pricing |
| Titan Text Embeddings V2 | $0.02 per 1M tokens | AWS Bedrock pricing |
| Claude Haiku 4.5 input / output | $1.00 / $5.00 per 1M tokens | Anthropic pricing |

Blended engineering cost is held separately as `DEFAULT_BLENDED_HOURLY_USD`
($140/hour) and labelled as an organizational assumption, not a published
price, because it is not one.

### What each week prices

| Week | Compute priced | Storage priced | The point |
|---|---|---|---|
| 1 | Single node vs. cluster, per query, shuffle network | Object storage, compressed and raw | Distribution is not cheaper per GiB; shuffle is a bill one machine never pays |
| 2 | Rewrite compute for a full migration | Egress to leave the cloud | Egress, not the file format, is the real exit barrier |
| 3 | Self-hosted catalog nodes | Catalog objects and requests | The control plane is a rounding error every query depends on |
| 4 | Engine units normalized to an annual figure | Object storage added to the ceiling | A compute-only budget is not a platform budget |
| 5 | Cost per query and per active user | Storage category in the cut | Totals cannot be acted on; unit economics can |
| 6 | Build labour and vendor price | Infrastructure the build runs on | Break-even rests on the maintenance estimate |
| 7 | Control tooling and operating hours | — | Detection time is the multiplier on incident cost |
| 8 | Staffing cost of each operating model | — | Operating models are mostly a payroll decision |
| 9 | Deletion-request handling per year | — | A statutory right costs real money per exercise |
| 10 | Readiness effort against days remaining | — | Deferred is not cancelled |
| 11 | Embedding at index time, generation per answer | Vector index storage | Answering dwarfs indexing within months |
| 12 | Agent reads at the same per-TB rate a human pays | — | An unattended reader is a headcount-sized line item with no manager |

### The Week 1 result, worked

Running the Meridian Health preset (4.2B rows, 310 bytes each, 4x compression,
8 percent scanned, 22 percent growth, 14 concurrent, 900 queries/day, 12
hours/day):

```
Working set in year three                 616.5 GiB     (exceeds the 512 GiB ceiling)
Storage, compressed, per month            $7.49
Storage, uncompressed, per month          $29.95
Cost of one query                         $0.13
Query spend per year                      $42,771
Query spend per year if uncompressed      $171,083
Single-node compute per month             $1,472
Distributed compute per month             $1,840        (5 workers)
Shuffle network per year                  $136,866
Annual total, single-node path            $60,523
Annual total, distributed path            $201,804
```

Three things a student can see here and nowhere else in the course:
**storage is trivial and compute is not**; **compression is worth $128,582 a
year, and almost all of it is scan cost rather than storage**; and **the
distributed path costs 3.3x the single-node path, entirely because of
shuffle** — even though this workload no longer fits on one machine, which is
the tension the Decision Owed asks the student to resolve.

## Terminology

`server/glossary.js` defines **45 terms**, every one used anywhere in the
application. Each entry has four parts, and a test enforces all four:

| Part | What it answers |
|---|---|
| `plain` | What it means, to someone who has never seen the word |
| `precise` | What it means technically, well enough to use in a memo |
| `cost` | What it costs, with a figure |
| `trap` | How it is commonly got wrong — the part that surfaces in a Live Defense |

Each week declares the terms it needs. `resolveTerms` throws on an unknown key,
so a typo fails the test suite rather than shipping a blank definition to a
student. The terms appear above the input form, and the week's definitions are
appended to the exported PDF.

Served at `GET /api/glossary`, which **works without a database** — definitions
are version-controlled content, so a stateless deployment still has them.

Four entries carry the concepts the course turns on and are worth reading first:
`distributed-system`, `why-distribute`, `shuffle`, and `compression`.

Every week also carries an `explainer`: a plain-language paragraph on what the
week is actually about, shown above the glossary.

## Figures

Every tool emits chart specifications alongside its numbers. Tools describe
*what to draw*; they know nothing about SVG, pixels, or colour, so purity and
determinism are preserved. `src/components/VisualPanel.jsx` renders them as
inline SVG.

| Kind | Used for |
|---|---|
| `bar` | Comparing magnitudes across categories |
| `stack` | How one total divides into parts |
| `gauge` | One value against a ceiling it must respect |
| `timeline` | Dated milestones relative to an assessment date |
| `matrix` | Grant or deny, per scope |

The palette is the six leading slots of a validated categorical set, checked
against colour-vision-deficiency and normal-vision separation gates on the
adjacent pairlist. Three of the six sit below 3:1 contrast on white, so **every
mark carries a visible direct label** rather than relying on hue, and **every
figure has a table view underneath it**. A chart a student cannot read is not
evidence, and no meaning anywhere rests on colour alone.

The no-recommendation invariant extends to figures: a chart title or caption
containing recommendation language fails the suite.

## How the tools map to the syllabus

| Week | Session | Syllabus theme | Tool slug | Decision Owed |
|---|---|---|---|---|
| 1 | Aug 22 | Constraint is Not the Constraint. Cost is. | `sizing` | Does this workload need a distributed system? Priced both ways. |
| 2 | Aug 29 | Storage and Open Table Formats | `lock-in` | Recommend a table format. Name the lock-in you accept, and price the exit. |
| 3 | Sep 5 | Catalog as Control Plane | `catalog-failure` | Choose a catalog. Name the failure mode you inherit, and price the catalog. |
| 4 | Sep 12 | Compute and Engine Selection | `engine-budget` | Recommend an engine under a fixed annual budget. |
| 5 | Sep 19 | FinOps and Unit Economics | `finops-cut` | Cut 20 percent of platform spend. Report it as cost per query. |
| 6 | Sep 26 | Ingestion, Build Versus Buy, Data Contracts | `build-vs-buy` | Build or buy. Show the break-even in months. |
| 7 | Oct 3 | Data Quality, Observability, and Failure | `control-cost` | Which control would have caught this, and what does it cost? |
| 8 | Oct 10 | Governance Operating Models | `governance-model` | Centralize or federate data ownership. |
| 9 | Oct 17 | US Privacy Law as a Patchwork | `privacy-paths` | One national standard, or comply state by state. |
| 10 | Oct 24 | EU AI Act | `ai-act` | Does your roadmap change, and by how much? |
| 11 | Oct 31 | Unstructured Data, RAG, and Provenance | `rag-retention` | Write the retention, lineage, and evaluation policy. Price the corpus. |
| 12 | Nov 7 | Agents as Data Consumers | `agent-access` | How does an agent authenticate, what may it read, and what does that cost? |

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
  | Published list prices with retrieval date recorded | `engine-budget` and `build-vs-buy` reject a missing, malformed, or future retrieval date. Every tool that uses a default rate prints that rate's own retrieval date beside the figure |
  | Name one architecture you rejected | Surfaced as an unresolved question in `lock-in` and `build-vs-buy` |
  | Identify what is most likely wrong | Surfaced as an unresolved question in `sizing`, `control-cost`, and `ai-act` |

- **Live Defense**, November 19 or December 3, 200 points. Tier 3 AI policy, no assistance. The assumption logs are what the student defends.

## How a student uses it

1. Open the app and pick the current week from the dropdown.
2. Read the Decision Owed, restated from the syllabus.
3. Read **What this week is about**, and open any term that is unfamiliar. Each definition says what it means plainly, what it means precisely, what it costs, and how it is commonly got wrong.
4. Press a **case organization** button to fill the form with a realistic starting point, or enter figures directly. Numeric inputs have a slider beside the box, so an assumption can be dragged and the effect on cost watched rather than guessed at.
5. Press **Compute**. Results appear with a note under every figure explaining what it means and which published rate produced it, followed by **Figures** — the same numbers as charts, each with a table view.
6. Answer every question under **Judgments this tool refuses to make**. Each needs at least 40 characters.
7. Press **Export assumption log as PDF**. The export carries the figures, the notes, the price citations, and the week's term definitions.
8. Attach the PDF to the Canvas submission alongside the memo and the AI-Use Appendix.

Presets and sliders exist to make the arithmetic explorable, not to supply an
answer. Every figure a preset fills in is still an assumption the student is
making, and the export still attributes all of them to the student.

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
   |  GET  /api/glossary                 45 term definitions, no database needed
   |  GET  /api/rates                     published price snapshot, no database needed
   |  GET  /api/scenarios                instructor-authored case organizations
   |  GET  /api/prices                   instructor-seeded reference prices
   |  GET  /api/sources/:week            assigned sources for one week
   |  GET  /api/usage                    aggregate counters only
   v
Express (Node 22, ESM)
   |
   |  server/tools/*.js         pure functions: (input, now) -> ToolResult
   |  server/reference/rates.js dated published-price snapshot, no I/O
   |  server/glossary.js        every term, defined four ways
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
  glossary.js              45 terms: plain, precise, what it costs, how it is got wrong
  reference/rates.js       22 published list prices, each dated and sourced
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
    kit.js                 result shape, input guards, money helpers, chart builders
    catalog.js             ToolDef entries: fields, help, bounds, presets, explainers, terms
    platform.js            weeks 1 to 4
    economics.js           weeks 5 to 7
    governance.js          weeks 8 to 12
src/
  App.jsx                  root, tool picker
  useToolSession.js        session state, split into small hooks
  api.js                   fetch client, discriminated results
  components/              AssumptionForm, GlossaryPanel, ResultPanel, VisualPanel, UnresolvedPanel
test/
  tools.test.js            53 tests, no database required
  privacy.test.js          11 tests, pure guard and migration checks
  integration.test.js      11 tests, requires TEST_DATABASE_URL
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

`data/price-reference.json` now carries 22 real published prices with real
retrieval dates, generated from `server/reference/rates.js`. The `REPLACE_ME`
placeholder is gone, and a test asserts it stays gone.

**Re-verify the rates before each term.** Vendor list prices move. To update
one, edit `server/reference/rates.js`, bump `RATE_SNAPSHOT_DATE`, regenerate
the seed file, and re-run the suite:

```bash
node -e "import('./server/reference/rates.js').then(async(m)=>{const fs=await import('node:fs/promises');await fs.writeFile('data/price-reference.json',JSON.stringify(m.allRates().map(({key,...r})=>r),null,2)+'\n')})"
npm test
npm run seed
```

The sync test fails if the module and the JSON disagree, so the two cannot
drift apart silently.

Seeding is idempotent. Scenarios and sources upsert on their natural keys, and
prices are guarded on `(vendor, product, retrieved_at)`, so re-running the
seeder adds only genuinely new rows:

```
Seeded 3 scenarios, 0 new prices, 22 already current, 11 sources.
```

A price re-retrieved on a **later date** is inserted as a new row on purpose.
`price_reference` is a dated snapshot table, and the history of what a price
was on a given day is exactly the evidence the syllabus asks students to keep.

### Removing duplicate price rows

Deployments seeded more than once **before this guard existed** hold a
duplicate set of price rows. `GET /api/prices` will show each product twice.
Nothing else is affected: tool arithmetic never reads this table, so no
calculation and no student's memo is wrong because of it.

To check, and to clean up if needed:

```sql
-- How many duplicate groups are there?
SELECT count(*) FROM (
  SELECT 1 FROM price_reference
   GROUP BY vendor, product, retrieved_at HAVING count(*) > 1
) d;

-- Keep the lowest id in each group, remove the rest.
DELETE FROM price_reference a
      USING price_reference b
      WHERE a.id > b.id
        AND a.vendor = b.vendor
        AND a.product = b.product
        AND a.retrieved_at = b.retrieved_at;
```

Run it once from the Railway Postgres shell. The seeder will not re-create the
duplicates. This is deliberately a manual cleanup rather than a migration:
`server/migrate.js` is additive and idempotent by design, and the test suite
rejects `DELETE FROM` inside it.

## Testing

```bash
npm test          # 64 tests, zero external test dependencies, no database needed
npm run lint      # ESLint 9 flat config, zero warnings
npm run test:db   # 11 integration tests, requires TEST_DATABASE_URL
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

1. Write a pure function in `platform.js`, `economics.js`, or `governance.js`. Signature is `(input, now) => ToolResult`. No I/O. Return `computed`, `assumptions`, `unresolved`, `warnings`, and `visuals`.
2. Give every computed line a note via the third argument to `line()`. A bare figure fails the suite.
3. Take any price from `rate()` in `server/reference/rates.js` and cite it with `citation()`. Never hardcode a dollar figure.
4. Build charts with `barChart`, `stackChart`, `gaugeChart`, `timelineChart`, or `matrixChart` from `kit.js`. Give every point a pre-formatted `display` label.
5. Add a `ToolDef` to `server/tools/catalog.js` with field definitions (each needing `help`, and each numeric field needing `min` and `max`), an `explainer`, a `terms` array, and at least two `presets` that fill every field.
6. Define any new term in `server/glossary.js`, with all four parts.
7. Add a fixture to `VALID` in `test/tools.test.js`.

The catalog drives both the API and the entire user interface. **No new React page is required.** The invariant sweeps immediately hold the new tool to the no-recommendation rule.

To add a database column:

1. Add the DDL to `STATEMENTS` in `server/migrate.js`, additive and idempotent.
2. Add the column name to `COLUMN_ALLOWLIST` in `server/privacy-guard.js`.

If you skip step 2, the server will not start. That is the design.

## Instructor operations

**Before the term.** Seed the scenarios and assign one to each student in Week 1. **Re-verify the 22 published rates in `server/reference/rates.js` and bump `RATE_SNAPSHOT_DATE`**, following [Seeding reference data](#seeding-reference-data) — vendor list prices move, and a stale price teaches a wrong number confidently. Tell students explicitly on day one that nothing is saved and they must export before closing the tab.

**Week 1 is where the cost intuition lands.** Run the three case-organization presets live and let the class watch the shuffle line move. Caldera stays comfortably single-node; Meridian breaches the 512 GiB ceiling in year three and still costs 3.3x more distributed. That tension — the workload no longer fits on one machine, and the cluster is far more expensive — is the whole Decision Owed, and no preset resolves it for them.

**During the term.** `GET /api/usage` returns aggregate run and export counts per tool. Low export counts relative to runs mean students are computing but not answering the unresolved questions, which is worth raising in session.

**Terminology.** `GET /api/glossary` returns all 45 definitions as JSON, which is convenient for building a term sheet or a quiz. Each week's terms are also appended to that week's exported PDF, so a student's own assumption log is a study aid.

**Canvas alignment.** The syllabus sets sessions on Saturday 12:30 to 2:30 PM ET, with Week 1 on Saturday, August 22. If the Canvas modules still carry Thursday dates, update the module titles. Assignment due dates are unaffected, since memos are due Sunday and module deliverables carry fixed calendar dates.

**Between terms.** Set `is_active = FALSE` on retired scenarios rather than deleting them. Re-run `npm run seed` after editing the JSON.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Privacy guard failed. Refusing to start.` | A column exists that is not on the allowlist | Read the listed violations. Either drop the column or add it deliberately to `COLUMN_ALLOWLIST`. |
| `Startup failed: ... ECONNREFUSED` | Postgres unreachable after 8 retries | Confirm `DATABASE_URL`. Railway occasionally needs a redeploy after attaching a database. |
| Reference endpoints return `503` | No `DATABASE_URL` | Expected in stateless mode. Attach Postgres if you want scenarios and sources. `/api/glossary` and `/api/rates` work regardless. |
| `/api/prices` shows every product twice | The database was seeded more than once before the idempotency guard existed | Run the cleanup under [Removing duplicate price rows](#removing-duplicate-price-rows). Tool arithmetic is unaffected. |
| Export button stays disabled | An unresolved answer is under 40 characters | The character counter under each box shows progress. |
| `Price retrieval date must be formatted YYYY-MM-DD` | Browser date input not used | Use the date picker. The syllabus requires a dated price. |
| PDF downloads but is empty | Popup or download blocker | Allow downloads for the domain. |
| `Glossary has no entry for "..."` | A tool's `terms` array names a key that is not defined | Add the term to `server/glossary.js` with all four parts, or fix the typo. The test suite catches this before deploy. |
| `No published rate is registered under the key "..."` | A tool called `rate()` with an unknown key | Add the rate to `server/reference/rates.js`, then regenerate `data/price-reference.json`. |
| Test fails: `price drifted from the seed file` | `rates.js` was edited without regenerating the JSON | Run the regeneration command under [Seeding reference data](#seeding-reference-data). |
| A cost figure looks implausible | A list price has moved since the snapshot | Check `RATE_SNAPSHOT_DATE` and re-verify against the vendor's pricing page. |

---

Built for Clemson University MBA 8660, Fall 2026. Course materials are provided in compliance with the TEACH Act and are intended for enrolled students only.
