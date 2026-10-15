/**
 * Manually configured project images are links to images hosted elsewhere; ByteMatch never downloads or stores them.
 * The server only checks the link's shape (it does not fetch it, so a link cannot make the server
 * request internal addresses); browsers load the image directly, without a referrer.
 */
export const MAX_IMAGE_URL_LENGTH = 2048;

/** A clean https URL, or an error message. Empty input means "no image". */
export function checkImageUrl(input: string): { url: string | null } | { error: string } {
  const raw = input.trim();
  if (!raw) return { url: null };
  if (raw.length > MAX_IMAGE_URL_LENGTH) return { error: "That link is too long." };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: "Enter a full link, starting with https://." };
  }
  if (url.protocol !== "https:") return { error: "The image link must start with https://." };
  if (url.username || url.password) return { error: "The link must not contain a username or password." };
  return { url: url.toString() };
}
