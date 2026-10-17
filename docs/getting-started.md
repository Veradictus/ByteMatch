# Getting started

This guide is for maintainers of decompilation projects who want their progress tracked on a
ByteMatch instance. The public instance is [bytematch.dev](https://bytematch.dev); on a self-hosted
instance, use its domain instead.

Moving from decomp.dev? Read [Migrating from decomp.dev](migrating-from-decomp-dev.md) instead; it
covers the same steps plus keeping your history. To have a coding assistant do the repository side
(objdiff units, CI artifact, badge), give it the prompt in
[Setting up with an AI assistant](setup-prompt.md).

## 1. Register the project

1. Open `https://bytematch.dev`, choose **Sign in with GitHub**.
2. Go to **Manage** → **Add project** and pick the repository.

You must be an admin of the GitHub repository, or a site admin of the instance. Some instances
turn off open registration; then only site admins can add projects, so ask the operator.

After registering, the project page is at `https://bytematch.dev/<owner>/<repo>`. It fills in once the
first report arrives.

## 2. Get reports to ByteMatch

ByteMatch reads [objdiff](https://github.com/encounter/objdiff) progress reports. There are three
ways to deliver them.

### CI artifacts (recommended)

Upload objdiff's report from GitHub Actions as an artifact named `<VERSION>_report`, for example
`GALE01_report` or `SCES_509.16_report`. Projects based on dtk-template already do this.

ByteMatch reads artifacts only from:

- **successful** workflow runs,
- on the project's **default branch**,
- triggered by **push** events (pull request runs are used for PR comments, not history).

A minimal workflow step after your build:

```yaml
- name: Generate progress report
  run: objdiff-cli report generate -o build/${VERSION}/report.json

- name: Upload progress report
  uses: actions/upload-artifact@v4
  with:
    name: ${{ env.VERSION }}_report
    path: build/${{ env.VERSION }}/report.json
```

Here `VERSION` is the game version, e.g. set with `env: VERSION: GALE01` on the job, or as a
matrix value. Use one artifact per version.

The worker checks for new runs every 15 minutes by default (the instance's
`POLL_INTERVAL_MINUTES`). If the instance's GitHub App is installed on your repository, a webhook
triggers ingestion as soon as the run finishes.

GitHub requires authentication to download artifacts, even from public repositories. The instance
uses its GitHub App if installed on your repository, otherwise a server-wide token. If reports do
not appear, installing the App is the most reliable fix.

#### Per-project artifact settings

Set these on the project's manage page if your CI differs from the default:

| Setting          | Default                         | Use                                                                                                                                                                    |
| ---------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Artifact pattern | `^(?<version>.+)_report$`       | Regular expression for artifact names. The named group `version` is the game version.                                                                                  |
| Workflow         | all workflows                   | Only read artifacts from this workflow file, e.g. `build.yml`.                                                                                                         |
| Split versions   | off                             | Your single report holds every version as top-level categories (objdiff's `version` / `version.category` convention). ByteMatch splits it into one report per version. |
| Default branch   | the repository's default branch | Read from GitHub when the project is added; runs on this branch count as progress. Change it if progress is built on another branch.                                   |

### GitHub App

Installing the instance's GitHub App on the repository gives instant updates (no polling delay) and
pull request comments. The link is on the project's manage page. See [PR comments](#4-pr-comments).

### Upload API

For projects not on GitHub, or with private CI, push reports directly. Create an upload token on
the project's manage page (it is shown once; store it as a CI secret such as `BYTEMATCH_TOKEN`),
then:

```sh
curl --fail -X POST \
  -H "Authorization: Bearer $BYTEMATCH_TOKEN" \
  --data-binary @build/GALE01/report.json \
  "https://bytematch.dev/api/v1/projects/<owner>/<repo>/reports?version=GALE01&commit=$GITHUB_SHA"
```

Full details are in the [API reference](api.md#upload-api).

## 3. Badges

Add badges to your README. `measure` picks what to show:

```markdown
![Code](https://bytematch.dev/<owner>/<repo>.svg?label=Code&measure=matched_code_percent)
![Data](https://bytematch.dev/<owner>/<repo>.svg?label=Data&measure=matched_data_percent)
![Functions](https://bytematch.dev/<owner>/<repo>.svg?label=Functions&measure=matched_functions)
```

Percent measures read like `86.02%`; `matched_functions` and `complete_units` read like
`4,520 / 5,109`. Use `.png` instead of `.svg` where SVG is not supported. Add `version=` or
`category=` for a specific version or category, and `style=` for `flat-square`, `plastic` or
`for-the-badge`.

Every parameter is listed in the [API reference](api.md#badges).

## 4. PR comments

With the GitHub App installed, ByteMatch comments on pull requests. When a PR's workflow run
uploads a report, ByteMatch compares it with the latest report for the same version on the base
branch and posts one comment per PR, listing:

- newly matched functions,
- regressions,
- changes in the measures.

Later runs on the same PR update that comment rather than adding new ones. Turn PR comments off on
the project's manage page.

## 5. Icon and cover

A project can show a square **icon** (in the project list and next to its name) and a wide
**cover** (the banner on its page). On the manage page, paste an `https` link for each under **Icon
and cover**: about 256 × 256 for the icon and 1500 × 500 for the cover. ByteMatch only links to
them: it never downloads or stores images, so host them somewhere public and stable (your
repository, a GitHub release, an image host). Visitors' browsers load them directly, without a
referrer. If a link stops working, the page simply shows no image.

Frames crop the cover to fit: a wide banner on the project page, a shorter one on its game's page,
and a narrower card in the games list. Drag the cover's preview on the manage page (or focus it and
use the arrow keys, Shift for bigger steps) to choose which part stays in view; every frame crops
around that point, and a small preview shows how game cards will look. **Center** puts it back in
the middle. Changing the link starts the new image centred.

## 6. Game and franchise

Under **Settings**, name the **game** the project decompiles, its **franchise** and its release
**year**. Projects naming the same game share a page at `/games/<game>` (regional builds and
parallel efforts side by side, with one progress chart), and games naming the same franchise are
listed together at `/franchises/<franchise>`. Leave them empty to keep the project out of the games
pages; it stays in the main list either way.

Names don't have to be spelled exactly alike to group. These all count as one game:

- case, accents and punctuation: `Pokémon Colosseum` and `pokemon colosseum`
- `&`, `+` and `and`: `Ratchet & Clank` and `Ratchet and Clank`
- a leading "The": `The Legend of Zelda` and `Legend of Zelda`
- region tags in brackets or at the end: `Super Mario 64 (USA)`, `Super Mario 64 [PAL]`
- Roman numerals and digits: `Final Fantasy VII` and `Final Fantasy 7` (II to XX; a bare X is left
  alone, since Mega Man X isn't Mega Man 10)

Subtitles and sequel numbers always count, so `Paper Mario` and `Paper Mario: The Thousand-Year
Door` stay apart. While you type, the field says what the name will do: join an existing game page
(and how it's shown there), probably mean one that exists ("Did you mean …?", for a typo or a
missing series name), or start a new page. For names that mean one game but look nothing alike,
such as regional titles, the site's admins can merge them; projects using either name then share
one page, and the merged name's old address redirects to it.

On instances with IGDB lookups turned on, typing in the
Game field also lists matching games from [IGDB](https://www.igdb.com). Picking one fills in IGDB's
name for it, and its year and franchise where those are empty, and keeps IGDB's id for the game:
projects that picked the same game share its page whatever they later rename it to. Typing a
different name afterwards unlinks it. Nothing needs IGDB; a typed name works as before. Site admins
can also link a whole game page at once (under Admin → Games), which gives every project on it
IGDB's name and id; the page's old address keeps working.

### One repository, several games

When a repository's versions are different games (two games on one engine, say), open **Different
games per version** under Settings and give each such version its game, franchise and year. Each
then appears on its own game's page, linking to that version, with that version's progress.
Versions left empty stay under the project's game.

## 7. Functional C (optional)

Some projects keep C for functions they haven't matched, which does what the original does without
compiling to the same bytes: for a native port, say, while matching carries on. It is not matched
code and never counts as progress. ByteMatch can still show how much of the game it covers, if you
send a list of those functions with the report:

1. Add `functional.json` (or `functional.tsv`) to the same artifact as `report.json`. The
   [format](api.md#functional-list) is a list of function names, each with an optional confidence
   (`high`, `medium` or `low`).
2. ByteMatch sizes each listed function from the report and leaves out any that are matched by now.

ByteMatch reads the list from the next run. A commit it has already read is never read again on
its own, so to see the list right away (say, when the list arrived in a run read before your
ByteMatch was upgraded), press **Re-read latest run** on the manage page.

The project page then shows a thin line under the Code bar: functional C's share of the code, the
matched code it continues from, and the confidence breakdown. The headline percentage, badges,
the project list and pull request comments are unchanged. On the unit map, a function with
functional C says so, with its confidence. The manage page says how many listed functions are
already matched, so the list can drop them.

## 8. Ports (optional)

If someone has built a port from your decompilation (a native PC version, say), list it under
**Ports** on the manage page: a name, a link to wherever it lives (repository, releases page or
website), the systems it runs on and how far along it is (playable, in progress, early). If the
repository has several versions, you can say which one it's built from; in a repository of
several games, that also decides which game's page it's listed on. Ports show in the project's
sidebar, on its game's page and on [/ports](https://bytematch.dev/ports). ByteMatch links to them
and hosts nothing. Up to eight per project.

## Recently updated and bumps

The project list's default order, **Recently updated**, goes by the last commit that changed the
project's matched code, matched functions, fully linked code or matched data. Commits that change
none of those (a tooling update rolled out to all your projects, a rename, a rebuild) don't move
the project up, so several projects updated at once don't take over the top of the list. Fuzzy
match and totals don't count either, since a new objdiff or a changed split can shift them with no
work done.

For news a report can't show, like a new tool or a playable build, use **Bump to the top** on the
manage page: the project counts as updated at that moment. One bump per project a day.

## Source on the project page

On the unit map, **View source** on an opened unit shows its file, and selecting a function shows
just that function, both from your repository at the commit of the report you're looking at, with
a link to the lines on GitHub. ByteMatch finds the file through each unit's `source_path` in the
report, which dtk-template and most objdiff setups fill in; a unit without one has no source to
show.

## Manage page reference

Signed-in admins of the repository can change:

- display name, short name, platform, default version, default category, default branch;
- game, franchise and release year, and a different game for any version that is one;
- artifact pattern, workflow restriction, split versions;
- PR comments on or off, and whether the project is enabled;
- ports built from the project (add and remove);
- upload tokens (create and revoke).

Actions:

- **Poll now**: check GitHub for new runs immediately.
- **Backfill**: read older CI runs whose artifacts have not expired yet (GitHub keeps artifacts
  90 days by default).
- **Import from decomp.dev**: copy history from decomp.dev (see the
  [migration guide](migrating-from-decomp-dev.md#4-keep-your-history)).
- **Re-read latest run**: read the newest CI run again. Polls never re-read a commit already
  stored, so use this when its artifact holds something that wasn't read the first time, such as a
  functional list.
- **Bump to the top**: list the project as updated now, once a day (see
  [Recently updated and bumps](#recently-updated-and-bumps)).
- **Upload history**: add a saved history file to one version, and download what ByteMatch has.

If the last ingest failed, the error is shown on this page.
