/**
 * The project journal — "where you left off".
 *
 * A real file in the project rather than a panel, because the thing being asked
 * for is something you can still find after closing the tab, after coming back
 * a week later, and inside the ZIP you downloaded. It appears in the file tree,
 * opens in the editor, and downloads with everything else.
 *
 * Written after every completed exchange, so "when the user leaves" needs no
 * detection: by the time they leave it is already current.
 *
 * Two things it deliberately is not:
 *  - It is never sent to the assistant. buildFileContext filters it out. It is
 *    a log of what the model just did, in a conversation the model is already
 *    reading, and it grows forever — paying to re-send it every message would
 *    be paying to tell the model what it already knows.
 *  - It never overwrites a file it didn't write. `nextProgress` refuses unless
 *    the existing content carries our marker, so a hand-written PROGRESS.md in
 *    somebody's bot repo is left alone.
 */

export const PROGRESS_PATH = "PROGRESS.md";

/** First line of every journal we own. Absent = the file is somebody else's. */
const MARKER = "<!--botforge-progress-->";
/** Entry delimiter. An HTML comment so it renders as nothing at all. */
const SEP = "\n<!--entry-->\n";

/** Newest first; older entries fall off. Long enough to cover a work session. */
const MAX_ENTRIES = 20;
const MAX_REQUEST_CHARS = 300;
const MAX_REPLY_CHARS = 600;

export interface ProgressEntry {
  /** What the user asked for. */
  request: string;
  /** What the assistant said back, in prose. */
  reply: string;
  /** Paths the exchange changed, if any. */
  files: string[];
  /** When it happened. Defaults to now; injectable so tests aren't clock-bound. */
  at?: number;
}

/** Journal wording, passed in so the file follows the interface language. */
export interface ProgressLabels {
  title: string;
  intro: string;
  asked: string;
  changed: string;
  reply: string;
}

/**
 * Flatten prose into one line that can't break the markdown around it.
 *
 * Fenced code goes first: an assistant reply routinely contains a ``` block,
 * and half of one — which is what truncation would leave — turns the rest of
 * the journal into a code block.
 */
function oneLine(text: string, max: number): string {
  const flat = text
    .replace(/```[\s\S]*?```/g, " […] ")
    .replace(/```[\s\S]*$/, " […] ")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? flat.slice(0, max).trimEnd() + "…" : flat;
}

function renderEntry(entry: ProgressEntry, labels: ProgressLabels, locale: string): string {
  const when = new Date(entry.at ?? Date.now()).toLocaleString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const lines = [`### ${when}`, "", `**${labels.asked}:** ${oneLine(entry.request, MAX_REQUEST_CHARS)}`];
  if (entry.files.length) lines.push("", `**${labels.changed}:** ${entry.files.join(", ")}`);
  const reply = oneLine(entry.reply, MAX_REPLY_CHARS);
  if (reply) lines.push("", `**${labels.reply}:** ${reply}`);
  return lines.join("\n");
}

/**
 * The journal's new content after one more exchange, or `null` when the file at
 * PROGRESS_PATH belongs to the user and must not be touched.
 *
 * `existing` is the current file content, or null/undefined when there is none.
 */
export function nextProgress(
  existing: string | null | undefined,
  entry: ProgressEntry,
  labels: ProgressLabels,
  locale = "en",
): string | null {
  const current = (existing ?? "").trim();
  if (current && !current.startsWith(MARKER)) return null;

  // split() on the joined form yields [header, ...entries]; the header is
  // re-rendered every time so it follows the interface language.
  const previous = current ? current.split(SEP).slice(1) : [];
  const kept = [renderEntry(entry, labels, locale), ...previous].slice(0, MAX_ENTRIES);
  const header = `${MARKER}\n# ${labels.title}\n\n_${labels.intro}_`;
  return [header, ...kept].join(SEP) + "\n";
}
