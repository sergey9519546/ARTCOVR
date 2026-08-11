"use client";
import { useState } from "react";
import { HelloHelloLogo } from "./Svgs";

export function Footer() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const subscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setSubscribed(true);
      setEmail("");
      setTimeout(() => setSubscribed(false), 4000);
    }
  };

  return (
    <footer className="mx-auto mb-10 px-4 text-sm lg:px-6">
      <div className="mb-6 h-[5px] w-full bg-current" />
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:gap-8">
        <div className="flex-1 text-[2.75rem] leading-[1] font-[900] tracking-tighter text-balance md:text-[6vw]">
          <p>Made to be worn.</p>
          <p className="red:text-red text-[#5A5A5A]">Or judged. Or both.</p>
        </div>
        <div><p className="text-[45vw] leading-[1] font-[900] tracking-tighter md:text-[12.75vw]">©26</p></div>
      </div>

      {/* Newsletter */}
      <div className="mb-12 border-y border-current/10 py-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-lg font-bold uppercase tracking-tight">Join the list</p>
            <p className="text-sm opacity-60">Get notified about new drops and exclusive offers.</p>
          </div>
          <form onSubmit={subscribe} className="flex gap-2 md:w-96">
            <input
              type="email"
              required
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="flex-1 rounded-full border border-current/20 bg-transparent px-4 py-3 text-sm outline-none focus:border-current"
            />
            <button type="submit" className="rounded-full bg-current px-6 py-3 text-sm font-bold uppercase tracking-tight text-background transition-transform hover:scale-105">
              {subscribed ? "✓" : "Subscribe"}
            </button>
          </form>
        </div>
        {subscribed && <p className="mt-3 text-sm opacity-60">Thanks! You&apos;re on the list.</p>}
      </div>

      <div className="mt-[8rem] mb-4 md:mt-[16rem]">
        <p className="max-w-[52ch] tracking-tight text-balance md:text-2xl">Created by the ++hellohello team, this store and signature collection celebrates our collective creativity and passion for apparel. Carefully designed.</p>
      </div>

      <hr className="mb-6 h-[2px] w-full bg-current" />

      <div className="grid grid-cols-16 gap-x-6 gap-y-20 font-bold md:gap-6">
        <div className="order-last col-span-16 md:order-first md:col-span-4">
          <div className="flex flex-col">
            <a href="https://www.hellohello.is" target="_blank" rel="noreferrer noopener"><HelloHelloLogo className="mb-2" /><span className="sr-only">++hellohello</span></a>
            <span>All rights reserved ©&nbsp;2026</span>
          </div>
        </div>
        <div className="col-span-8 md:col-span-3">Libertad 2529 <br /> Office 102 <br /> Montevideo, Uruguay</div>
        <div className="col-span-8 md:col-span-4">
          <a href="https://www.hellohello.is/privacy-policy" target="_blank" rel="noreferrer noopener" className="link-hover max-w-fit">Privacy Policy</a>
          <br />
          <a href="/faq" className="link-hover max-w-fit">FAQ</a>
          <br />
          <a href="/about" className="link-hover max-w-fit">About</a>
        </div>
        <div className="order-first col-span-16 flex justify-evenly md:order-last md:col-span-5">
          <div className="flex flex-1 flex-col gap-3">
            <a href="https://dribbble.com/hellohelloteam" target="_blank" rel="noreferrer noopener" className="link-hover max-w-fit">Dribbble</a>
            <a href="https://www.instagram.com/hellohelloteam" target="_blank" rel="noreferrer noopener" className="link-hover max-w-fit">Instagram</a>
            <a href="https://www.linkedin.com/company/hellohello" target="_blank" rel="noreferrer noopener" className="link-hover max-w-fit">LinkedIn</a>
            <a href="https://twitter.com/hellohelloteam" target="_blank" rel="noreferrer noopener" className="link-hover max-w-fit">Twitter (X)</a>
          </div>
          <div className="flex flex-1 flex-col gap-3">
            <a href="https://www.hellohello.is/work" target="_blank" rel="noreferrer noopener" className="link-hover max-w-fit">Work</a>
            <a href="https://www.hellohello.is/services" target="_blank" rel="noreferrer noopener" className="link-hover max-w-fit">Services</a>
            <a href="/about" className="link-hover max-w-fit">About</a>
            <a href="https://www.hellohello.is/careers" target="_blank" rel="noreferrer noopener" className="link-hover max-w-fit">Careers</a>
          </div>
          <div className="flex-1">
            <a href="/contact" className="link-hover max-w-fit">Let&apos;s talk</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
