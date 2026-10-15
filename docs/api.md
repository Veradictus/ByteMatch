# API reference

All public URLs are compatible with decomp.dev's. The examples use the public instance, `bytematch.dev`;
`{owner}` and `{repo}` are the GitHub owner and repository name.

| URL                                            | Returns                             |
| ---------------------------------------------- | ----------------------------------- |
| `/{owner}/{repo}`                              | Project page (HTML)                 |
| `/{owner}/{repo}/{version}`                    | Project page for one version (HTML) |
| `/{owner}/{repo}.json`                         | Project JSON                        |
| `/{owner}/{repo}/{version}.json`               | Project JSON for one version        |
| `/{owner}/{repo}.svg`                          | SVG badge                           |
| `/{owner}/{repo}.png`                          | PNG badge                           |
| `GET /api/v1/projects`                         | List of projects                    |
| `POST /api/v1/projects/{owner}/{repo}/reports` | Upload a report                     |
| `GET /healthz`                                 | Health check                        |

## Project pages

`/{owner}/{repo}` shows the default version; `/{owner}/{repo}/{version}` shows one version. The
page shows the measures, categories, a history chart, the list of units with their functions, and
recent commits.

## Project JSON

```
GET /{owner}/{repo}.json
GET /{owner}/{repo}/{version}.json
```

Query parameters:

| Parameter  | Meaning                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------- |
| `version`  | Game version. Defaults to the project's default version.                                  |
| `category` | Report category id. Defaults to the project's default category.                           |
| `mode`     | Output format: omit for the project object, or `shield`, `history`, `report`, `measures`. |

### Default: the project object

```sh
curl https://bytematch.dev/OpenRAC/rac1-decomp.json
```

```json
{
  "id": 1,
  "owner": "OpenRAC",
  "repo": "rac1-decomp",
  "repo_url": "https://github.com/OpenRAC/rac1-decomp",
  "name": "Ratchet & Clank",
  "short_name": "RAC1",
  "platform": "ps2",
  "default_version": "SCES_509.16",
  "default_category": "all",
  "commit": {
    "sha": "3f1c...",
    "message": "Match some functions",
    "timestamp": "2026-10-01T12:34:56Z"
  },
  "measures": {
    "fuzzy_match_percent": 91.2,
    "total_code": 3710000,
    "matched_code": 3191000,
    "matched_code_percent": 86.02,
    "total_data": 1200000,
    "matched_data": 900000,
    "matched_data_percent": 75.0,
    "total_functions": 5109,
    "matched_functions": 4520,
    "matched_functions_percent": 88.47,
    "complete_code": 3000000,
    "complete_code_percent": 80.86,
    "complete_data": 850000,
    "complete_data_percent": 70.83,
    "total_units": 400,
    "complete_units": 310
  },
  "report_versions": ["SCES_509.16"],
  "report_categories": [{ "id": "game", "name": "Game", "measures": { "...": "same 16 fields" } }]
}
```

The values above are illustrative. `measures` always contains the 16 objdiff measures shown.

### `mode=shield`

