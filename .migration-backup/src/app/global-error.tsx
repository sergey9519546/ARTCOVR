"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: "2rem", fontFamily: "system-ui, sans-serif", background: "#f3ecd9", color: "#000" }}>
        <div style={{ maxWidth: "600px", margin: "10vh auto", textAlign: "center" }}>
          <h1 style={{ fontSize: "2rem", marginBottom: "1rem" }}>Something went wrong</h1>
          <p style={{ color: "#555", marginBottom: "2rem" }}>The page encountered an unexpected error. Try reloading.</p>
          <button
            onClick={() => reset()}
            style={{ padding: "0.75rem 1.5rem", background: "#122519", color: "#f3ecd9", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "1rem" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
