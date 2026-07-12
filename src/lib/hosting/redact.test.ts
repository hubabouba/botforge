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
});
