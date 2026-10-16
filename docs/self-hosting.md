# Self-hosting

ByteMatch runs as two processes, a Next.js web server and a background worker, sharing one
PostgreSQL database. There is no Redis; the job queue (pg-boss) lives in Postgres.

## Requirements

- Node.js 24
- Yarn 4 (the repository pins 4.18.1; enable it with `corepack enable`)
- PostgreSQL 15 or newer
- A domain and a reverse proxy with TLS
- A GitHub App (see [Creating the GitHub App](github-app.md)) or at least a `GITHUB_TOKEN`

Or Docker / Podman with Compose, which provides Node and Postgres for you.

## Configuration

Settings are environment variables. Copy `.env.example` to `.env`; the file is read by
`next start`, the worker and the migrations.

| Variable                   | Default                                                   | Description                                                                                                                                       |
| -------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`             | `postgres://bytematch:bytematch@localhost:5432/bytematch` | PostgreSQL connection string.                                                                                                                     |
| `PUBLIC_URL`               | `http://localhost:5000`                                   | Public address of the instance, used in links, badges and PR comments.                                                                            |
| `SITE_NAME`                | `ByteMatch`                                               | Shown in the header and page titles.                                                                                                              |
| `GOOGLE_SITE_VERIFICATION` |                                                           | Optional: the `content` value from Google Search Console's "HTML tag" verification. See [Search engines](#search-engines).                        |
| `BING_SITE_VERIFICATION`   |                                                           | Optional: the `content` value from Bing Webmaster Tools' "HTML Meta Tag" verification.                                                            |
| `GITHUB_TOKEN`             |                                                           | Optional fine-grained PAT (public read is enough) for downloading artifacts from repositories without the App.                                    |
| `GITHUB_APP_ID`            |                                                           | GitHub App id.                                                                                                                                    |
| `GITHUB_APP_PRIVATE_KEY`   |                                                           | The App's private key PEM. Literal `\n` sequences are allowed.                                                                                    |
| `GITHUB_APP_SLUG`          |                                                           | App slug, for the "Install the App" link.                                                                                                         |
| `GITHUB_WEBHOOK_SECRET`    |                                                           | Webhook secret set on the App.                                                                                                                    |
| `GITHUB_CLIENT_ID`         |                                                           | The App's OAuth client id, for sign-in.                                                                                                           |
| `GITHUB_CLIENT_SECRET`     |                                                           | The App's OAuth client secret.                                                                                                                    |
| `SECRET_KEY`               |                                                           | 32 random bytes as 64 hex characters or base64 (`openssl rand -hex 32`). Encrypts signed-in users' GitHub tokens. Sign-in is disabled without it. |
| `ADMIN_GITHUB_LOGINS`      |                                                           | Comma-separated GitHub logins who can manage every project.                                                                                       |
| `OPEN_REGISTRATION`        | `true`                                                    | `false` makes adding projects admin-only.                                                                                                         |
| `POLL_INTERVAL_MINUTES`    | `15`                                                      | How often the worker checks projects for new CI runs.                                                                                             |
| `REPORT_RETENTION_DAYS`    | `0`                                                       | `0` keeps everything. Otherwise full reports older than this are dropped, except each version's latest. Measures and history are kept forever.    |
| `MAX_REPORT_BYTES`         | `268435456` (256 MiB)                                     | Largest report accepted.                                                                                                                          |
| `DECOMP_DEV_URL`           | `https://decomp.dev`                                      | Source for "Import from decomp.dev".                                                                                                              |
| `WORKER_CONCURRENCY`       | `4`                                                       | Jobs each worker process runs at once.                                                                                                            |

