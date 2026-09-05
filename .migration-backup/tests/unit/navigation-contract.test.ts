import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PRIMARY_NAV_ITEMS } from "../../src/lib/artcovr/navigation.ts";

const read = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("mobile and inner-page navigation share every primary destination", async () => {
  assert.deepEqual(PRIMARY_NAV_ITEMS, [
    { href: "/", label: "Home" },
    { href: "/archive", label: "Archive" },
    { href: "/my-images", label: "My Images" },
    { href: "/about", label: "About" },
    { href: "/sign-in", label: "Sign in" },
  ]);

  const [mobile, siteHeader, homeHeader] = await Promise.all([
    read("src/components/parity/MobileMenu.tsx"),
    read("src/components/artcovr/SiteHeader.tsx"),
    read("src/components/parity/Header.tsx"),
  ]);
  assert.match(mobile, /PRIMARY_NAV_ITEMS\.map/);
  assert.match(mobile, /aria-current=\{pathname === item\.href/);
  assert.match(siteHeader, /PRIMARY_NAV_ITEMS\.map/);
  assert.match(homeHeader, />my images<\/Link>/);
  assert.doesNotMatch(`${mobile}\n${siteHeader}\n${homeHeader}`, /my cart/i);
});

test("mobile navigation has a shared no-script fallback", async () => {
  const [mobile, css, siteHeader, homeHeader] = await Promise.all([
    read("src/components/parity/MobileMenu.tsx"),
    read("src/app/globals.css"),
    read("src/components/artcovr/SiteHeader.tsx"),
    read("src/components/parity/Header.tsx"),
  ]);

  assert.match(mobile, /artcovr-noscript-nav/);
  assert.match(mobile, /PRIMARY_NAV_ITEMS\.map/);
  assert.match(css, /@media \(scripting: none\) and \(max-width: 767px\)/);
  assert.match(css, /\.artcovr-noscript-nav/);
  assert.match(css, /\.artcovr-js-menu-trigger/);
  assert.match(siteHeader, /artcovr-js-menu-trigger/);
  assert.match(homeHeader, /artcovr-js-menu-trigger/);
});
