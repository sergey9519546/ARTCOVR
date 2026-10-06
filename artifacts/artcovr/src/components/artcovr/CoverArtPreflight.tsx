"use client";

import { useState } from "react";
import {
  checkCoverArtwork,
  type CoverCheckStatus,
  type CoverPlatform,
  type CoverPreflightCheck,
} from "@/lib/artcovr/cover-preflight";

const STATUS_LABELS: Record<CoverCheckStatus, string> = {
  pass: "Meets listed check",
  issue: "Needs a change",
  review: "Review manually",
  info: "Not specified",
};

const STATUS_STYLES: Record<CoverCheckStatus, string> = {
  pass: "border-current/25",
  issue: "border-[#a11212] dark:border-[#ff6b6b]",
  review: "border-[#9b6500] dark:border-[#f2c46d]",
  info: "border-current/25",
};

function CheckItem({ item }: { item: CoverPreflightCheck }) {
  return (
    <li
      data-testid={`status-cover-preflight-check-${item.id}`}
      className={`border-l-2 pl-4 ${STATUS_STYLES[item.status]}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h4 className="font-bold">{item.label}</h4>
        <span className="text-[10px] font-bold uppercase tracking-[.08em] opacity-65">
          {STATUS_LABELS[item.status]}
        </span>
      </div>
      <p className="mt-1 text-sm leading-6 opacity-80">{item.detail}</p>
      {item.correction && (
        <p className="mt-2 text-sm leading-6">
          <span className="font-bold">How to fix or verify:</span> {item.correction}
        </p>
      )}
    </li>
  );
}

export function CoverArtPreflight() {
  const [file, setFile] = useState<File | null>(null);
  const [platforms, setPlatforms] = useState<CoverPlatform[]>([
    "spotify",
    "apple-music",
  ]);
  const [results, setResults] = useState<{
    format: string;
    width: number | null;
    height: number | null;
    results: ReturnType<typeof checkCoverArtwork>["results"];
  } | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  function togglePlatform(platform: CoverPlatform, checked: boolean) {
    setPlatforms((current) =>
      checked
        ? current.includes(platform)
          ? current
          : [...current, platform]
        : current.filter((item) => item !== platform),
    );
    setResults(null);
  }

  async function runCheck() {
    if (!file || platforms.length === 0 || checking) return;
    setChecking(true);
    setError("");
    setResults(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setResults(checkCoverArtwork(bytes, platforms, file.type));
    } catch {
      setError("The selected file could not be read. Choose it again or export a new copy.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <section
      className="mt-10 border-y-2 border-current py-7"
      aria-labelledby="cover-preflight-title"
    >
      <p className="text-[11px] font-bold uppercase tracking-[.1em] opacity-60">
        Local file check
      </p>
      <h2
        id="cover-preflight-title"
        className="mt-2 text-2xl font-extrabold tracking-tight"
      >
        Check your final cover file
      </h2>
      <p className="mt-3 max-w-[68ch] text-sm leading-6 opacity-80">
        Choose the exact exported artwork you plan to deliver. It is checked in
        your browser only: the file is not uploaded, resized, cropped, or
        re-encoded.
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(14rem,.7fr)]">
        <label className="block text-sm font-bold">
          Final artwork file
          <input
            data-testid="input-cover-preflight-file"
            className="mt-2 block min-h-11 w-full border border-current/30 px-3 py-2 text-sm font-normal"
            type="file"
            accept=".jpg,.jpeg,.png,.tif,.tiff,.gif,image/jpeg,image/png,image/tiff,image/gif"
            onChange={(event) => {
              setFile(event.currentTarget.files?.[0] ?? null);
              setResults(null);
              setError("");
            }}
          />
        </label>
        <fieldset className="space-y-3">
          <legend className="text-sm font-bold">Check against</legend>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              data-testid="checkbox-cover-preflight-spotify"
              type="checkbox"
              checked={platforms.includes("spotify")}
              onChange={(event) => togglePlatform("spotify", event.currentTarget.checked)}
            />
            Spotify
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              data-testid="checkbox-cover-preflight-apple-music"
              type="checkbox"
              checked={platforms.includes("apple-music")}
              onChange={(event) =>
                togglePlatform("apple-music", event.currentTarget.checked)
              }
            />
            Apple Music
          </label>
        </fieldset>
      </div>

      <button
        data-testid="button-run-cover-preflight"
        className="artcovr-button mt-5 min-h-11 px-5 py-3 text-xs font-bold uppercase tracking-[.08em] disabled:cursor-not-allowed disabled:opacity-50"
        type="button"
        onClick={() => void runCheck()}
        disabled={!file || platforms.length === 0 || checking}
      >
        {checking ? "Checking file…" : "Run preflight check"}
      </button>
      {platforms.length === 0 && (
        <p className="mt-3 text-sm" role="status">
          Select at least one platform to run the check.
        </p>
      )}
      {file && (
        <p data-testid="text-cover-preflight-selected-file" className="mt-3 break-all text-xs opacity-65">
          Selected: {file.name} · {(file.size / 1_000_000).toFixed(2)} MB
        </p>
      )}
      {error && (
        <p data-testid="alert-cover-preflight" className="mt-4 text-sm" role="alert">
          {error}
        </p>
      )}

      {results && (
        <div data-testid="status-cover-preflight-results" className="mt-8 space-y-8" aria-live="polite">
          <div className="border-l-2 border-[#9b6500] pl-4 dark:border-[#f2c46d]">
            <p className="font-bold">Preflight is not a guarantee of acceptance.</p>
            <p className="mt-1 text-sm leading-6 opacity-80">
              Platforms and distributors can apply additional or updated checks.
              Confirm their current delivery rules and review every item marked
              for manual review.
            </p>
          </div>
          <p className="text-sm">
            Detected {results.format}
            {results.width && results.height
              ? ` · ${results.width} × ${results.height} px`
              : ""}
          </p>
          {results.results.map((result) => (
            <section
              data-testid={`section-cover-preflight-${result.platform}`}
              key={result.platform}
              aria-labelledby={`preflight-${result.platform}`}
            >
              <h3
                id={`preflight-${result.platform}`}
                className="text-xl font-extrabold tracking-tight"
              >
                {result.label}
              </h3>
              <ul className="mt-4 space-y-5">
                {result.checks.map((item) => (
                  <CheckItem key={`${result.platform}-${item.id}`} item={item} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
