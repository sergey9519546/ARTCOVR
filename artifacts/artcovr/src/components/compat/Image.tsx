import type { CSSProperties, ImgHTMLAttributes } from "react";

type ImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  fill?: boolean;
  priority?: boolean;
  preload?: boolean;
  unoptimized?: boolean;
};

function optimizedArtworkSources(src: string | undefined) {
  if (!src?.startsWith("/assets/artworks/") || !src.endsWith(".jpg")) {
    return null;
  }
  const filename = src.slice("/assets/artworks/".length, -".jpg".length);
  return {
    full: `/assets/artworks/optimized/${filename}.webp`,
    compact: `/assets/artworks/optimized/${filename}-640.webp`,
  };
}

export default function Image({
  fill,
  priority,
  preload,
  unoptimized,
  className,
  style,
  src,
  ...props
}: ImageProps) {
  const fillStyle: CSSProperties = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%" }
    : {};
  const optimizedSources = optimizedArtworkSources(src);
  const image = (
    <img
      {...props}
      src={src}
      className={className}
      style={{ ...fillStyle, ...style }}
      loading={priority || preload ? "eager" : props.loading}
      decoding={props.decoding ?? "async"}
    />
  );

  if (!optimizedSources) return image;

  return (
    <picture>
      <source
        srcSet={`${optimizedSources.compact} 640w, ${optimizedSources.full} 1280w`}
        sizes={props.sizes}
        type="image/webp"
      />
      {image}
    </picture>
  );
}