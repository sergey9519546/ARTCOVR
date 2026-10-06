export const COVER_ART_GUIDANCE_REVIEWED_ON = "2026-10-06";

export type CoverArtImageFormat = "JPEG" | "PNG" | "TIFF" | "GIF" | "WEBP";

type CoverArtPlatformRequirement = {
  label: string;
  minimumDimension: number;
  maximumDimension: number | null;
  aspectRatio: string;
  formats: readonly CoverArtImageFormat[];
  losslessEncoding: boolean;
  color: {
    mode: string;
    bitsPerPixel: number;
    colorSpace: string;
    profilePlacement: string;
  } | null;
  orientationMetadata: "avoid" | "unspecified";
  doNotUpscale: boolean;
  source: {
    title: string;
    publisher: string;
    href: string;
    description: string;
  };
};

export const COVER_ART_PLATFORM_REQUIREMENTS: Record<
  "spotify" | "apple-music",
  CoverArtPlatformRequirement
> = {
  spotify: {
    label: "Spotify",
    minimumDimension: 640,
    maximumDimension: 10_000,
    aspectRatio: "1:1",
    formats: ["TIFF", "PNG", "JPEG"],
    losslessEncoding: true,
    color: {
      mode: "RGB",
      bitsPerPixel: 24,
      colorSpace: "sRGB",
      profilePlacement: "applied-to-values",
    },
    orientationMetadata: "avoid",
    doNotUpscale: true,
    source: {
      title: "Cover art requirements",
      publisher: "Spotify for Artists",
      href: "https://support.spotify.com/us/artists/article/cover-art-requirements",
      description:
        "Official guidance for Spotify cover-art dimensions, formats, aspect ratio, color handling, and upscaling.",
    },
  },
  "apple-music": {
    label: "Apple Music for Artists",
    minimumDimension: 4_000,
    maximumDimension: null,
    aspectRatio: "1:1",
    formats: ["JPEG", "PNG", "GIF"],
    losslessEncoding: false,
    color: null,
    orientationMetadata: "unspecified",
    doNotUpscale: false,
    source: {
      title: "Album cover art on Apple Music",
      publisher: "Apple Music for Artists",
      href: "https://artists.apple.com/support/1120-cover-art",
      description:
        "Official Apple Music cover-art dimensions, formats, and additional content guidelines.",
    },
  },
};

export function formatCoverArtFormat(format: CoverArtImageFormat) {
  return format === "JPEG" ? "JPG" : format;
}

export function formatCoverArtFormats(formats: readonly CoverArtImageFormat[]) {
  const labels = formats.map(formatCoverArtFormat);
  if (labels.length < 2) return labels[0] ?? "";
  if (labels.length === 2) return labels.join(" or ");
  return `${labels.slice(0, -1).join(", ")}, or ${labels.at(-1)}`;
}

export function formatCoverArtDimension(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function describeCoverArtDimensions(
  requirements: CoverArtPlatformRequirement,
) {
  const minimum = formatCoverArtDimension(requirements.minimumDimension);
  return requirements.maximumDimension === null
    ? `at least ${minimum} px on each side`
    : `${minimum}–${formatCoverArtDimension(requirements.maximumDimension)} px on each side`;
}
