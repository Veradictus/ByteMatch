# ByteMatch

Progress tracking for matching decompilation projects, live at **[bytematch.dev](https://bytematch.dev)**.

ByteMatch reads the [objdiff](https://github.com/encounter/objdiff) report your CI already builds,
keeps its history, shows every unit on a grid, draws badges, and comments on pull requests.

```markdown
[![Code](https://bytematch.dev/OWNER/REPO.svg?mode=shield&label=Code&measure=matched_code_percent)](https://bytematch.dev/OWNER/REPO)
```

## Why

[decomp.dev](https://decomp.dev) was the community's progress site, and it did a great deal for
decompilation projects. Thank you to encounter for building and running it. It is being sunset: new
projects can no longer register, and existing pages stay up for now.

ByteMatch replaces it. It is a clean-room implementation and contains no decomp.dev code. It serves
the same public URLs (`/{owner}/{repo}.json`, `.svg`, `.png`, the same query parameters), so a
project switches by changing the domain and keeps its history with a one-click import.

## Features

- **No CI changes** for projects that already upload `<VERSION>_report` artifacts (the
  dtk-template convention). Reports are read from successful runs on the default branch.
- **Project pages**: one line of progress, then a grid of every unit (area = code size, filled green
  by how much matches). Filter it like `camera <70% >10kb`; click a unit for its functions.
  History, categories, the unit list, commits and badges are a click away.
- **Source**: select a function on the unit map to see its code from your repository at that
  report's commit, or open a unit's whole file.
- **Badges** in SVG and PNG, drawn by ByteMatch itself, plus shields.io endpoint JSON.
- **JSON API** compatible with decomp.dev: project, history, measures and full reports.
- **Pull request comments** through a GitHub App: newly matched functions, regressions, measure
  changes. Webhooks also make new runs show up at once.
- **Upload API** with per-project tokens, for CI outside GitHub Actions.
- **History you keep**: import it from decomp.dev while it still serves it, upload saved history
  files, and download any project's history in the same format.
- **Games, franchises and activity**: projects naming the same game share a page with a combined
  progress chart (one repository can hold several games, one per version), games group into
  franchises, and an activity feed shows milestones (first past
  50%, 90%, a full match) and the week's biggest gains.
- **Themes**: colours (Slate by default, Light, Graphite and seven accent themes) and layouts
  (Classic, or the flat, card-based Directory), picked from the header, plus your own, shared by a
  short code like `brave-otter-12` or its link.
- **Self-hostable**: Next.js, PostgreSQL and a background worker. No Redis. Runs with pm2 or
  containers.

## For project maintainers

1. On [bytematch.dev](https://bytematch.dev), sign in with GitHub, open **Manage** and **Add
   project**. You need admin rights on the repository.
2. Make sure CI uploads objdiff's `report.json` as an artifact named `<VERSION>_report`.
   dtk-template projects already do.
3. Swap `decomp.dev` for `bytematch.dev` in your README badges and run **Import from decomp.dev** on
   the project's Manage page.

Details: [Getting started](docs/getting-started.md) and
[Migrating from decomp.dev](docs/migrating-from-decomp-dev.md).

## Running your own instance

Requires Node 24, Yarn 4 and PostgreSQL 15 or newer.

```sh
git clone https://github.com/Veradictus/ByteMatch.git && cd ByteMatch
cp .env.example .env     # set PUBLIC_URL, SECRET_KEY and the GitHub App settings
yarn install --immutable
yarn build
yarn db:migrate
yarn pm2:start           # bytematch-web on 0.0.0.0:5000, and bytematch-worker
```

Or with containers: `docker compose --profile app up -d --build`. Put nginx or Caddy with TLS in
front. See [Self-hosting](docs/self-hosting.md) and [the GitHub App guide](docs/github-app.md).

## Documentation

| Document                                                       | For                                                         |
| -------------------------------------------------------------- | ----------------------------------------------------------- |
| [Getting started](docs/getting-started.md)                     | Maintainers: registering, CI artifacts, badges, PR comments |
| [Migrating from decomp.dev](docs/migrating-from-decomp-dev.md) | Maintainers: moving badges, links and history               |
| [API](docs/api.md)                                             | Every public URL, parameter and JSON shape; the upload API  |
| [GitHub App](docs/github-app.md)                               | Operators: creating and configuring the App                 |
| [Self-hosting](docs/self-hosting.md)                           | Operators: configuration, pm2, containers, nginx, upgrades  |
| [Architecture](docs/architecture.md)                           | Processes, data model, ingest flow, job queue               |
| [Contributing](CONTRIBUTING.md)                                | Development setup, tests, code style, Conventional Commits  |
| [Theming](docs/theming.md)                                     | Palette slots, derived colours, rules for adding colour     |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Work happens on `master`. Commits follow
[Conventional Commits](https://www.conventionalcommits.org/) (`feat(api): …`, `fix: …`, `docs: …`),
one logical change each, and `yarn check` must pass. Never copy decomp.dev code.

## Credits

- [objdiff](https://github.com/encounter/objdiff) (MIT OR Apache-2.0) produces the reports.
  ByteMatch vendors its `report.proto` and `changes.proto` (`src/report/proto/`, with
  `LICENSE-MIT.objdiff`) and follows its report parsing and migration rules.
- [DejaVu Sans](https://dejavu-fonts.github.io/) (`src/assets/fonts/`, Bitstream Vera license) draws
  the badges.
- [decomp.dev](https://decomp.dev), for showing what a progress site for this community should be.

## License

[GPL-3.0](LICENSE). Vendored third-party files keep their own licenses.
