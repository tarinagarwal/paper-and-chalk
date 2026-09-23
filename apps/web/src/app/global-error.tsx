"use client";

/** Last-resort boundary: replaces the root layout, so it cannot rely on the theme or fonts. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#f3f0e8",
          color: "#1c1b19",
          fontFamily: "Georgia, serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 32, fontWeight: 400, margin: "0 0 12px" }}>
            Paper &amp; Chalk hit a problem.
          </h1>
          <p style={{ fontFamily: "system-ui, sans-serif", color: "#6b665e", lineHeight: 1.6 }}>
            Reload the page to continue.{error.digest ? ` Reference: ${error.digest}.` : ""}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 16,
              height: 44,
              padding: "0 20px",
              border: 0,
              borderRadius: 10,
              background: "#c43e18",
              color: "#fff",
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
