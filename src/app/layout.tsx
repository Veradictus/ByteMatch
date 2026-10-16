import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { currentSession } from "@/auth/session";
import { JsonLd } from "@/components/json-ld";
import { MobileMenu } from "@/components/mobile-menu";
import { PageViews } from "@/components/page-views";
import { SiteLinks } from "@/components/site-links";
import { ThemePicker } from "@/components/theme-picker";
import { ThemeProvider } from "@/components/use-theme";
import { DiscordMark } from "@/components/ui/icons";
import { siteJsonLd, siteMetadata } from "@/lib/seo";
import { config } from "@/lib/config";
import { paletteVars, themeAttrs } from "@/lib/theme";
import { chosenTheme } from "@/lib/theme-server";
import "./globals.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return siteMetadata();
}

/** Mobile browsers tint their toolbar with the theme's background. */
export async function generateViewport(): Promise<Viewport> {
  return { themeColor: (await chosenTheme()).palette.bg };
}

/**
 * ByteMatch's mark: four units, three matched. Brand green and blue in Slate; any other theme
 * draws it in its accent. Hovering the name matches the last unit.
 */
function Mark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden className="site-mark shrink-0">
      <rect x="1" y="1" width="11" height="11" rx="2.5" />
      <rect x="13.5" y="1" width="5.5" height="5.5" rx="1.5" />
      <rect x="13.5" y="8" width="5.5" height="11" rx="1.5" className="site-mark-partial" />
      <rect x="1" y="13.5" width="11" height="5.5" rx="1.5" />
    </svg>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession().catch(() => null);
  const name = config().SITE_NAME;
  const discord = config().SITE_DISCORD_URL.trim();
  const navLink = "rounded-lg px-3 py-1.5 text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink";
  const theme = await chosenTheme();
  return (
    // The theme is rendered from its cookie: colours as custom properties, structure as data-*.
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      style={paletteVars(theme.palette) as React.CSSProperties}
      {...themeAttrs(theme.palette, theme.style)}
    >
      <body className="min-h-screen font-sans antialiased">
        <ThemeProvider initial={theme}>
          <PageViews />
          <JsonLd data={siteJsonLd()} />
          <header className="site-header sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-md">
            <nav className="site-container site-nav mx-auto flex h-14 max-w-7xl items-center gap-1 px-4">
              <Link href="/" className="site-brand mr-3 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
                <Mark />
                {name}
              </Link>
              <SiteLinks className={navLink} />
              <div className="ml-auto hidden items-center gap-1 md:flex">
                {discord ? (
                  <a href={discord} target="_blank" rel="noopener noreferrer" className={`${navLink} flex items-center gap-1.5`}>
                    <DiscordMark size={15} />
                    Discord
                  </a>
                ) : null}
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
                    <ThemePicker />
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
                    <Link href="/manage/new" className={navLink}>
                      Submit a project
                    </Link>
                    <ThemePicker />
                    <Link href="/login" className="btn btn-ghost ml-1 h-8 px-3">
                      Sign in
                    </Link>
                  </>
                )}
              </div>
              <div className="ml-auto flex items-center gap-2 md:hidden">
                <ThemePicker />
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
          <main className="site-container site-main mx-auto max-w-7xl px-4 py-8 sm:py-10">{children}</main>
          <footer className="border-t border-line">
            <div className="site-container mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-xs text-ink-3">
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
        </ThemeProvider>
      </body>
    </html>
  );
}
