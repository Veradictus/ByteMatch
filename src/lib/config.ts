import { z } from "zod";

/**
 * Server settings, from the environment (see .env.example). Read lazily so `next build`
 * works without a database or GitHub credentials.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1).default("postgres://bytematch:bytematch@localhost:5432/bytematch"),
  /** Public address of this instance, without a trailing slash; used in links, badges and PR comments. */
  PUBLIC_URL: z
    .string()
    .url()
    .default("http://localhost:5000")
    .transform((u) => u.replace(/\/+$/, "")),
  /** Shown in the page header and titles. */
  SITE_NAME: z.string().default("ByteMatch"),
  /** The community Discord linked in the header and footer; empty hides the link. */
  SITE_DISCORD_URL: z.string().default("https://discord.gg/qqe7ZqCsMT"),

  /** Optional server-only key for automatic hero artwork. */
  STEAMGRIDDB_API_KEY: z.string().trim().default(""),

  /** A GitHub token for reading public repositories' artifacts when the App is not installed on them. */
  GITHUB_TOKEN: z.string().optional(),
  /** GitHub App: webhooks, installation tokens, PR comments, and sign-in (its OAuth client). */
  GITHUB_APP_ID: z.string().optional(),
  /** The App's private key (PEM). Literal "\n" sequences are turned into newlines. */
  GITHUB_APP_PRIVATE_KEY: z
    .string()
    .optional()
    .transform((k) => k?.replace(/\\n/g, "\n")),
  GITHUB_APP_SLUG: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  /** 32 random bytes as hex or base64: encrypts the GitHub tokens of signed-in users. Required for sign-in. */
  SECRET_KEY: z.string().optional(),
  /** GitHub logins (comma-separated) who may manage every project. */
  ADMIN_GITHUB_LOGINS: z
    .string()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean),
    ),

  /** How often the worker looks for new CI artifacts on projects without webhook delivery. */
  POLL_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(15),
  /** Keep full reports (units and functions) this many days; measures are kept forever. 0 keeps everything. */
  REPORT_RETENTION_DAYS: z.coerce.number().int().min(0).default(0),
  /** Largest report accepted, in bytes (artifacts are unzipped up to this). */
  MAX_REPORT_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .default(256 * 1024 * 1024),
  /** Allow anyone signed in to register a public repository they administer (otherwise admins only). */
  OPEN_REGISTRATION: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  /** Where decomp.dev history imports come from. */
  DECOMP_DEV_URL: z.string().url().default("https://decomp.dev"),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(4),
});

export type Config = z.infer<typeof schema>;

let cached: Config | undefined;

export function config(): Config {
  return (cached ??= schema.parse(process.env));
}

/** For tests. */
export function resetConfig() {
  cached = undefined;
}

export const githubAppConfigured = () => {
  const c = config();
  return !!(c.GITHUB_APP_ID && c.GITHUB_APP_PRIVATE_KEY);
};

export const signInConfigured = () => {
  const c = config();
  return !!(c.GITHUB_CLIENT_ID && c.GITHUB_CLIENT_SECRET && c.SECRET_KEY);
};
