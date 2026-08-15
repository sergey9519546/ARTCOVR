import Link from "next/link";

export function Footer() {
  return (
    <footer className="mx-auto mb-10 px-4 text-sm lg:px-6">
      <div className="mb-6 h-[5px] w-full bg-current" />
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:gap-8">
        <div className="flex-1 text-[2.75rem] leading-[1] font-[900] tracking-tighter text-balance md:text-[6vw]">
          <p>Cover art, made yours.</p>
          <p className="opacity-70">Start with art. Prompt what comes next.</p>
        </div>
        <p className="text-[45vw] leading-[1] font-[900] tracking-tighter md:text-[12.75vw]">©26</p>
      </div>

      <div className="border-y border-current/10 py-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-lg font-bold tracking-tight uppercase">Need an original direction?</p>
            <p className="max-w-xl text-sm opacity-60">Send a custom-work inquiry. It stays separate from artwork checkout.</p>
          </div>
          <Link href="/contact" className="artcovr-button w-fit rounded-full px-6 py-3 text-sm font-bold tracking-tight uppercase transition-transform hover:scale-105">
            Request custom work
          </Link>
        </div>
      </div>

      <div className="mt-[8rem] mb-4 md:mt-[16rem]">
        <p className="max-w-[52ch] text-balance tracking-tight md:text-2xl">Select a square artwork, describe any change in one prompt, and keep each successful generated image with your purchase.</p>
      </div>

      <hr className="mb-6 h-[2px] w-full bg-current" />

      <div className="grid grid-cols-16 gap-x-6 gap-y-20 font-bold md:gap-6">
        <div className="order-last col-span-16 md:order-first md:col-span-4">
          <div className="flex flex-col">
            <span className="artcovr-wordmark mb-2 text-2xl">ARTCOVR</span>
            <span>All rights reserved © 2026</span>
          </div>
        </div>
        <div className="col-span-8 md:col-span-3">
          <Link href="/archive" className="link-hover block w-fit">Archive</Link>
          <Link href="/my-images" className="link-hover block w-fit">My Images</Link>
          <Link href="/contact" className="link-hover block w-fit">Custom inquiry</Link>
        </div>
        <div className="col-span-8 md:col-span-4">
          <Link href="/license" className="link-hover block w-fit">License</Link>
          <Link href="/refunds" className="link-hover block w-fit">Refunds</Link>
          <Link href="/faq" className="link-hover block w-fit">FAQ</Link>
        </div>
        <div className="order-first col-span-16 flex justify-evenly md:order-last md:col-span-5">
          <div className="flex flex-1 flex-col gap-3">
            <Link href="/about" className="link-hover w-fit">About</Link>
            <Link href="/contact" className="link-hover w-fit">Contact</Link>
          </div>
          <div className="flex flex-1 flex-col gap-3">
            <Link href="/legal/privacy" className="link-hover w-fit">Privacy</Link>
            <Link href="/legal/terms" className="link-hover w-fit">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
