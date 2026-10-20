# Creating the GitHub App

This guide is for instance operators. One GitHub App gives a ByteMatch instance:

- **webhooks**, so CI results are ingested as soon as a workflow run finishes;
- **installation tokens**, to download artifacts from repositories the App is installed on;
- **pull request comments**;
- **Sign in with GitHub** for the manage pages, through the App's OAuth client.

Without an App, ByteMatch still works by polling, but it needs a `GITHUB_TOKEN` to download
artifacts (GitHub requires authentication even for public repositories), there are no PR comments,
and nobody can sign in.

`<host>` below is your instance's public domain, the same as `PUBLIC_URL`.

## 1. Create the App

Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App** (or the same under
an organization's settings to own it as the organization).

| Field                                                  | Value                                                                                    |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| GitHub App name                                        | Anything, e.g. `ByteMatch (<host>)`. Its slug becomes `GITHUB_APP_SLUG`.                 |
| Homepage URL                                           | `https://<host>`                                                                         |
| Callback URL                                           | `https://<host>/auth/callback`                                                           |
| Request user authorization (OAuth) during installation | Off                                                                                      |
| Webhook: Active                                        | On                                                                                       |
| Webhook URL                                            | `https://<host>/api/github/webhook`                                                      |
| Webhook secret                                         | A long random string, e.g. `openssl rand -hex 32`. Also goes in `GITHUB_WEBHOOK_SECRET`. |
| Where can this GitHub App be installed?                | Any account, so other projects can install it.                                           |

### Repository permissions

| Permission    | Access                |
| ------------- | --------------------- |
| Actions       | Read-only             |
| Metadata      | Read-only (mandatory) |
| Pull requests | Read and write        |

Leave every other permission at "No access".

### Subscribe to events

- Workflow run
- Installation and Installation repositories (installation events are always sent)
- Repository

### User token expiry

ByteMatch keeps a signed-in user's GitHub token for the length of the session (30 days) to check
which repositories they administer. Either setting of **User-to-server token expiration** (under the
App's **Optional features**) works: with expiry on, GitHub's tokens last 8 hours and ByteMatch
renews them with the refresh token GitHub sends alongside, and a session ends when GitHub stops
accepting that (after 6 months, or when the user revokes the App). With expiry off, there is
nothing to renew.

## 2. Generate the private key

On the App's page, under **Private keys**, choose **Generate a private key**. GitHub downloads a
`.pem` file.

`GITHUB_APP_PRIVATE_KEY` holds the PEM contents. In `.env` you can keep it on one line with literal
`\n` sequences:

```sh
awk 'NF {printf "%s\\n", $0}' bytematch.private-key.pem
```

Paste the output in double quotes:

```dotenv
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n"
```

Keep the key out of the repository (`*.pem` is ignored by `.gitignore`), and delete the downloaded
file once it is stored.

## 3. Create a client secret

On the App's page, under **Client secrets**, choose **Generate a new client secret**. Note the
**Client ID** shown on the same page.

## 4. Fill in the environment

| Variable                 | Where to find it                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `GITHUB_APP_ID`          | App page, "App ID"                                                                                            |
| `GITHUB_APP_PRIVATE_KEY` | The PEM from step 2                                                                                           |
| `GITHUB_APP_SLUG`        | The last part of the App's public URL, `https://github.com/apps/<slug>`. Used for the "Install the App" link. |
| `GITHUB_WEBHOOK_SECRET`  | The webhook secret from step 1                                                                                |
| `GITHUB_CLIENT_ID`       | App page, "Client ID"                                                                                         |
| `GITHUB_CLIENT_SECRET`   | The client secret from step 3                                                                                 |
| `SECRET_KEY`             | `openssl rand -hex 32`. Encrypts signed-in users' GitHub tokens. Sign-in is disabled without it.              |
| `PUBLIC_URL`             | `https://<host>`, matching the URLs entered above                                                             |

Optionally also set `GITHUB_TOKEN` to a fine-grained personal access token with public repository
read access. It is used for repositories where the App is not installed.

Restart the web and worker processes after changing `.env` (`yarn pm2:reload`, or recreate the
containers).

## 5. Check it

1. Open `https://<host>` and sign in with GitHub.
2. Install the App on a repository from a project's manage page, or from
   `https://github.com/apps/<slug>`.
3. On the App's page, **Advanced → Recent Deliveries** shows webhook deliveries and their response
   codes. A failed signature check means `GITHUB_WEBHOOK_SECRET` does not match.

## Notes

- If `PUBLIC_URL` changes, update the webhook URL and callback URL on the App too.
- Repository admins install the App on their own repositories; operators do not need access to
  them.
