/**
 * Same-origin check for state-changing requests.
 *
 * Honest about what this is: defence in depth, not a hole being closed.
 * Supabase's auth cookies are SameSite=Lax, so a browser won't attach them to a
 * cross-site POST in the first place, and `Content-Type: application/json`
 * forces a CORS preflight that a forged form can't satisfy. This is the second
 * lock on a door that is already locked — cheap, and it stops the day a cookie
 * default changes underneath us from becoming an incident.
 *
 * NOT for the internal hosting callbacks (/api/internal/*). Their caller is a
 * Fly Machine authenticating with a bearer token; it sends no Origin, and
 * requiring one would break every running bot.
 */
import { NextResponse } from "next/server";

/**
 * True when the request came from our own site (or from a non-browser client
 * that sent no Origin at all — those can't be CSRF, since CSRF is by definition
 * a browser attaching cookies on someone else's behalf).
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  // No Origin header: not a cross-site browser request. Same-origin GETs and
  // non-browser clients land here.
  if (!origin) return true;

  const configured = (process.env.BOTFORGE_PUBLIC_URL || "").trim().replace(/\/$/, "");
  const allowed = new Set<string>();
  if (configured) allowed.add(configured);
  // Preview deployments and local dev have no BOTFORGE_PUBLIC_URL match, so the
  // request's own origin counts too — the header is only trustworthy as a
  // negative signal ("this came from somewhere else"), and that's all we use.
  try {
    allowed.add(new URL(req.url).origin);
  } catch {
    /* malformed request URL — fall through to the configured origin only */
  }
  return allowed.has(origin);
}

/**
 * Guard for mutating route handlers. Returns a 403 response to return as-is, or
 * null when the request may proceed.
 */
export function rejectCrossOrigin(req: Request): NextResponse | null {
  if (isSameOrigin(req)) return null;
  return NextResponse.json({ error: "Cross-origin request refused." }, { status: 403 });
}
