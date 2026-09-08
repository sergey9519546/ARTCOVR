import Link from "@/components/compat/Link";
import { trackEvent } from "@/lib/artcovr/analytics";

export function Hero() {
  return (
    <div className="px-4 lg:px-6" id="home-hero">
      <div className="mt-26 mb-6">
        <div className="relative overflow-hidden pt-[0.08em]">
          <p
            aria-label="ARTCOVR"
            id="hero-wordmark"
            className="artcovr-wordmark artcovr-hero-wordmark mb-6 text-[19.4vw]"
          >
            ARTCOVR
          </p>
        </div>
        <div id="hero-line" className="mb-6 h-[5px] w-full origin-left bg-current" />
        <div
          id="hero-content"
          className="mb-10 grid grid-cols-8 gap-x-6 gap-y-10 text-xs font-bold md:grid-cols-16 md:gap-6"
        >
          <div className="col-span-3 md:col-span-4">
            <h1 className="uppercase" id="hero-title">Cover art that becomes yours.</h1>
          </div>
          <div className="col-span-5 md:col-span-8">
            <h2 className="mb-4 uppercase" id="hero-subtitle">How it works</h2>
            <p id="hero-paragraph" className="text-sm leading-4 tracking-tight md:max-w-[60%]">
              Select an artwork, describe any change in one freeform prompt, and keep iterating from the visible result. Purchase the direction you want and download your images.
            </p>
          </div>
          <div className="col-span-8 flex h-full flex-col justify-between md:col-span-3">
            <div className="max-w-[22rem]">
              <Link
                className="artcovr-button inline-flex min-h-12 w-full items-center justify-center px-5 py-4 text-center text-[11px] font-bold uppercase tracking-[.08em]"
                id="hero-link"
                href="/archive"
                onClick={() => trackEvent("archive_entry_clicked", { source: "homepage_hero" })}
              >
                Explore the archive <span aria-hidden="true" className="ml-2">↗</span>
              </Link>
              <p className="mt-3 text-xs leading-5 text-current/70">
                Browse owner-approved covers by genre, mood, color, and visual direction.
              </p>
              <Link
                className="link-hover mt-5 inline-block max-w-fit uppercase"
                id="hero-license-link"
                href="/license"
              >
                Commercial license
              </Link>
            </div>
          </div>
          <div className="col-span-5 flex justify-end md:col-span-1" id="hero-copyright">© 2026</div>
          <div className="col-span-8 inline-block md:hidden" id="hero-license-link-mobile">
            <Link
              className="link-hover max-w-fit uppercase"
              href="/license"
            >
              Commercial license
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
