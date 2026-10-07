import { useArtworkOrderPreference } from "@/lib/artcovr/artwork-order-preference-context";

export function ArtworkOrderPreferenceControl({
  className = "",
}: {
  className?: string;
}) {
  const {
    preference,
    isReady,
    isSaving,
    statusMessage,
    choosePreference,
  } = useArtworkOrderPreference();
  const options = [
    { value: "rotate" as const, label: "Rotation" },
    { value: "shuffle" as const, label: "Shuffle" },
  ];

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-xs font-semibold tracking-wide text-current/70">
        Each visit
      </span>
      <div
        role="group"
        aria-label="Artwork order preference"
        className="flex flex-wrap gap-1"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="discovery-pill min-h-10"
            aria-pressed={preference === option.value}
            disabled={!isReady || isSaving}
            onClick={() => void choosePreference(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {isSaving ? "Saving artwork preference." : statusMessage}
      </span>
    </div>
  );
}
