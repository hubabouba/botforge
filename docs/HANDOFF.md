# Botforge — Handoff (AI assistant + editor v2)

Snapshot for continuing the work in another session (e.g. Fable 5) or by another
engineer. Written 2026-07-03.

## What Botforge is
An AI lab where users describe a Telegram/Discord bot and get real, runnable code
in an IDE-style workspace. Stack: **Next.js 15 (App Router, TS) + Tailwind +
Supabase (auth) + Sentry + PostHog + Vercel**. Repo: `hubabouba/botforge`, live at
`botforge-snowy.vercel.app` (Vercel project `bot-forge1/botforge`, deploys `main`).

Product today = a working **template/AI bot-code editor** (no bot hosting yet):
pick a template or run the create-wizard → edit real code (autosave) → download ZIP
→ run locally. Projects persist in **localStorage** behind `src/lib/workspace/store.ts`
(swap to Supabase later). Design is restrained minimalism; SVG icons in
`src/components/icons.tsx` (no emoji).

## What was just built in this turn (CODE-COMPLETE, `npm run build` is green)

### 1. Editor v2 — `src/components/workspace/CodeEditor.tsx`
Transparent-textarea-over-highlight editor, now with: auto-indent on Enter
(keeps indentation, adds a level after `:` `{` `(` `[`, and splits an empty pair),
auto-closing brackets/quotes + type-over the closer + backspace deletes empty pair,
Tab / Shift+Tab (2-space indent/dedent), Cmd/Ctrl+S (`onSave` prop), active-line
marker in the gutter, and a status bar (Ln/Col, spaces, line count, language).

### 2. Real AI assistant (Claude) — replaces the old fake chat
- `src/lib/ai/claude.ts` → new `assistantChat({ project, files, messages })` using
  model `claude-sonnet-5` with a `write_file` **tool**. Single turn: returns
  `{ reply, edits: [{path, content}] }` (edits are proposals; the browser applies
  them since files live in localStorage).
- `src/app/api/ai/chat/route.ts` → POST endpoint. **Auth-guarded** (Supabase
  `getUser()` → 401 if signed out). Returns 503 if `ANTHROPIC_API_KEY` is unset.
  Zod-validates body (≤40 files, ≤30 messages, size caps). `runtime = "nodejs"`,
  `maxDuration = 60`.
- `src/components/workspace/WorkspaceChat.tsx` → right-side chat panel. Sends the
  full conversation + current files to the API; renders the reply and each proposed
  edit as a card with an **Apply** button; typing indicator; suggestion chips;
  collapse button.
- Integrated in `src/components/workspace/Workspace.tsx`: 3-column layout
  (tree | editor | chat), `chatOpen` toggle, `onApplyEdit` (writes/creates the file,
  opens it, bumps `editorNonce` to remount the editor so new content shows), editor
  gets `onSave={pingSaving}` and `key={activeFile.path#editorNonce}`.
- `src/components/workspace/TopBar.tsx`: added an **Assistant** toggle button
  (`chatOpen` / `onToggleChat`).

## REMAINING STEPS (not code — env + deploy)

1. **Set `ANTHROPIC_API_KEY` in Vercel** (REQUIRED for the AI chat on prod).
   Vercel → project `botforge` → Settings → Environment Variables → add
   `ANTHROPIC_API_KEY` (Production, and Preview if wanted) → **Redeploy**.
   The key already exists in the local `.env`. Without it, prod chat shows
   "The AI assistant isn't configured yet".
2. **Commit + push to deploy.** Suggested commit:
   `feat(workspace): real AI assistant (Claude) + editor upgrades`.
   Note: Vercel occasionally misses a push — if the live site doesn't update,
   push an empty commit (`git commit --allow-empty -m "chore: redeploy"`) or hit
   Redeploy in the Vercel dashboard.
3. **Verify live:** open a project → Assistant panel → "Add a /help command" →
   an edit card appears → Apply → the file updates in the editor.

## Design notes / gotchas
- CSP is set in `next.config.ts`; `connect-src 'self'` already covers `/api/ai/chat`
  (same origin). Claude is called server-side, not subject to browser CSP.
- Files are re-sent to the model on every message (fine for small projects; each
  file content capped at 8000 chars in the system prompt).
- The editor keeps its own text state; it only resets on remount — that's why an
  applied edit bumps `editorNonce`.
- Don't reintroduce fake/mock AI — the chat is real now.

## Roadmap after this
- Move persistence to **Supabase Postgres + RLS** (per-user projects, cross-device).
- **Stream** assistant responses (SSE) for nicer UX; add per-user rate limits.
- Real **Run** (sandboxed execution) — infra, not a language change.
- Then **Stripe** (tokens vs subscription — undecided).

## Key files (this feature)
- `src/components/workspace/CodeEditor.tsx` — editor v2
- `src/components/workspace/WorkspaceChat.tsx` — chat panel
- `src/lib/ai/claude.ts` — `assistantChat` + `write_file` tool
- `src/app/api/ai/chat/route.ts` — auth-guarded endpoint
- `src/components/workspace/Workspace.tsx` — integration (3 columns, apply edits)
- `src/components/workspace/TopBar.tsx` — Assistant toggle
- `src/lib/workspace/store.ts` — localStorage project store (createProject, writeFile, addFile…)
- `src/lib/workspace/scaffold.ts` — wizard → runnable starter (deterministic, pre-AI)
