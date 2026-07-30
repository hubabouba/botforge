import { describe, expect, it } from "vitest";
import { redactSecrets } from "@/lib/hosting/deployments";

describe("redactSecrets", () => {
  it("redacts a Telegram bot token, including inside a URL", () => {
    const token = "8123456789:AAExw_ThisIsAFakeTelegramBotTokenValue123";
    expect(redactSecrets(`using token ${token}`)).toBe("using token [REDACTED]");
    expect(redactSecrets(`GET https://api.telegram.org/bot${token}/getUpdates`)).toContain("[REDACTED]");
    expect(redactSecrets(`GET https://api.telegram.org/bot${token}/getUpdates`)).not.toContain(token);
  });

  it("redacts a Discord-style dotted token", () => {
    const token = "MTk4NjIyNDgzNDcxOTI1MjQ4.GkQ3aB.Xj2_fakeDiscordTokenSegment0000";
    expect(redactSecrets(`login ${token}`)).not.toContain(token);
    expect(redactSecrets(`login ${token}`)).toContain("[REDACTED]");
  });

  it("leaves ordinary log lines untouched", () => {
    const line = "Application started; polling getUpdates 200 OK";
    expect(redactSecrets(line)).toBe(line);
  });

  it("redacts every occurrence in one line", () => {
    const t1 = "8100000001:AAExw_fakeTelegramTokenNumberOne_000000";
    const t2 = "8100000002:AAExw_fakeTelegramTokenNumberTwo_000000";
    const out = redactSecrets(`${t1} then ${t2}`);
    expect(out).not.toContain(t1);
    expect(out).not.toContain(t2);
  });

  it("redacts an OpenAI-style key", () => {
    const key = "sk-proj-Fake1234567890abcdefFake1234567890";
    expect(redactSecrets(`calling OpenAI with ${key}`)).not.toContain(key);
    expect(redactSecrets(`calling OpenAI with ${key}`)).toContain("[REDACTED]");
  });

  it("redacts a dumped bearer credential but keeps the header shape", () => {
    const cred = "abcdefghijklmnopqrstuvwxyz123456";
    const out = redactSecrets(`Authorization: Bearer ${cred}`);
    expect(out).not.toContain(cred);
    expect(out).toContain("Bearer [REDACTED]");
  });

  it("does not over-redact short or ordinary words after Bearer-less text", () => {
    const line = "risk of a skeleton bug in the parser";
    expect(redactSecrets(line)).toBe(line);
  });

  // The underscore families. The sk-… rule above requires a hyphen, so every
  // one of these used to pass through into project_logs verbatim.
  //
  // Assembled from pieces rather than written out. Fixtures realistic enough to
  // exercise the regex are also realistic enough for GitHub's push protection
  // to block the push -- it flagged the first version of this file as two live
  // Stripe keys. Splitting the prefix keeps the test honest and keeps the
  // scanner's warnings meaningful instead of something to click past.
  const fake = (prefix: string, body: string) => prefix + "_" + body;
  it.each([
    ["Stripe secret", fake("sk", "live_51Redacted000000000000000000")],
    ["Stripe restricted", fake("rk", "live_51Redacted000000000000000000")],
    ["Stripe webhook", fake("whsec", "Redacted00000000000000000000000")],
    ["GitHub classic", fake("ghp", "Redacted0000000000000000000000000")],
    ["GitHub fine-grained", fake("github", "pat_Redacted00000000000000000")],
    // Google's format is AIza + exactly 35 chars, so the tail is computed
    // rather than typed -- counting zeros by eye got it wrong by one.
    ["Google API", "AIza" + "Sy" + "Redacted" + "0".repeat(25)],
  ])("redacts a %s key", (_label, key) => {
    const out = redactSecrets(`charge failed for ${key} at 12:00`);
    expect(out).not.toContain(key);
    expect(out).toContain("[REDACTED]");
  });

  it("redacts a JWT — the shape a leaked service-role key takes in a log", () => {
    // Header/payload are real base64url so the shape is exact; the signature is
    // nonsense. Same assembly reasoning as above.
    const jwt = ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", "eyJyb2xlIjoiZXhhbXBsZSJ9", "Redacted000signature000here"].join(".");
    const out = redactSecrets(`supabase client init ${jwt}`);
    expect(out).not.toContain(jwt);
    expect(out).toContain("[REDACTED]");
  });

  it("leaves prose that merely resembles a key alone", () => {
    // No underscore-digit shape, no AIza prefix, no three dotted segments.
    const line = "the sk_live environment is separate from test, see AIza docs";
    expect(redactSecrets(line)).toBe(line);
  });
});