Sign-in needs `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and `SECRET_KEY`. Webhooks, PR comments and
installation tokens need `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` and `GITHUB_WEBHOOK_SECRET`.

## Deploying with pm2

```sh
git clone https://github.com/Veradictus/ByteMatch.git
cd ByteMatch
cp .env.example .env        # then edit it
yarn install --immutable
yarn build                  # Next build, plus dist/main.js (worker) and dist/migrate.js (migrator)
yarn db:migrate
yarn pm2:start
pm2 save
pm2 startup                 # prints a command that makes pm2 start at boot; run it
```

`yarn pm2:start` starts `ecosystem.config.cjs`, which defines two apps:

| pm2 app            | Runs                            |
| ------------------ | ------------------------------- |
| `bytematch-web`    | `next start -H 0.0.0.0 -p 5000` |
| `bytematch-worker` | `dist/main.js`                  |

Other scripts: `yarn pm2:reload`, `yarn pm2:stop`, `yarn pm2:logs`.

pm2 remembers each process's environment from its first start. `yarn pm2:reload` passes
`--update-env`, so it picks up changes to `.env`; a bare `pm2 reload` or `pm2 restart` does not.

The web server listens on `0.0.0.0:5000`. Firewall that port and expose only the reverse proxy.

## Deploying with containers

```sh
cp .env.example .env        # then edit it
docker compose --profile app up -d --build
```

| Service   | Role                                                                        |
| --------- | --------------------------------------------------------------------------- |
| `db`      | PostgreSQL 17, on `127.0.0.1:5432`, user, password and database `bytematch` |
| `migrate` | Runs the migrations, then exits                                             |
| `web`     | The website, on port 5000                                                   |
| `worker`  | The background worker                                                       |

`web` and `worker` start after `migrate` succeeds. The compose file sets `DATABASE_URL` to the `db`
service, overriding `.env`. Change the default database password before exposing anything beyond
the host.

All three app services use one image, built from `Containerfile`. To run it without Compose:

```sh
docker build -t bytematch -f Containerfile .          # or: podman build -t bytematch .
docker run --env-file .env bytematch node dist/migrate.js
docker run -d -p 5000:5000 --env-file .env bytematch  # web
docker run -d --env-file .env bytematch node dist/main.js   # worker
```

## Reverse proxy

Put a reverse proxy with TLS in front of port 5000, and set `PUBLIC_URL` to the public address
(e.g. `https://bytematch.dev`): links, badges, sign-in and PR comments are built from it.

The server listens on `0.0.0.0:5000`, so it is also reachable directly on port 5000. Block that port
in the firewall (e.g. `ufw deny 5000`) so all traffic goes through the proxy, or bind the app to
loopback by changing `-H 0.0.0.0` to `-H 127.0.0.1` in `ecosystem.config.cjs`.

