/**
 * Exact-string replacement — the core of `edit_file`.
 *
 * Why this rather than a unified diff: a diff carries line numbers, and line
 * numbers are the one thing a language model reliably gets wrong. A patch that
 * applies at the wrong offset corrupts a file silently. An exact string either
 * matches or it doesn't, so every failure is loud and recoverable — the model
 * is told what went wrong and tries again.
 *
 * Uniqueness is required for the same reason. If `old_string` appears twice,
 * "replace it" has two answers and picking one is a coin flip against the
 * user's code. Refusing and asking for more surrounding context costs a turn;
 * editing the wrong line costs their trust.
 */

export type EditFailure =
  | { reason: "not_found" }
  | { reason: "ambiguous"; occurrences: number }
  | { reason: "identical" }
  | { reason: "empty_target" };

export type EditResult = { ok: true; content: string } | ({ ok: false } & EditFailure);

/** Count non-overlapping occurrences of `needle` in `haystack`. */
export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count += 1;
    from = at + needle.length;
  }
}

/**
 * Replace the single occurrence of `oldString` in `content` with `newString`.
 *
 * `newString` may be empty — that's a deletion, and a legitimate edit. Only
 * `oldString` must be non-empty: an empty search target matches everywhere and
 * means nothing.
 */
export function applyStringEdit(content: string, oldString: string, newString: string): EditResult {
  if (!oldString) return { ok: false, reason: "empty_target" };
  if (oldString === newString) return { ok: false, reason: "identical" };

  const occurrences = countOccurrences(content, oldString);
  if (occurrences === 0) return { ok: false, reason: "not_found" };
  if (occurrences > 1) return { ok: false, reason: "ambiguous", occurrences };

  const at = content.indexOf(oldString);
  return { ok: true, content: content.slice(0, at) + newString + content.slice(at + oldString.length) };
}

/**
 * What to tell the model when an edit doesn't apply.
 *
 * Written as instructions rather than diagnostics: this text is read by
 * something that can act on it, and every one of these is recoverable in the
 * next turn. A bare "not found" would just get the same call again.
 */
export function editFailureMessage(path: string, failure: EditFailure): string {
  switch (failure.reason) {
    case "not_found":
      return `No exact match for old_string in ${path}. It must match the file byte for byte, including indentation. Call read_file on ${path} and copy the text straight out of it.`;
    case "ambiguous":
      return `old_string appears ${failure.occurrences} times in ${path}, so it's ambiguous. Include more surrounding lines to make it unique, or make one edit_file call per occurrence with distinct context.`;
    case "identical":
      return `old_string and new_string are identical, so this edit does nothing. Send the changed text as new_string.`;
    case "empty_target":
      return `old_string is empty. To create a new file use write_file; to insert into an existing one, set old_string to the line you want to insert next to.`;
  }
}
