/**
 * Gate for the internal /admin dashboard — a personal stats panel, not a
 * customer-facing feature. Deliberately separate from plan.ts's allow-lists
 * (BOTFORGE_PRO_EMAILS etc. simulate a subscription tier; this just decides who
 * can see aggregate business data). Fails closed: unset ADMIN_EMAILS = nobody in.
 */
export function isAdminEmail(email?: string | null): boolean {
  const e = email?.toLowerCase();
  if (!e) return false;
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(e);
}
