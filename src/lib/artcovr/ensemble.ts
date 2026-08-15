// Cross-runtime ensemble + judge voter logic. Pure functions only: no
// filesystem, network, `node:*`, or `Deno.*` symbols, so the same source is
// unit-tested here under Node and imported by the Deno Edge Function worker.

export type DenialReason =
  | "visible_text"
  | "watermark"
  | "logo_or_brand"
  | "recognizable_person"
  | "protected_character";

export const DENIAL_REASONS: readonly DenialReason[] = [
  "visible_text",
  "watermark",
  "logo_or_brand",
  "recognizable_person",
  "protected_character",
];

export type TechnicalCoherence = {
  square: boolean;
  webp: boolean;
  dimensions: { width: number; height: number } | null;
};

export type JudgeScore = {
  technical: TechnicalCoherence;
  denial: DenialReason[];
  aesthetic: number | null;
  novelty: number | null;
  score: number;
  ok: boolean;
  reason: string;
};

export type CandidateResult = {
  index: number;
  digest: string;
  judge: JudgeScore;
};

export type VoterOptions = {
  // weights applied to the (normalised) aesthetic and novelty components of
  // the judge score tiebreak. Aesthetic is on a 0-10 scale; novelty on 0-1.
  aestheticWeight: number;
  noveltyWeight: number;
  // Pre-erected guard: a candidate whose technical.coherence is false is never
  // eligible, even if its judge.score sorts first.
  requireTechnical: boolean;
};

export const DEFAULT_VOTER_OPTIONS: VoterOptions = {
  aestheticWeight: 0.6,
  noveltyWeight: 0.4,
  requireTechnical: true,
};

const asFiniteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export function clampAesthetic(value: number | null): number {
  if (value === null || !Number.isFinite(value)) return 5;
  if (value < 1) return 1;
  if (value > 10) return 10;
  return value;
}

export function clampNovelty(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function normalizeScore(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) {
    return values.map(() => 0.5);
  }
  const span = max - min;
  return values.map((value) => (value - min) / span);
}

// Selects the strongest valid candidate. When the judge is unavailable the
// caller passes candidates whose `judge` is a synthesized fallback; the voter
// then ranks by the same contract so behaviour is identical whether a real
// judge answered or the deterministic fallback stood in.
export type VoterOutcome = {
  winnerIndex: number | null;
  fallbackUsed: boolean;
  reason: string;
  allDenied: boolean;
};

export function pickWinner(
  candidates: CandidateResult[],
  options: VoterOptions = DEFAULT_VOTER_OPTIONS,
): VoterOutcome {
  if (candidates.length === 0) {
    return { winnerIndex: null, fallbackUsed: true, reason: "no_candidates", allDenied: true };
  }
  if (candidates.length === 1) {
    const only = candidates[0];
    if (!only.judge.ok) {
      return { winnerIndex: null, fallbackUsed: true, reason: only.judge.reason || "single_denied", allDenied: true };
    }
    return { winnerIndex: only.index, fallbackUsed: false, reason: "single", allDenied: false };
  }

  const eligible = options.requireTechnical
    ? candidates.filter((candidate) => candidate.judge.ok && candidate.judge.technical.square && candidate.judge.technical.webp)
    : candidates.filter((candidate) => candidate.judge.ok);

  if (eligible.length === 0) {
    return { winnerIndex: null, fallbackUsed: true, reason: "all_denied", allDenied: true };
  }
  if (eligible.length === 1) {
    return { winnerIndex: eligible[0].index, fallbackUsed: false, reason: "one_eligible", allDenied: false };
  }

  const aestheticRaw = eligible.map((candidate) => clampAesthetic(asFiniteNumber(candidate.judge.aesthetic)) / 10);
  const aesthetic = normalizeScore(aestheticRaw);
  const noveltyRaw = eligible.map((candidate) => {
    const value = asFiniteNumber(candidate.judge.novelty);
    return clampNovelty(value) ?? 0.5;
  });
  const novelty = normalizeScore(noveltyRaw);

  let bestOverall = -Infinity;
  let bestIndex = -1;
  let tieCount = 0;
  for (let position = 0; position < eligible.length; position += 1) {
    const candidate = eligible[position];
    const combined = options.aestheticWeight * aesthetic[position] + options.noveltyWeight * novelty[position];
    const baseScore = Number.isFinite(candidate.judge.score) ? candidate.judge.score : 0;
    const overall = baseScore + combined;
    if (overall > bestOverall + 1e-9) {
      bestOverall = overall;
      bestIndex = position;
      tieCount = 1;
    } else if (Math.abs(overall - bestOverall) <= 1e-9) {
      tieCount += 1;
      // Deterministic tiebreak: lowest digest then lowest candidate index, so
      // reruns with identical inputs pick the same winner.
      const current = eligible[position];
      const incumbent = eligible[bestIndex];
      if (current.digest < incumbent.digest || (current.digest === incumbent.digest && current.index < incumbent.index)) {
        bestIndex = position;
      }
    }
  }
  const fallbackUsed = tieCount > 1;
  const winner = eligible[bestIndex];
  return {
    winnerIndex: winner.index,
    fallbackUsed,
    reason: tieCount > 1 ? "tiebreak" : "best",
    allDenied: false,
  };
}

