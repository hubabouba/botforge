/**
 * Tiny, dependency-free syntax highlighter.
 *
 * Why not a library: shipping Shiki/Prism/Monaco just to color a mock project
 * is a lot of bytes (and Monaco pulls a CDN). This scanner covers the handful of
 * languages we generate (Python, JS/TS, JSON, Markdown) well enough to look
 * professional, matches our exact palette, and adds ~2 KB. It tokenizes the full
 * source (supporting multi-line strings/comments) and returns tokens grouped by
 * line, so the editor can render a gutter with line numbers.
 */

import type { Lang } from "./types";

export type TokenType =
  | "plain"
  | "comment"
  | "string"
  | "keyword"
  | "number"
  | "function"
  | "decorator"
  | "property"
  | "punctuation"
  | "boolean";

export interface Token {
  type: TokenType;
  value: string;
}

const PY_KEYWORDS = new Set([
  "def","class","return","import","from","as","if","elif","else","for","while","in","not","and","or",
  "is","try","except","finally","raise","with","lambda","yield","global","nonlocal","pass","break",
  "continue","async","await","del","assert","self","cls","match","case","print",
]);
const PY_CONST = new Set(["None","True","False"]);

const JS_KEYWORDS = new Set([
  "const","let","var","function","return","if","else","for","while","do","switch","case","break",
  "continue","new","class","extends","super","this","import","from","export","default","async","await",
  "try","catch","finally","throw","typeof","instanceof","in","of","void","yield","interface","type",
  "enum","implements","public","private","protected","readonly","as","namespace","declare","abstract",
  "static","get","set","keyof","infer","satisfies",
]);
const JS_CONST = new Set(["null","undefined","true","false","NaN","Infinity"]);

interface LangSpec {
  keywords: Set<string>;
  consts: Set<string>;
  lineComment?: string;
  blockComment?: [string, string];
  tripleStrings?: boolean; // python """ / '''
  templateStrings?: boolean; // js backticks
  decorators?: boolean; // python @deco
}

function specFor(lang: Lang): LangSpec | null {
  switch (lang) {
    case "python":
      return { keywords: PY_KEYWORDS, consts: PY_CONST, lineComment: "#", tripleStrings: true, decorators: true };
    case "typescript":
    case "javascript":
      return {
        keywords: JS_KEYWORDS,
        consts: JS_CONST,
        lineComment: "//",
        blockComment: ["/*", "*/"],
        templateStrings: true,
      };
    default:
      return null;
  }
}

const isIdentStart = (c: string) => /[A-Za-z_$]/.test(c);
const isIdent = (c: string) => /[A-Za-z0-9_$]/.test(c);
const isDigit = (c: string) => /[0-9]/.test(c);

