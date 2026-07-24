import { NextResponse } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * OAuth / magic-link landing point.
 *
 * Email links (magic link + signup confirmation) carry a `token_hash` + `type`
 * and are verified with `verifyOtp` — the token is self-contained, so it works
 * no matter which browser opens the link. The old `?code=` PKCE flow needed a
 * `code_verifier` cookie from the SAME browser that requested the link, which
 * mobile in-app mail browsers don't share, so the exchange failed before it
 * ever reached Supabase (no /token call in the auth logs). Requires the email
 * templates to point here with `?token_hash={{ .TokenHash }}&type=email`.
 *
 * OAuth (Google/GitHub) still returns `?code=` and always runs in the same
 * browser, so PKCE there is fine — kept as a fallback branch.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  // Only same-origin paths: "next" is attacker-controllable, and anything that
  // isn't a plain "/path" ("//host", "/\host", "@host") re-parses as an
  // external URL after concatenation — a phishing-grade open redirect.
  const rawNext = searchParams.get("next") ?? "";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\")
    ? rawNext
    : "/dashboard";

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
