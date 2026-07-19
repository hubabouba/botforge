import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const isDev = process.env.NODE_ENV !== "production";

/**
 * Per-request Content-Security-Policy with a fresh script nonce.
 *
 * script-src is nonce + 'strict-dynamic': modern browsers trust only Next's
 * own bootstrap (auto-nonced because we echo this header on the REQUEST) and
 * whatever that trusted chain loads (the app chunks, and the bundled
 * PostHog/Sentry SDKs' own dynamic script injections) — no 'unsafe-inline'.
 * 'unsafe-inline' + https: stay only as a fallback that CSP3 browsers ignore
 * once a nonce/strict-dynamic is present, so old browsers still work.
 * 'unsafe-eval' is dev-only (HMR). The one inline script we render ourselves
 * (next-themes' anti-flash snippet) is nonced via the layout.
 */
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.posthog.com https://*.i.posthog.com https://*.sentry.io https://*.ingest.sentry.io",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

/**
 * Refreshes the Supabase auth session on every request and guards routes:
 *  - unauthenticated users are bounced from /dashboard and /workspace to /login
 *  - authenticated users are sent from /login|/signup to /dashboard
 * Also stamps a per-request CSP nonce (see buildCsp). If Supabase isn't
 * configured the auth logic is skipped, but the CSP is still applied.
 */
export async function middleware(request: NextRequest) {
  // base64 nonce (uuid is plenty of entropy and always url-safe once encoded).
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  // Echo the nonce + CSP on the forwarded REQUEST headers so Next applies the
  // nonce to its own inline framework scripts, and the layout can read x-nonce.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  if (!URL || !ANON) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(URL, ANON, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPage = path === "/login" || path === "/signup";

  if (!user && (path.startsWith("/dashboard") || path.startsWith("/workspace"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const redirect = NextResponse.redirect(url);
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    const redirect = NextResponse.redirect(url);
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Run on everything except static assets and Sentry's tunnel route.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
