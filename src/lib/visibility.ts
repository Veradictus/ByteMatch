/**
 * Whether a project is kept off public pages (list, project page, badges, JSON). A project is
 * hidden once GitHub has said its repository is gone (deleted, made private or blocked) for
 * HIDE_AFTER_DAYS, or while it has an error and has never produced a report. Until then it keeps
 * showing its last progress, with a note: a repository made private for an afternoon shouldn't
 * lose its page, its badges and its place in search. Missing access on ByteMatch's side (the App not
 * installed yet, no GITHUB_TOKEN) does not hide a project that already has history. Its admins still see it on
 * the manage page, syncing keeps retrying, and it reappears on its own once a sync succeeds
 * (success clears the error).
 */
export const ACCESS_ERROR_PATTERN = "^not found|\\b404\\b|repository access blocked|\\b451\\b";
const ACCESS_ERROR = new RegExp(ACCESS_ERROR_PATTERN, "i");

/** Days a project whose repository can't be reached keeps showing its last progress. */
export const HIDE_AFTER_DAYS = 14;

export interface Visibility {
  enabled: boolean;
  lastError: string | null;
  /** When the errors began; null for rows from before it was recorded (then lastErrorAt counts). */
  errorSince?: Date | string | null;
  lastErrorAt?: Date | string | null;
}

/** GitHub says the repository is gone or unreadable (not a rate limit or a bad artifact). */
export function unreachable(project: Visibility): boolean {
  return !!project.lastError && ACCESS_ERROR.test(project.lastError);
}

export function hiddenFromPublic(project: Visibility, hasReports: boolean, now = Date.now()): boolean {
  if (!project.enabled) return true;
  if (!project.lastError) return false;
  if (!hasReports) return true;
  if (!unreachable(project)) return false;
  const since = project.errorSince ?? project.lastErrorAt;
  return !since || now - new Date(since).getTime() > HIDE_AFTER_DAYS * 86400_000;
}
