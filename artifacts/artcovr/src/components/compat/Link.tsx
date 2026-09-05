import type { AnchorHTMLAttributes } from "react";
import { Link as WouterLink, type LinkProps } from "wouter";

type RoutePreloader = () => Promise<unknown>;
type LinkEventProps = Pick<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "onFocus" | "onMouseEnter" | "onPointerDown"
>;
type PrefetchLinkProps = LinkProps & LinkEventProps;

const routePreloaders: Array<{
  matches: (pathname: string) => boolean;
  load: RoutePreloader;
}> = [
  { matches: (pathname) => pathname === "/about", load: () => import("@/app/about/page") },
  { matches: (pathname) => pathname === "/archive", load: () => import("@/app/archive/page") },
  { matches: (pathname) => pathname === "/auth/callback", load: () => import("@/app/auth/callback/page") },
  { matches: (pathname) => pathname.startsWith("/checkout/"), load: () => import("@/app/checkout/[slug]/page") },
  { matches: (pathname) => pathname === "/contact", load: () => import("@/app/contact/page") },
  { matches: (pathname) => pathname === "/faq", load: () => import("@/app/faq/page") },
  { matches: (pathname) => pathname === "/legal/privacy", load: () => import("@/app/legal/privacy/page") },
  { matches: (pathname) => pathname === "/legal/terms", load: () => import("@/app/legal/terms/page") },
  { matches: (pathname) => pathname === "/license", load: () => import("@/app/license/page") },
  { matches: (pathname) => pathname === "/my-images", load: () => import("@/app/my-images/page") },
  { matches: (pathname) => pathname === "/catalog-intelligence", load: () => import("@/app/catalog-intelligence/page") },
  { matches: (pathname) => pathname.startsWith("/product/"), load: () => import("@/app/product/[slug]/page") },
  { matches: (pathname) => pathname === "/refunds", load: () => import("@/app/refunds/page") },
  { matches: (pathname) => pathname.startsWith("/sign-in"), load: () => import("@/app/sign-in/page") },
  { matches: (pathname) => pathname.startsWith("/sign-up"), load: () => import("@/app/sign-up/page") },
];

function preloadRoute(href: LinkProps["href"] | LinkProps["to"]) {
  if (typeof href !== "string") return;

  let pathname: string;
  try {
    pathname = new URL(href, window.location.href).pathname;
  } catch {
    return;
  }

  const loader = routePreloaders.find((route) => route.matches(pathname))?.load;
  if (loader) void loader().catch(() => undefined);
}

export default function Link({
  onFocus,
  onMouseEnter,
  onPointerDown,
  ...props
}: PrefetchLinkProps) {
  const warmRoute = () => preloadRoute(props.href ?? props.to);
  const enhancedProps = {
    ...props,
    onFocus: (event: React.FocusEvent<HTMLAnchorElement>) => {
      warmRoute();
      onFocus?.(event);
    },
    onMouseEnter: (event: React.MouseEvent<HTMLAnchorElement>) => {
      warmRoute();
      onMouseEnter?.(event);
    },
    onPointerDown: (event: React.PointerEvent<HTMLAnchorElement>) => {
      warmRoute();
      onPointerDown?.(event);
    },
  } as LinkProps;

  return <WouterLink {...enhancedProps} />;
}