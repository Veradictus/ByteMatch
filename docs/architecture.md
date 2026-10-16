# Architecture

## Processes

| Process    | Code                                    | Does                                                                                                  |
| ---------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Web        | Next.js 16 app router, `src/app`        | Pages, JSON API, badges, upload API, GitHub webhook endpoint, sign-in                                 |
| Worker     | `src/worker`, bundled to `dist/main.js` | Runs background jobs: ingesting artifacts, polling, backfill, decomp.dev import, PR comments, pruning |
| PostgreSQL |                                         | All data, and the job queue                                                                           |

Both web and worker are stateless, so any number of each can run. They communicate only through
the database: the web process enqueues jobs (for example on a webhook or a "Poll now" click) and
workers claim them.

The job queue is [pg-boss](https://github.com/timgit/pg-boss), stored in the `pgboss` schema of the
same database. There is no Redis.

## Code layout

| Directory    | Contents                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| `src/app`    | Pages and routes                                                                                           |
| `src/report` | objdiff report parsing, measures, diffs; vendored `report.proto` and `changes.proto` in `src/report/proto` |
| `src/badge`  | SVG and PNG badges                                                                                         |
| `src/db`     | Schema, store, migrations                                                                                  |
| `src/github` | GitHub App, artifacts, comments                                                                            |
| `src/ingest` | Ingest pipelines                                                                                           |
| `src/worker` | Job handlers                                                                                               |
| `src/lib`    | Configuration, queue, crypto                                                                               |

## Data model

Defined in `src/db/schema.ts`; migrations live in `drizzle/`.

| Table              | Holds                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `projects`         | One row per repository: owner, repo, GitHub repository id (survives renames), display settings, default version / category / branch, artifact pattern, workflow restriction, split versions, PR comments flag, enabled flag, GitHub App installation id, last poll time and last ingest error. Its game, franchise and year, and per-version games (`version_games`) for versions that are a different game. |
| `reports`          | One version's progress at one commit: version, commit SHA, message and timestamp, source (`artifact`, `upload` or `import`), workflow run id, the 16 measures and per-category measures (JSON). Unique per project, version and commit. Optionally points to a blob.                                                                                                                                         |
| `report_blobs`     | Full reports, stored as gzip-compressed objdiff protobuf, deduplicated by SHA-256: commits with identical reports share one blob.                                                                                                                                                                                                                                                                            |
| `functional_lists` | Projects' functional C lists (function name → confidence), once per distinct list. Each report row keeps what its list adds up to in `functional` (never part of `measures`) and points here.                                                                                                                                                                                                                |
| `users`            | GitHub users who have signed in.                                                                                                                                                                                                                                                                                                                                                                             |
| `sessions`         | Signed-in browsers. The id is the SHA-256 of the cookie value; the user's GitHub token is encrypted with `SECRET_KEY`.                                                                                                                                                                                                                                                                                       |
| `api_tokens`       | Per-project upload tokens. Only a hash and a short prefix are stored.                                                                                                                                                                                                                                                                                                                                        |
| `pr_comments`      | The progress comment on each pull request, so later runs edit it instead of posting another.                                                                                                                                                                                                                                                                                                                 |
| `name_aliases`     | Game and franchise names an admin merged into another name (for spellings too different to group on their own). Grouping follows them, and a merged name's old page redirects.                                                                                                                                                                                                                               |
| `traffic_*`        | Page views per day and path, arrivals per day from other sites, and visitors per day: today's as day-salted hashes (`traffic_visitors`), rolled up nightly into counts (`traffic_days`). No cookies or addresses.                                                                                                                                                                                            |
| `ingest_problems`  | CI runs whose report artifact couldn't be used (no report in it, empty, too big, unreadable), with the files found. Polls skip these runs; the manage page explains them and can clear them to try again.                                                                                                                                                                                                    |
| `shared_themes`    | Custom themes shared by code (`brave-otter-12`): name, colours and style, a content hash so identical themes share a code, a salted hash of the sharer's address for the hourly limit, when it was last used (unused codes are pruned) and whether a moderator removed it.                                                                                                                                   |

Measures are kept forever. Full reports (units and functions) may be dropped after
`REPORT_RETENTION_DAYS`, except each version's latest; history imported from decomp.dev has
measures but no blob.

## Ingest flow

### CI artifacts

1. A workflow run completes. With the GitHub App installed, GitHub sends a `workflow_run` webhook to
   `/api/github/webhook`; the web process verifies its signature and enqueues `ingest-run`.
   Without the App, the `poll-all` schedule enqueues `poll-project` for each enabled project every
   `POLL_INTERVAL_MINUTES`, and `poll-project` ingests the new successful runs on the default
   branch itself (oldest first), as `backfill` does over a longer stretch of runs.
2. `ingest-run` lists the run's artifacts, keeps those matching the project's artifact pattern
   (and workflow restriction), and downloads them with an installation token or `GITHUB_TOKEN`.
3. Each artifact is unzipped (up to `MAX_REPORT_BYTES`) and the report parsed. JSON and protobuf
   reports are accepted, and older objdiff report formats are migrated to the current one.
   An artifact that holds no usable report is a problem with that run, not a failure of the job:
   the run is recorded in `ingest_problems` and skipped from then on (a finished run's artifacts
   never change), and the poll carries on with the other runs. If it's the newest run, the project's
   `last_error` says so, and its maintainers see an explanation with steps to fix it on the manage
   page and the project page (`src/lib/problems.ts`); the public see a one-line summary.
4. With split versions, the report is split into one report per top-level `version` category.
5. Measures and category measures go into `reports`; the full report is encoded as protobuf,
   gzipped, and stored in `report_blobs` unless a blob with the same SHA-256 exists.

### Pull requests

For a workflow run triggered by a pull request, the webhook enqueues `pr-comment` instead (when the
project has PR comments on). The job reads the PR run's report, compares it with the latest report
for the same version on the base branch, and creates or updates the PR's comment, recorded in
`pr_comments`.

### Upload API

`POST /api/v1/projects/{owner}/{repo}/reports` checks the bearer token against `api_tokens`, then
runs steps 3 to 5 directly in the web process.

### decomp.dev import and backfill

`import-decompdev` fetches `<DECOMP_DEV_URL>/<owner>/<repo>.json?mode=history` and the latest full
report, and stores them with source `import`. `backfill` walks older workflow runs whose artifacts
have not expired and enqueues them for ingestion.

## Jobs

| Job                | Data              | Does                                                       |
| ------------------ | ----------------- | ---------------------------------------------------------- |
| `ingest-run`       | project, run id   | Read one workflow run's report artifacts.                  |
| `poll-project`     | project           | Look for new successful runs on the default branch.        |
| `poll-all`         |                   | Scheduled: queue `poll-project` for every enabled project. |
| `backfill`         | project, max runs | Walk older runs whose artifacts have not expired.          |
| `import-decompdev` | project           | Copy history and the latest report from decomp.dev.        |
| `pr-comment`       | project, run id   | Comment on a pull request with its progress.               |
| `prune`            |                   | Scheduled: drop full reports past `REPORT_RETENTION_DAYS`. |

Queued jobs with the same key collapse into one, so a burst of webhooks for the same run is
processed once. Failed jobs retry up to three times with backoff. The admin panel's Jobs page groups
identical failures (same job, project and error) into one row with a count, so a project that fails
every poll shows once.

## Caching

- Full reports are stored once per distinct content (SHA-256), so commits that do not change
  progress add only a `reports` row.
- Pages, JSON and badges for the latest commit read from `reports`, which holds the measures
  directly; only `mode=report`, unit and function lists, and PR comparisons need to decompress a
  blob.
- Badge text is measured with the bundled DejaVu Sans fonts (`src/assets/fonts`), which the PNG
  renderer also uses, so SVG and PNG badges match and need no external service.
- HTTP caching: badges send `Cache-Control: public, max-age=60, s-maxage=60,
stale-while-revalidate=600` (GitHub's image proxy honours it), project JSON `public, max-age=60`,
  and error responses `no-store`. A CDN in front can serve badges without reaching the server.