// Turns a single prompt into a brace of modestly-differentiated variants so a
// degenerate failure mode (all N edits land on the same composition) does not
// silently waste the extra provider spend.
export function augmentPrompt(prompt: string, index: number, total: number): string {
  const trimmed = prompt.trim();
  if (total <= 1 || index < 0 || index >= total) return trimmed;
  const modifiers = [
    "",
    "Refine the composition with stronger negative space and higher visual contrast.",
    "Emphasise texture and depth; keep the subject legible.",
    "Strengthen the focal hierarchy and calm the background.",
    "Balance the colour weight across the frame.",
  ];
  const modifier = modifiers[index % modifiers.length];
  return modifier ? `${trimmed} ${modifier}` : trimmed;
}

// A cheap, content-derived tiebreak used when no judge is reachable: the
// normalised count of distinct byte values across a fixed sample window. A
// renderer that returned an identical proxy for every prompt collapses to
// entropy 0 across the ensemble, which is itself a signal worth logging.
export function sampleEntropy(bytes: Uint8Array, windowSize = 4096): number {
  if (bytes.byteLength === 0) return 0;
  const window = Math.min(windowSize, bytes.byteLength);
  const counts = new Float32Array(256);
  for (let offset = 0; offset < window; offset += 1) {
    counts[bytes[offset]] += 1;
  }
  const denominator = window;
  let entropy = 0;
  for (let value = 0; value < 256; value += 1) {
    if (counts[value] === 0) continue;
    const probability = counts[value] / denominator;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

// Fallback rank when the judge is offline: technical coherence (caller-supplied
// via the raster validator) plus sample entropy. Returns aCandidate that is
// technically valid; null if none are. Purely deterministic.
export function fallbackWinner(
  candidates: Array<{ index: number; digest: string; technical: TechnicalCoherence; bytes: Uint8Array }>,
): VoterOutcome & { winnerIndex: number | null } {
  if (candidates.length === 0) {
    return { winnerIndex: null, fallbackUsed: true, reason: "no_candidates", allDenied: true };
  }
  const valid = candidates.filter((candidate) => candidate.technical.square && candidate.technical.webp);
  if (valid.length === 0) {
    return { winnerIndex: null, fallbackUsed: true, reason: "no_valid_raster", allDenied: true };
  }
  if (valid.length === 1) {
    return { winnerIndex: valid[0].index, fallbackUsed: true, reason: "single_valid", allDenied: false };
  }
  const entropies = valid.map((candidate) => sampleEntropy(candidate.bytes));
  const ent = normalizeScore(entropies);
  let best = -Infinity;
  let bestIndex = 0;
  for (let position = 0; position < valid.length; position += 1) {
    if (ent[position] > best + 1e-9) {
      best = ent[position];
      bestIndex = position;
    }
  }
  return { winnerIndex: valid[bestIndex].index, fallbackUsed: true, reason: "entropy_rank", allDenied: false };
}

export type JudgeEpoch = {
  model: string;
  candidateIndex: number;
  selected: boolean;
  denial: DenialReason[];
  aesthetic: number | null;
  novelty: number | null;
  score: number;
  fallbackUsed: boolean;
  reason: string;
};
