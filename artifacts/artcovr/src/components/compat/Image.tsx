import type { CSSProperties, ImgHTMLAttributes } from "react";

type ImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  fill?: boolean;
  priority?: boolean;
  preload?: boolean;
  unoptimized?: boolean;
};

export default function Image({
  fill,
  priority,
  preload,
  unoptimized,
  className,
  style,
  ...props
}: ImageProps) {
  const fillStyle: CSSProperties = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%" }
    : {};
  return (
    <img
      {...props}
      className={className}
      style={{ ...fillStyle, ...style }}
      loading={priority || preload ? "eager" : props.loading}
    />
  );
}