import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ArtworkOrderPreferenceMode } from "@workspace/api-client-react";
import { trackEvent } from "./analytics";
import {
  ARTWORK_ORDER_PREFERENCE_STORAGE_KEY,
  DEFAULT_ARTWORK_ORDER_PREFERENCE,
  getOrCreateArtworkVisitIndex,
  isArtworkOrderPreference,
  readBrowserArtworkOrderPreference,
  writeBrowserArtworkOrderPreference,
} from "./artwork-order-preference";
import {
  getArtworkOrderPreference,
  putArtworkOrderPreference,
} from "./functions";
import { useArtcovrAuth } from "./auth";

type ArtworkOrderPreferenceState = {
  preference: ArtworkOrderPreferenceMode;
  visitIndex: number;
  isReady: boolean;
  isSaving: boolean;
  statusMessage: string;
  choosePreference(preference: ArtworkOrderPreferenceMode): Promise<void>;
};

const ArtworkOrderPreferenceContext =
  createContext<ArtworkOrderPreferenceState | null>(null);

function getBrowserPreference() {
  try {
    return {
      preference: readBrowserArtworkOrderPreference(window.localStorage),
      storageAvailable: true,
    };
  } catch {
    return { preference: null, storageAvailable: false };
  }
}

function saveBrowserPreference(
  preference: ArtworkOrderPreferenceMode,
) {
  try {
    return writeBrowserArtworkOrderPreference(
      window.localStorage,
      preference,
    );
  } catch {
    return false;
  }
}

export function ArtworkOrderPreferenceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { isLoaded, isSignedIn, userId } = useArtcovrAuth();
  const [preference, setPreference] = useState<ArtworkOrderPreferenceMode>(
    DEFAULT_ARTWORK_ORDER_PREFERENCE,
  );
  const [visitIndex, setVisitIndex] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const syncSequence = useRef(0);
  const preferenceWriteSequence = useRef(0);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    const sequence = ++syncSequence.current;
    setIsReady(false);
    setStatusMessage("");

    const local = getBrowserPreference();
    setPreference(local.preference ?? DEFAULT_ARTWORK_ORDER_PREFERENCE);

    let visit = { visitIndex: 1, persisted: false };
    try {
      visit = getOrCreateArtworkVisitIndex(
        window.sessionStorage,
        window.localStorage,
      );
    } catch {
      // The helper handles individual storage failures; retain a stable
      // in-memory order if the browser denies both storage APIs.
    }
    setVisitIndex(visit.visitIndex);

    const storageWarning = !visit.persisted || !local.storageAvailable
      ? "Browser storage is unavailable; this order may not carry to a later visit."
      : "";

    if (!isSignedIn) {
      setStatusMessage(storageWarning);
      setIsReady(true);
      return () => {
        cancelled = true;
      };
    }

    void getArtworkOrderPreference()
      .then(async (accountState) => {
        if (cancelled || sequence !== syncSequence.current) return;

        if (accountState.preference) {
          setPreference(accountState.preference);
          const localSaved = saveBrowserPreference(accountState.preference);
          setStatusMessage(
            localSaved
              ? storageWarning
              : "Your account preference loaded, but this browser could not cache it.",
          );
          return;
        }

        if (local.preference) {
          try {
            await putArtworkOrderPreference({
              preference: local.preference,
            });
            if (cancelled || sequence !== syncSequence.current) return;
            setStatusMessage(
              "Your browser's artwork preference was saved to your account.",
            );
          } catch {
            if (cancelled || sequence !== syncSequence.current) return;
            setStatusMessage(
              "This browser remembers your preference, but your account could not be updated.",
            );
          }
          return;
        }

        setStatusMessage(storageWarning);
      })
      .catch(() => {
        if (cancelled || sequence !== syncSequence.current) return;
        setStatusMessage(
          local.preference
            ? "Your browser remembers this preference, but your account could not be reached."
            : "Your account preference could not be loaded; Rotation is active for now.",
        );
      })
      .finally(() => {
        if (!cancelled && sequence === syncSequence.current) setIsReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, userId]);

  useEffect(() => {
    const syncFromOtherTab = (event: StorageEvent) => {
      if (
        event.key !== ARTWORK_ORDER_PREFERENCE_STORAGE_KEY &&
        event.key !== null
      ) {
        return;
      }
      preferenceWriteSequence.current += 1;
      setPreference(
        isArtworkOrderPreference(event.newValue)
          ? event.newValue
          : DEFAULT_ARTWORK_ORDER_PREFERENCE,
      );
    };
    window.addEventListener("storage", syncFromOtherTab);
    return () => window.removeEventListener("storage", syncFromOtherTab);
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !isReady) return;

    const refreshFromAccount = () => {
      if (document.visibilityState === "hidden") return;
      const sequence = preferenceWriteSequence.current;
      void getArtworkOrderPreference()
        .then((accountState) => {
          if (
            sequence !== preferenceWriteSequence.current ||
            !accountState.preference
          ) {
            return;
          }
          setPreference(accountState.preference);
          saveBrowserPreference(accountState.preference);
        })
        .catch(() => {
          // Keep the last confirmed preference if a refresh is temporarily
          // unavailable; the next focus or interval will retry.
        });
    };

    window.addEventListener("focus", refreshFromAccount);
    document.addEventListener("visibilitychange", refreshFromAccount);
    const interval = window.setInterval(refreshFromAccount, 60_000);
    return () => {
      window.removeEventListener("focus", refreshFromAccount);
      document.removeEventListener("visibilitychange", refreshFromAccount);
      window.clearInterval(interval);
    };
  }, [isLoaded, isReady, isSignedIn, userId]);

  const choosePreference = useCallback(
    async (nextPreference: ArtworkOrderPreferenceMode) => {
      if (!isReady || isSaving || nextPreference === preference) return;

      preferenceWriteSequence.current += 1;
      setPreference(nextPreference);
      const localSaved = saveBrowserPreference(nextPreference);
      setStatusMessage("");
      trackEvent("artwork_order_preference_changed", {
        preference: nextPreference,
      });

      if (!isSignedIn) {
        setStatusMessage(
          localSaved
            ? "Your artwork preference is saved in this browser."
            : "Your artwork preference is active for this visit only; browser storage is unavailable.",
        );
        return;
      }

      setIsSaving(true);
      try {
        await putArtworkOrderPreference({ preference: nextPreference });
        setStatusMessage(
          localSaved
            ? "Your artwork preference is saved to your account."
            : "Your account preference is saved, but this browser could not cache it.",
        );
      } catch {
        setStatusMessage(
          localSaved
            ? "Your preference is saved in this browser, but your account could not be updated."
            : "Your preference could not be saved to your browser or account.",
        );
      } finally {
        setIsSaving(false);
      }
    },
    [isReady, isSaving, isSignedIn, preference],
  );

  const contextValue = useMemo(
    () => ({
      preference,
      visitIndex,
      isReady,
      isSaving,
      statusMessage,
      choosePreference,
    }),
    [
      preference,
      visitIndex,
      isReady,
      isSaving,
      statusMessage,
      choosePreference,
    ],
  );

  return (
    <ArtworkOrderPreferenceContext.Provider value={contextValue}>
      {children}
    </ArtworkOrderPreferenceContext.Provider>
  );
}

export function useArtworkOrderPreference() {
  const value = useContext(ArtworkOrderPreferenceContext);
  if (!value) {
    throw new Error(
      "useArtworkOrderPreference must be used inside ArtworkOrderPreferenceProvider.",
    );
  }
  return value;
}