### nginx

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name bytematch.dev www.bytematch.dev;
    return 301 https://bytematch.dev$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name bytematch.dev www.bytematch.dev;

    ssl_certificate     /etc/letsencrypt/live/bytematch.dev/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bytematch.dev/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # One canonical host, so sign-in cookies and links agree.
    if ($host = www.bytematch.dev) { return 301 https://bytematch.dev$request_uri; }

    # Report uploads (POST /api/v1/projects/.../reports) can be large; match MAX_REPORT_BYTES.
    client_max_body_size 256m;

    location / {
        # 127.0.0.1, not localhost: localhost may resolve to ::1, where the server is not listening.
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        # Rate limits (theme sharing) read the visitor's address from X-Real-IP. Keep it set to
        # $remote_addr so clients can't choose their own.
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

### Caddy

```caddyfile
<host> {
	request_body {
		max_size 256MB
	}
	reverse_proxy 127.0.0.1:5000
}
```

Caddy obtains the certificate itself. With several web hosts, list them all:
`reverse_proxy 10.0.0.2:5000 10.0.0.3:5000`.

### Port 5000 on macOS

macOS's AirPlay Receiver listens on port 5000, so `yarn dev` and `yarn start` fail there with
`EADDRINUSE`. Turn off AirPlay Receiver (System Settings → General → AirDrop & Handoff), or run the
dev server on another port: `yarn next dev -p 5050` (and set `PUBLIC_URL` to match).

## Administering an instance

Accounts listed in `ADMIN_GITHUB_LOGINS` see **Admin** in the header (`/admin`; everyone else gets a
404 there). It has:

| Tab       | What it does                                                                                                                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview  | Whether the worker is alive (it writes a heartbeat every minute), queued and failed jobs, how much of `GITHUB_TOKEN`'s hourly GitHub allowance is left, and which GitHub App settings are present.          |
| Projects  | Every project with its status (healthy, syncing, erroring, hidden, disabled), submitter and last error. Re-sync, disable, remove a linked image or Discord invite, or delete a project outright.            |
| Jobs      | Each queue's counts, and failed jobs with their (scrubbed) error: retry or discard them.                                                                                                                    |
| Users     | Everyone who has signed in, and the blocklist. Blocking works by GitHub username even before someone signs in; it signs them out, stops them signing in or submitting, and can take their projects offline. |
| Audit log | Every admin action: who, what, when, and the reason given.                                                                                                                                                  |
| Settings  | Open or close project submissions (overriding `OPEN_REGISTRATION`), and pause all syncing during maintenance; queued work resumes when you switch it back on.                                               |

Deleting a project removes it and everything stored for it. Disabling hides it but keeps its history.

A project whose repository GitHub stops serving (deleted, made private, blocked) keeps its page,
badges and JSON, with a note, for 14 days from the first failed sync, showing the last progress
ByteMatch read; after that it's hidden until a sync succeeds again, which brings it straight back.
A repository made private for a while and then public again never drops off.

## Search engines

ByteMatch looks after the parts search engines read on its own, and keeps them current as projects
come and go:

- **`/sitemap.xml`** lists the home page, games, activity, docs, every public project (and its other
  versions), and every game and franchise page, with last-modified dates from the projects' latest
  reports. It's built per request from the database. **`/robots.txt`** points to it and keeps
  crawlers out of `/manage`, `/api` and `/auth`.
- **Every page** has its own title, description, canonical URL and social card. Project pages get
  a card drawn from their progress; a project's default version is canonicalised to its main URL,
  so the two don't compete.
- **Structured data** (JSON-LD): the site (`WebSite`), each project's progress (`Dataset`), docs
  pages (`TechArticle`), games and franchises (`CollectionPage` with the game as a `VideoGame`), and
  breadcrumbs (`BreadcrumbList`) on project, game, franchise and docs pages.
- **Private and personal pages** aren't indexed: the manage pages, the admin panel (a 404 to
  anyone but staff), shared theme links and projects that are hidden.
- **`/llms.txt`** summarises the site, its docs and its projects for language-model crawlers.

### Google Search Console

1. Add the site in [Search Console](https://search.google.com/search-console). A **Domain** property
   (verified with a DNS TXT record) covers every address the site answers on and needs nothing from
   ByteMatch. For a **URL prefix** property, choose the "HTML tag" method, copy the `content` value,
   set it as `GOOGLE_SITE_VERIFICATION` in `.env`, restart the web process (`yarn pm2:reload`), then
   press Verify.
2. Under **Sitemaps**, submit `sitemap.xml` (e.g. `https://bytematch.dev/sitemap.xml`). Google also
   finds it through `robots.txt`, but submitting it shows its status and any errors.
3. Use **URL Inspection** on a project page to check it can be fetched and indexed, and the
   [Rich Results Test](https://search.google.com/test/rich-results) to check its structured data.

For Bing, [Webmaster Tools](https://www.bing.com/webmasters) can import the site straight from
Search Console, or verify with `BING_SITE_VERIFICATION` the same way.

## Upgrades

pm2:

```sh
git pull && yarn install --immutable && yarn build && yarn db:migrate && yarn pm2:reload
```

Containers:

```sh
git pull && docker compose --profile app up -d --build
```

The `migrate` service runs before `web` and `worker` start again.

## Backups

Everything lives in PostgreSQL: projects, history, full reports, tokens and the job queue.

```sh
pg_dump -Fc "$DATABASE_URL" > bytematch-$(date +%F).dump
```

With the compose database:

```sh
docker compose exec -T db pg_dump -Fc -U bytematch bytematch > bytematch-$(date +%F).dump
```

Restore with `pg_restore -d <database> --clean bytematch-YYYY-MM-DD.dump`. Also keep a copy of
`.env`: without the same `SECRET_KEY`, stored user tokens cannot be decrypted and users must sign
in again.

To reduce database size, set `REPORT_RETENTION_DAYS`. Measures and history are never dropped.

## Scaling

The web and worker processes are stateless.

- **Web**: with pm2, raise `instances` for `bytematch-web` in `ecosystem.config.cjs` (it runs in
  cluster mode, so the processes share port 5000). On several machines, list each one in the proxy.
- **Worker**: run more worker processes, or raise `WORKER_CONCURRENCY`. Jobs are claimed through
  Postgres, so each runs once, and duplicate webhook jobs for the same run collapse into one.

The database is the only shared component.
