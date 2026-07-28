import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { rejectCrossOrigin } from "@/lib/http";

const URL_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Methods that can change something. GET/HEAD/OPTIONS need no CSRF guard. */
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Two jobs, and deliberately not the same job for both kinds of route.
 *
 * Pages: refresh the Supabase session and guard access — signed-out visitors
 * are bounced from /dashboard and /workspace to /login, signed-in ones from
 * /login|/signup to /dashboard.
 *
 * API: no session work at all. Every route handler calls auth.getUser() itself,
 * so doing it here too meant authenticating twice on every request — a cost the
 * hosting status and log pollers paid on every tick. Route handlers can also
 * write cookies (unlike Server Components), so they refresh an expiring session
 * on their own. What they do get here is the cross-origin guard: one place
 * instead of fourteen, and it runs before any of them touch the database.
 *
 * With Supabase unconfigured this stays a passthrough.
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (path.startsWith("/api/")) {
    // Internal hosting callbacks are made by a Fly Machine with a bearer token,
    // not a browser. It sends no Origin — which the guard already treats as
    // fine, but being explicit keeps a future tightening from breaking every
    // running bot silently.
    if (path.startsWith("/api/internal/")) return NextResponse.next();
    if (MUTATING.has(request.method)) {
      const refused = rejectCrossOrigin(request);
      if (refused) return refused;
    }
    return NextResponse.next();
  }

  if (!URL_ENV || !ANON) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(URL_ENV, ANON, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthPage = path === "/login" || path === "/signup";

  if (!user && (path.startsWith("/dashboard") || path.startsWith("/workspace"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Everything except static assets, the analytics/error tunnels, and public
  // files crawlers hit far more often than people do. `/api` IS matched — the
  // handler above short-circuits it before any session work (see the doc
  // comment); what it costs there is a string comparison.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|monitoring|ingest|robots.txt|sitemap.xml|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
