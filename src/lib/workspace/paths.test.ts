import { describe, expect, it } from "vitest";
import { isSafeProjectPath } from "@/lib/workspace/paths";

describe("isSafeProjectPath", () => {
  it("accepts normal project-relative paths", () => {
    expect(isSafeProjectPath("main.py")).toBe(true);
    expect(isSafeProjectPath("src/handlers.py")).toBe(true);
    expect(isSafeProjectPath("a/b/c/deep.file.txt")).toBe(true);
    expect(isSafeProjectPath(".env.example")).toBe(true);
    expect(isSafeProjectPath("папка/файл.py")).toBe(true);
  });

  it("rejects traversal in any segment", () => {
    expect(isSafeProjectPath("../escape.py")).toBe(false);
    expect(isSafeProjectPath("src/../../etc/passwd")).toBe(false);
    expect(isSafeProjectPath("..")).toBe(false);
    expect(isSafeProjectPath("a/..")).toBe(false);
    expect(isSafeProjectPath("./sneaky.py")).toBe(false);
  });

  it("rejects absolute, drive-letter, backslash and NUL paths", () => {
    expect(isSafeProjectPath("/etc/passwd")).toBe(false);
    expect(isSafeProjectPath("C:/windows/system32")).toBe(false);
    expect(isSafeProjectPath("a\\b.py")).toBe(false);
    expect(isSafeProjectPath("a\0b.py")).toBe(false);
  });

  it("rejects empty names and degenerate shapes", () => {
    expect(isSafeProjectPath("")).toBe(false);
    expect(isSafeProjectPath("a//b.py")).toBe(false);
    expect(isSafeProjectPath("a/")).toBe(false);
    expect(isSafeProjectPath("x".repeat(301))).toBe(false);
  });
});
