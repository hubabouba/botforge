"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ru">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#fff", color: "#0a0a0a" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "1.5rem",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 420 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Что-то пошло не так</h1>
            <p style={{ color: "#6b7280", marginTop: 8, fontSize: 14 }}>
              Мы уже получили отчёт об ошибке и разбираемся. Попробуйте обновить страницу.
            </p>
            <button
              onClick={() => reset()}
              style={{
                marginTop: 20,
                height: 40,
                padding: "0 20px",
                borderRadius: 10,
                border: "none",
                background: "#4f46e5",
                color: "#fff",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Попробовать снова
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
