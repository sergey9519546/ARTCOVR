import { useEffect, useRef, useState } from "react";
import {
  ArtcovrApiError,
  createGeneration,
  getGenerationStatus,
  type GenerationRequest,
  type GenerationResponse,
  type GenerationStatus,
} from "@/lib/artcovr/functions";

type Phase = "idle" | "generating" | "complete" | "error";
type Callbacks = {
  onAccepted(request: GenerationRequest): void;
  onSuccess(status: GenerationStatus): void | Promise<void>;
  onTerminal(status: "blocked" | "failed" | "timed_out"): void;
};

/** One immutable edit survives effect restarts, lost admission responses and polling retries. */
export function useGenerationJob(callbacks: Callbacks) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [hasPending, setHasPending] = useState(false);
  const pending = useRef<GenerationRequest | undefined>(undefined);
  const jobId = useRef<string | undefined>(undefined);
  const admission = useRef<Promise<GenerationResponse> | undefined>(undefined);
  const accepted = useRef(false);
  const handlers = useRef(callbacks);
  handlers.current = callbacks;

  useEffect(() => {
    if (phase !== "generating") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clearPending = () => {
      pending.current = undefined;
      jobId.current = undefined;
      accepted.current = false;
      setHasPending(false);
    };
    const fail = (cause: unknown) => {
      if (!active) return;
      // Only an explicit admission rejection proves that no job was accepted.
      // Network errors and 5xx responses must retry the same id and payload.
      if (!jobId.current && cause instanceof ArtcovrApiError && cause.status >= 400 && cause.status < 500 && cause.status !== 408) {
        clearPending();
      }
      const detail = cause instanceof Error ? cause.message : "The generation service could not be reached.";
      setMessage(pending.current ? `${detail} Choose Resume generation to check the same edit safely.` : detail);
      setPhase("error");
    };
    const run = async () => {
      try {
        const request = pending.current;
        if (!request) return;
        if (!jobId.current) {
          // Share a promise across Strict Mode/effect restarts; do not POST twice.
          if (!admission.current) {
            admission.current = createGeneration(request).then((response) => {
              jobId.current = response.generationId;
              return response;
            }).finally(() => { admission.current = undefined; });
          }
          await admission.current;
        }
        if (!active) return;
        if (!accepted.current) {
          accepted.current = true;
          handlers.current.onAccepted(request);
        }
        const currentJob = jobId.current!;
        const startedAt = Date.now();
        let attempts = 0;
        const poll = async () => {
          if (!active) return;
          if (Date.now() - startedAt >= 360_000 || attempts >= 180) {
            setMessage("Generation is still processing. Choose Resume generation to check the same edit.");
            setPhase("error");
            return;
          }
          attempts += 1;
          const status = await getGenerationStatus(currentJob);
          if (!active) return;
          if (status.status === "succeeded") {
            if (!status.previewUrl) throw new Error("The generated image is not available yet.");
            clearPending();
            setPhase("complete");
            // Account refresh failure must not turn a finished generation into a failed one.
            void Promise.resolve(handlers.current.onSuccess(status)).catch(() => {
              if (active) setMessage("Image ready. Refresh My Images to update your allowance.");
            });
            return;
          }
          if (status.status === "blocked" || status.status === "failed" || status.status === "timed_out") {
            clearPending();
            handlers.current.onTerminal(status.status);
            setPhase("error");
            return;
          }
          timer = setTimeout(() => void poll().catch(fail), 2000);
        };
        await poll();
      } catch (cause) {
        fail(cause);
      }
    };
    void run();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [phase]);

  function start(request: GenerationRequest) {
    // The ref also closes the double-click window before React renders disabled UI.
    if (pending.current) return;
    pending.current = { ...request, requestId: crypto.randomUUID(), coverText: request.coverText ? { ...request.coverText } : undefined };
    accepted.current = false;
    setHasPending(true);
    setPhase("generating");
  }
  function resume() {
    if (pending.current && phase !== "generating") setPhase("generating");
  }
  return { phase, setPhase, message, setMessage, hasPending, start, resume };
}
