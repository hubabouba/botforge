import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { LegalShell } from "@/components/marketing/LegalShell";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="July 28, 2026">
      <p>
        This policy describes what data {brand.name} (“{brand.operator}”, “we”), operating from{" "}
        {brand.jurisdiction}, collects and how we use it. This document is a draft and should be
        reviewed by a lawyer before launch.
      </p>

      <h2>What we collect</h2>
      <p>
        <strong>Your account.</strong> Email address and authentication data, held by our auth
        provider. We never see or store a password — sign-in is by emailed link or by Google/GitHub.
      </p>
      <p>
        <strong>Your projects.</strong> The bot descriptions you write, the code generated for you,
        the files you edit, and the build plans you produce in the Planning tab.
      </p>
      <p>
        <strong>Your conversations with the assistant.</strong> Messages you send it and its
        replies are stored so a project reopens where you left it, including on another device. The
        most recent 200 turns per project are kept; older ones are deleted automatically. Please
        don&apos;t paste bot tokens or passwords into the chat — there is a proper place for those,
        described next.
      </p>
      <p>
        <strong>Bot secrets.</strong> Tokens you give us so we can run your bot (a Telegram or
        Discord token, for example) are encrypted the moment they reach our server and only ever
        decrypted to start your bot. Nothing in the product can display one back to you — not the
        interface, not support, not the assistant.
      </p>
      <p>
        <strong>Console output from bots we host.</strong> When you run a bot on our hosting we
        store what it prints, so you can see logs and so the assistant can help you fix a crash. The
        most recent 2,000 lines per project are kept. Two things are worth knowing about this: we
        automatically redact anything shaped like a token before storing a line, and{" "}
        <strong>whatever your bot prints ends up here</strong> — including, if your code logs them,
        messages sent to your bot by other people. What your bot records about its own users is your
        responsibility as its operator, and you should tell them what it does.
      </p>
      <p>
        <strong>Usage and cost.</strong> How many assistant messages you send, how long your bots
        run, and what your requests cost us in AI processing. We use this to enforce plan limits and
        to work out whether our pricing covers what we spend.
      </p>
      <p>
        <strong>Payments.</strong> Handled by Stripe. We never see or store card details. We keep
        your plan, billing period, subscription status, and Stripe&apos;s identifiers for you. If
        you cancel, Stripe may ask you for a reason and share it with us.
      </p>
      <p>
        <strong>Technical data.</strong> Server logs, IP address, device and browser type, pages
        visited, and product events such as creating a project or starting a bot. These events are
        linked to your account, not anonymous — we need to know that the same person did each step
        to see where people get stuck.
      </p>
      <p>
        <strong>Session recordings.</strong> A sample of sessions is recorded through Sentry to
        diagnose errors, and any session in which an error occurs. Recordings are captured with all
        text masked and images blocked, so they show how the interface was used rather than what was
        written in it.
      </p>

      <h2>How we use it</h2>
      <p>
        To run the service — generating code, hosting your bots, showing you logs. To take payment
        and manage your subscription. To enforce the limits of your plan and protect the service
        from abuse. To find and fix faults. To understand which parts of the product work and which
        don&apos;t. We do not sell your data, and we do not use your projects or conversations to
        train AI models.
      </p>
      <p>
        In EU terms, we process this to perform our contract with you (running the service and
        billing you), and on our legitimate interest in keeping the service working, secure and
        financially viable. Where consent is the right basis, we ask for it.
      </p>

      <h2>Who else processes it</h2>
      <p>
        <strong>Supabase</strong> — database and authentication. <strong>Vercel</strong> — hosting
        of this website. <strong>Fly.io</strong> — the machines your bots run on; your bot&apos;s
        code and its decrypted secrets are sent there for the duration of a run.{" "}
        <strong>Anthropic</strong> and <strong>Google</strong> — the AI models; your project files,
        your message, and relevant console output are sent to them to produce a reply.{" "}
        <strong>Stripe</strong> — payments. <strong>Resend</strong> — the emails we send you about
        your subscription. <strong>Sentry</strong> — errors and session recordings.{" "}
        <strong>PostHog</strong> — product analytics.
      </p>
      <p>
        Some of these process data outside your country under appropriate safeguards.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Projects, files and secrets: until you delete them or delete your account. Assistant
        conversations: the most recent 200 turns per project. Bot console output: the most recent
        2,000 lines per project. Usage and cost records: kept as long as the account exists, since
        they are what our billing and limits are based on. Deleting your account removes all of it,
        and cancels any Stripe customer record we hold for you.
      </p>

      <h2>Your rights</h2>
      <p>
        You can <strong>export</strong> everything we hold about you as a single file, and{" "}
        <strong>delete your account</strong> and all its data, from Settings inside the app — no
        need to ask us. You can also request access, correction or deletion by emailing{" "}
        <a href={`mailto:${brand.email}`}>{brand.email}</a>, and you have the right to complain to
        your local data protection authority.
      </p>

      <h2>Cookies</h2>
      <p>
        Essential cookies keep you signed in. Analytics cookies tell us how the product is used. We
        do not use advertising cookies on this site.
      </p>

      <h2>Contact</h2>
      <p>
        For privacy questions: <a href={`mailto:${brand.email}`}>{brand.email}</a>.
      </p>
    </LegalShell>
  );
}
