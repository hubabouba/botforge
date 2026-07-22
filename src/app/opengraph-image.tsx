import { ImageResponse } from "next/og";
import { brand } from "@/lib/brand";

// Branded 1200×630 social preview card, generated from code (no static asset).
// Next wires this to og:image / twitter:image automatically — it's the picture
// Facebook, Telegram, etc. show when the link is shared. Kept within Satori's
// CSS subset (flexbox + gradients only).
export const runtime = "edge";
export const alt = "Botforge — the AI lab for building bots";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          backgroundColor: "#080A0F",
          // Aurora-ish glow, same indigo→cyan brand accent as the site.
          backgroundImage:
            "radial-gradient(900px 500px at 15% 0%, rgba(99,102,241,0.28), transparent 60%), radial-gradient(800px 500px at 100% 100%, rgba(34,211,238,0.20), transparent 55%)",
        }}
      >
        {/* Eyebrow */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            fontSize: 30,
            color: "rgba(255,255,255,0.62)",
            fontWeight: 500,
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              background: "linear-gradient(90deg, #6366F1, #22D3EE)",
            }}
          />
          The AI lab for building bots
        </div>

        {/* Wordmark */}
        <div
          style={{
            marginTop: 28,
            fontSize: 150,
            fontWeight: 800,
            letterSpacing: "-4px",
            lineHeight: 1,
            color: "transparent",
            backgroundImage: "linear-gradient(100deg, #FFFFFF 10%, #818CF8 55%, #22D3EE 100%)",
            backgroundClip: "text",
            // @ts-expect-error — Satori honors the vendor-prefixed prop
            "-webkit-background-clip": "text",
          }}
        >
          {brand.name}
        </div>

        {/* Value line */}
        <div
          style={{
            marginTop: 34,
            maxWidth: 940,
            fontSize: 44,
            lineHeight: 1.28,
            color: "rgba(255,255,255,0.86)",
            fontWeight: 500,
          }}
        >
          Describe a bot in plain words — AI writes real, working code for Telegram &amp; Discord.
        </div>

        {/* Footer chips */}
        <div style={{ display: "flex", gap: "16px", marginTop: 48 }}>
          {["Real code", "Run & host", "Download ZIP"].map((chip) => (
            <div
              key={chip}
              style={{
                display: "flex",
                fontSize: 27,
                color: "rgba(255,255,255,0.72)",
                padding: "12px 24px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.04)",
              }}
            >
              {chip}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
