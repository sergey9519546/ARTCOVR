import Link from "next/link";

export function Hero() {
  return (
    <div className="px-4 lg:px-6">
      <div className="mt-26 mb-6">
        <div className="relative overflow-hidden pt-[0.08em]">
          <p
            aria-label="ARTCOVR"
            className="artcovr-wordmark mb-6 text-[19.4vw]"
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
          <div className="col-span-3 flex h-full flex-col justify-between md:col-span-3">
            <div className="flex flex-wrap gap-2">
              <Link
                id="hero-link"
                href="/archive"
                className="rounded-full border border-current/30 px-4 py-2 text-[11px] font-bold uppercase tracking-[.08em] transition-colors hover:border-current"
              >
                Explore archive
              </Link>
              <Link
                id="hero-license-link"
                href="/license"
                className="rounded-full border border-current/30 px-4 py-2 text-[11px] font-bold uppercase tracking-[.08em] transition-colors hover:border-current"
              >
                Commercial license
              </Link>
            </div>
            <p className="mt-4 text-[11px] font-bold uppercase tracking-[.12em] opacity-60">
              Secure Stripe checkout · Commercial license included · 30-day download access
            </p>
          </div>
          <div className="col-span-5 flex justify-end md:col-span-1" id="hero-copyright">© 2026</div>
          <div className="col-span-8 inline-block md:hidden" id="hero-license-link-mobile">
            <Link
              href="/license"
              className="rounded-full border border-current/30 px-4 py-2 text-[11px] font-bold uppercase tracking-[.08em] transition-colors hover:border-current"
            >
              Commercial license
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
