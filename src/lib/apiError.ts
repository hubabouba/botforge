/**
 * One way to fail a route handler.
 *
 * Two problems this fixes, and they are the same line of code in both
 * directions. Routes were returning `(e as Error).message` straight to the
 * browser, which meant a signed-in user could read raw Postgres and Stripe
 * error text: constraint names, column names, RPC signatures, which price id
 * was missing from the environment. None of that is catastrophic on its own,
 * and all of it is free reconnaissance — it describes the shape of the schema
 * to someone deciding whether to keep poking.
 *
 * The mirror image: the same handlers mostly did NOT report those failures
 * anywhere. So the only party who ever learned that a query broke was the
 * person who broke it, and we found out never.
 *
 * So: the detail goes to Sentry, where it is useful and private, and the user
 * gets a sentence that tells them what to do about it. Deliberately not a
 * generic "something went wrong" everywhere — the caller passes the message
 * that fits the action, because "couldn't save the file" and "couldn't start
 * checkout" lead a person to different next steps.
 */
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

/**
 * Report `e` with context and answer with `message` and a 500.
 *
 * `where` is the breadcrumb that makes the Sentry issue findable — use the
 * route path or the operation, not a restatement of the message.
 */
export function serverError(
  e: unknown,
  message: string,
  where: string,
  extra?: Record<string, unknown>,
): NextResponse {
  Sentry.captureException(e, { extra: { where, ...extra } });
  return NextResponse.json({ error: message }, { status: 500 });
}

/**
 * Same, for a Supabase `{ error }` result rather than a thrown exception.
 * Postgres errors arrive as values here, not throws, so they never reach a
 * catch block — this is the path most of the leaks took.
 */
export function dbError(
  error: { message: string; code?: string; details?: string } | null,
  message: string,
  where: string,
  extra?: Record<string, unknown>,
): NextResponse {
  Sentry.captureException(new Error(`${where}: ${error?.message ?? "unknown"}`), {
    extra: { where, code: error?.code, details: error?.details, ...extra },
  });
  return NextResponse.json({ error: message }, { status: 500 });
}