/** Tokenize source into a flat token list (tokens may contain newlines). */
function tokenize(code: string, spec: LangSpec): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = code.length;
  // Track the last non-space token to detect property access (after ".").
  let prevMeaningful = "";

  const push = (type: TokenType, value: string) => {
    if (value) tokens.push({ type, value });
  };

  while (i < n) {
    const c = code[i];

    // Whitespace (incl. newlines) — passthrough as plain.
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      let j = i;
      while (j < n && (code[j] === " " || code[j] === "\t" || code[j] === "\n" || code[j] === "\r")) j++;
      push("plain", code.slice(i, j));
      i = j;
      continue;
    }

    // Line comment
    if (spec.lineComment && code.startsWith(spec.lineComment, i)) {
      let j = i;
      while (j < n && code[j] !== "\n") j++;
      push("comment", code.slice(i, j));
      i = j;
      continue;
    }

    // Block comment
    if (spec.blockComment && code.startsWith(spec.blockComment[0], i)) {
      const end = code.indexOf(spec.blockComment[1], i + spec.blockComment[0].length);
      const j = end === -1 ? n : end + spec.blockComment[1].length;
      push("comment", code.slice(i, j));
      i = j;
      continue;
    }

    // Triple-quoted strings (python)
    if (spec.tripleStrings && (code.startsWith('"""', i) || code.startsWith("'''", i))) {
      const q = code.slice(i, i + 3);
      const end = code.indexOf(q, i + 3);
      const j = end === -1 ? n : end + 3;
      push("string", code.slice(i, j));
      i = j;
      continue;
    }

    // Regular / template strings
    if (c === '"' || c === "'" || (spec.templateStrings && c === "`")) {
      let j = i + 1;
      while (j < n) {
        if (code[j] === "\\") {
          j += 2;
          continue;
        }
        if (code[j] === c) {
          j++;
          break;
        }
        // Non-template single/double strings do not span lines.
        if (code[j] === "\n" && c !== "`") break;
        j++;
      }
      push("string", code.slice(i, j));
      prevMeaningful = "string";
      i = j;
      continue;
    }

    // Numbers
    if (isDigit(c) || (c === "." && isDigit(code[i + 1] ?? ""))) {
      let j = i;
      while (j < n && /[0-9a-fA-Fxob._eE+-]/.test(code[j])) {
        // stop a stray + / - that isn't part of an exponent
        if ((code[j] === "+" || code[j] === "-") && !/[eE]/.test(code[j - 1] ?? "")) break;
        j++;
      }
      push("number", code.slice(i, j));
      prevMeaningful = "number";
      i = j;
      continue;
    }

    // Python decorator
    if (spec.decorators && c === "@" && isIdentStart(code[i + 1] ?? "")) {
      let j = i + 1;
      while (j < n && (isIdent(code[j]) || code[j] === ".")) j++;
      push("decorator", code.slice(i, j));
      prevMeaningful = "decorator";
      i = j;
      continue;
    }

    // Identifiers / keywords
    if (isIdentStart(c)) {
      let j = i;
      while (j < n && isIdent(code[j])) j++;
      const word = code.slice(i, j);
      // Look ahead past spaces for a "(" to detect a call/def name.
      let k = j;
      while (k < n && (code[k] === " " || code[k] === "\t")) k++;
      const isCall = code[k] === "(";
      const afterDot = prevMeaningful === ".";

      let type: TokenType = "plain";
      if (spec.keywords.has(word)) type = "keyword";
      else if (spec.consts.has(word)) type = "boolean";
      else if (afterDot) type = isCall ? "function" : "property";
      else if (isCall) type = "function";
      push(type, word);
      prevMeaningful = word;
      i = j;
      continue;
    }

    // Punctuation / operators (single char)
    push("punctuation", c);
    prevMeaningful = c;
    i++;
  }

  return tokens;
}

/** Split tokens containing newlines so each output row is one visual line. */
function toLines(tokens: Token[]): Token[][] {
  const lines: Token[][] = [[]];
  for (const tok of tokens) {
    const parts = tok.value.split("\n");
    parts.forEach((part, idx) => {
      if (idx > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ type: tok.type, value: part });
    });
  }
  return lines;
}

/**
 * Highlight source into lines of tokens. For unsupported languages every line is
 * a single plain token (still rendered with a gutter).
 */
export function highlightToLines(code: string, lang: Lang): Token[][] {
  const spec = specFor(lang);
  if (!spec) {
    return code.split("\n").map((line) => (line ? [{ type: "plain" as const, value: line }] : []));
  }
  return toLines(tokenize(code, spec));
}

/** Material-ish palette mapped to Tailwind arbitrary colors (dark editor only). */
export const TOKEN_COLORS: Record<TokenType, string> = {
  plain: "text-[#d6d9e4]",
  comment: "text-[#5c6773] italic",
  string: "text-[#c3e88d]",
  keyword: "text-[#c792ea]",
  number: "text-[#f78c6c]",
  function: "text-[#82aaff]",
  decorator: "text-[#ffcb6b]",
  property: "text-[#b2ccd6]",
  punctuation: "text-[#89ddff]",
  boolean: "text-[#ff9cac]",
};