A [shields.io endpoint](https://shields.io/badges/endpoint-badge) response.

```sh
curl "https://bytematch.dev/OpenRAC/rac1-decomp.json?mode=shield&label=Code&measure=matched_code_percent"
```

```json
{ "schemaVersion": 1, "label": "Code", "message": "86.02%", "color": "informational" }
```

It accepts the same `measure` and `label` parameters as [badges](#badges).

### `mode=history`

Measures for every recorded commit of the version.

```json
[
  {
    "timestamp": "2026-10-01T12:34:56Z",
    "commit_sha": "3f1c...",
    "commit_message": "Match some functions",
    "measures": { "...": "16 fields" }
  }
]
```

### `mode=report`

The full objdiff report of the latest commit, as JSON (objdiff's `report.json` format).

### `mode=measures`

Only the `measures` object.

## Badges

```
GET /{owner}/{repo}.svg
GET /{owner}/{repo}.png
```

ByteMatch renders badges itself; there is no shields.io dependency.

| Parameter    | Default                                                   | Meaning                                                                           |
| ------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `measure`    | `matched_code_percent`                                    | Which measure to show. See the table below.                                       |
| `label`      | project name, or the category name when `category` is set | Left-hand text.                                                                   |
| `color`      | `informational` (`#007ec6`)                               | Right-hand color: a shields.io name (`brightgreen`, `informational`, ...) or hex. |
| `labelColor` | `#555`                                                    | Left-hand color, same formats. `label_color` also works.                          |
| `style`      | `flat`                                                    | `flat`, `flat-square`, `plastic`, `for-the-badge`.                                |
| `category`   | project default                                           | Report category id.                                                               |
| `version`    | project default                                           | Game version.                                                                     |
| `mode`       | `shield`                                                  | Accepted for compatibility with decomp.dev badge URLs.                            |

Measures:

| `measure`                                | Shown as        |
| ---------------------------------------- | --------------- |
| `fuzzy_match_percent`                    | `91.20%`        |
| `matched_code`, `matched_code_percent`   | `86.02%`        |
| `matched_data`, `matched_data_percent`   | percentage      |
| `complete_code`, `complete_code_percent` | percentage      |
| `complete_data`, `complete_data_percent` | percentage      |
| `matched_functions_percent`              | percentage      |
| `matched_functions`                      | `4,520 / 5,109` |
| `complete_units`                         | `310 / 400`     |

Byte measures (`matched_code`, `matched_data`, `complete_code`, `complete_data`) show the
corresponding percentage, not a byte count.

Style spellings decomp.dev accepted also work: `FlatSquare`, `ForTheBadge`, and `Social` (rendered
as `flat`).

Examples:

```markdown
![Code](https://bytematch.dev/OpenRAC/rac1-decomp.svg?mode=shield&label=Code&measure=matched_code_percent)
![Functions](https://bytematch.dev/OpenRAC/rac1-decomp.svg?label=Functions&measure=matched_functions&style=for-the-badge)
![Game](https://bytematch.dev/OpenRAC/rac1-decomp.png?category=game&measure=matched_code_percent&color=brightgreen)
```

## Project list

```
GET /api/v1/projects
```

Lists the projects on the instance, each with its default version's latest measures.

Each entry has `owner`, `repo`, `name`, `short_name`, `platform`, `game`, `franchise`,
`release_year`, `url`, `icon_url`, `cover_url`,
`version` (the default version), `timestamp` (its latest commit), `gain_30d` (matched-code
percentage points gained over the last 30 days) and `measures`.

Query parameters, the same as the project list page:

| Parameter  | Meaning                                                                           |
| ---------- | --------------------------------------------------------------------------------- |
| `q`        | Search words; each must appear in the name, `owner/repo`, game or franchise.      |
| `platform` | One or more platform ids, comma-separated, e.g. `ps2,n64`.                        |
| `sort`     | `updated` (default), `progress`, `functions`, `gain`, `size`, `newest` or `name`. |
| `page`     | Page number, from 1.                                                              |
| `per_page` | Results per page: default 100, at most 500.                                       |

Paging is reported in the `X-Total-Count` and `X-Total-Pages` headers and a `Link` header with
`first`, `last`, `prev` and `next`.

## Upload API

```
POST /api/v1/projects/{owner}/{repo}/reports
```

For projects that are not on GitHub or whose CI is private. Most GitHub projects do not need it;
see [Getting started](getting-started.md).

**Authentication.** `Authorization: Bearer bm_...`, using a per-project token created on the
project's manage page. The token is shown once; only its hash is stored. Revoke it on the same page.

**Query parameters:**

| Parameter          | Required                                | Meaning                                       |
| ------------------ | --------------------------------------- | --------------------------------------------- |
| `version`          | yes, unless the project splits versions | Game version this report is for.              |
| `commit`           | yes                                     | Commit SHA.                                   |
| `commit_message`   | no                                      | Commit message.                               |
| `commit_timestamp` | no                                      | ISO-8601 time of the commit. Defaults to now. |

**Body.** The raw report: objdiff JSON or binary protobuf. It may be gzip-compressed if sent with
`Content-Encoding: gzip`. Reports larger than the instance's `MAX_REPORT_BYTES` (256 MiB by
default) are rejected.

**Response.** JSON listing the versions stored and the project page:

```json
{ "stored": ["GALE01"], "url": "https://bytematch.dev/<owner>/<repo>" }
```

For a split-versions project, `stored` lists every version found in the report.

### curl

```sh
curl --fail -X POST \
  -H "Authorization: Bearer $BYTEMATCH_TOKEN" \
  --data-binary @build/GALE01/report.json \
  "https://bytematch.dev/api/v1/projects/<owner>/<repo>/reports?version=GALE01&commit=$GITHUB_SHA"
```

Compressed:

```sh
gzip -c build/GALE01/report.json | curl --fail -X POST \
  -H "Authorization: Bearer $BYTEMATCH_TOKEN" \
  -H "Content-Encoding: gzip" \
  --data-binary @- \
  "https://bytematch.dev/api/v1/projects/<owner>/<repo>/reports?version=GALE01&commit=$GITHUB_SHA"
```

### GitHub Actions step

Store the token as a repository secret named `BYTEMATCH_TOKEN`:

```yaml
- name: Upload progress to ByteMatch
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  env:
    BYTEMATCH_TOKEN: ${{ secrets.BYTEMATCH_TOKEN }}
  run: |
    curl --fail -X POST \
      -H "Authorization: Bearer $BYTEMATCH_TOKEN" \
      --data-binary @build/GALE01/report.json \
      "https://bytematch.dev/api/v1/projects/${{ github.repository }}/reports?version=GALE01&commit=$GITHUB_SHA"
```

To record the commit message, URL-encode it into the query string, for example with `jq`:

```sh
MSG=$(printf %s "$(git log -1 --format=%s)" | jq -sRr @uri)
curl --fail -X POST \
  -H "Authorization: Bearer $BYTEMATCH_TOKEN" \
  --data-binary @build/GALE01/report.json \
  "https://bytematch.dev/api/v1/projects/<owner>/<repo>/reports?version=GALE01&commit=$GITHUB_SHA&commit_message=$MSG"
```

## History upload

```
POST /api/v1/projects/{owner}/{repo}/history?version={version}
```

Adds commits to one version's history from a history file, the JSON served at
`/{owner}/{repo}.json?mode=history` by ByteMatch and by decomp.dev. Use it to keep history saved
from decomp.dev, or to move a project between instances. The manage page has the same upload as a
form.

**Authentication.** A project upload token, as for the upload API above.

**Body.** A JSON array, optionally gzip-compressed (at most 32 MiB unpacked):

```json
[
  {
    "timestamp": "2026-10-14T23:02:04Z",
    "commit_sha": "9a8143337c49794a9b6588d253f79683ad1484ce",
    "commit_message": "Match 38 more functions",
    "measures": { "matched_code_percent": 86.06, "total_code": 3712808, "...": "..." }
  }
]
```

Measure names are objdiff's; missing ones count as zero. History entries carry measures only, so
those commits get progress numbers and chart points but no unit or function lists. A commit that
already has data (from CI, an upload or an earlier import) is left unchanged, so repeating an
upload is harmless.

**Response:**

```json
{ "version": "us", "added": 1874, "skipped": 12, "url": "https://bytematch.dev/<owner>/<repo>" }
```

```sh
curl --fail -X POST -H "Authorization: Bearer $BYTEMATCH_TOKEN" \
  --data-binary @rac1-decomp-us-history.json \
  "https://bytematch.dev/api/v1/projects/OpenRAC/rac1-decomp/history?version=us"
```

## Health check

```
GET /healthz
```

For load balancers and uptime monitors.
