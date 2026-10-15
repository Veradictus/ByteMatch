import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import Link from "next/link";
import { currentSession } from "@/auth/session";
import { JsonLd } from "@/components/json-ld";
import { MobileMenu } from "@/components/mobile-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { siteJsonLd, siteMetadata } from "@/lib/seo";
import { config } from "@/lib/config";
import "./globals.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return siteMetadata();
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession().catch(() => null);
  const name = config().SITE_NAME;
  const discord = config().SITE_DISCORD_URL.trim();
  const navLink = "rounded-control px-3 py-1.5 text-xl text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink";
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('bytematch-theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}})()`,
          }}
        />
      </head>
      {/* Extensions may add body attributes before hydration; descendants still receive normal checks. */}
      <body className="min-h-screen font-sans antialiased" suppressHydrationWarning>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <JsonLd data={siteJsonLd()} />
        <header className="site-header">
          <nav className="site-container site-nav" aria-label="Main navigation">
            <Link href="/" className="site-brand">
              {name === "ByteMatch" ? "bytematch.dev" : name}
            </Link>
            <span className="nav-divider" aria-hidden="true">
              /
            </span>
            <div className="hidden items-center gap-1 md:flex">
              <Link href="/" className={navLink}>
                Projects
              </Link>
              <Link href="/games" className={navLink}>
                Games
              </Link>
              <Link href="/activity" className={navLink}>
                Activity
              </Link>
              <Link href="/docs" className={navLink}>
                Docs
              </Link>
            </div>
            <div className="ml-auto hidden items-center gap-1 md:flex">
              {session ? (
                <>
                  <Link href="/manage" className={navLink}>
                    Manage
                  </Link>
                  {session.admin ? (
                    <Link href="/admin" className={navLink}>
                      Admin
                    </Link>
                  ) : null}
                  <span className="mx-1 hidden items-center gap-2 text-sm text-ink-3 lg:flex">
                    {session.user.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a 20px avatar from GitHub
                      <img src={`${session.user.avatarUrl}&s=40`} alt="" width={20} height={20} className="rounded-full" />
                    ) : null}
                    {session.user.login}
                  </span>
                  <form action="/auth/logout" method="post">
                    <button className={navLink}>Sign out</button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login" className="btn btn-ghost ml-1 h-8 px-3">
                    Sign in
                  </Link>
                </>
              )}
            </div>
            <ThemeToggle />
            <div className="flex items-center gap-2 md:hidden">
              {session ? null : (
                <Link href="/login" className="btn btn-ghost h-9 px-3">
                  Sign in
                </Link>
              )}
              <MobileMenu
                user={session?.user.login ?? null}
                signOut={!!session}
                links={[
                  { href: "/", label: "Projects" },
                  { href: "/games", label: "Games" },
                  { href: "/activity", label: "Activity" },
                  { href: "/docs", label: "Docs" },
                  { href: "/manage/new", label: "Submit a project" },
                  ...(session ? [{ href: "/manage", label: "Manage" }] : []),
                  ...(session?.admin ? [{ href: "/admin", label: "Admin" }] : []),
                  ...(discord ? [{ href: discord, label: "Discord", external: true }] : []),
                ]}
              />
            </div>
          </nav>
        </header>
        <main id="main-content" className="site-container site-main">
          {children}
        </main>
        <footer className="site-footer">
          <div className="site-container flex flex-wrap items-center gap-x-6 gap-y-2">
            <span>
              {name} tracks matching decompilation progress from{" "}
              <a className="underline hover:text-ink" href="https://github.com/encounter/objdiff">
                objdiff
              </a>{" "}
              reports.
            </span>
            <Link href="/docs" className="hover:text-ink">
              Docs
            </Link>
            <Link href="/docs/migrating-from-decomp-dev" className="hover:text-ink">
              Coming from decomp.dev?
            </Link>
            {discord ? (
              <a href={discord} target="_blank" rel="noopener noreferrer" className="hover:text-ink">
                Discord
              </a>
            ) : null}
            <a href="https://github.com/Veradictus/ByteMatch" className="hover:text-ink sm:ml-auto">
              Source (GPL-3.0)
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
