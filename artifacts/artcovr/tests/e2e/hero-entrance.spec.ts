import { expect, test } from "@playwright/test";

type HeroState = {
  matchesStaticMedia: boolean;
  opacity: number;
  transform: string;
  transformY: number;
  wordmarkHeight: number;
  wordmarkTop: number;
  clipBottom: number;
  inlineTransformWrites: string[];
};

type IntroArtworkState = {
  total: number;
  rendered: number;
  collapsed: number;
};

const staticMediaQuery =
  "(prefers-reduced-motion: reduce), (pointer: coarse), (max-width: 767px)";

async function installHeroTransformProbe(
  page: import("@playwright/test").Page,
) {
  await page.addInitScript(() => {
    const writes: string[] = [];
    Object.defineProperty(window, "__artcovrHeroTransformWrites", {
      configurable: true,
      value: writes,
    });

    new MutationObserver((records) => {
      for (const record of records) {
        if (
          record.type !== "attributes" ||
          record.attributeName !== "style" ||
          !(record.target instanceof HTMLElement) ||
          !record.target.classList.contains("artcovr-hero-wordmark")
        ) {
          continue;
        }
        writes.push(record.target.style.transform);
      }
    }).observe(document, {
      attributes: true,
      attributeFilter: ["style"],
      subtree: true,
    });
  });
}

async function readHeroState(
  page: import("@playwright/test").Page,
): Promise<HeroState> {
  return page
    .locator(".artcovr-hero-wordmark")
    .evaluate((wordmark, mediaQuery) => {
      const clip = wordmark.parentElement!.getBoundingClientRect();
      const rect = wordmark.getBoundingClientRect();
      const transform = getComputedStyle(wordmark).transform;
      const writes =
        (
          window as typeof window & {
            __artcovrHeroTransformWrites?: string[];
          }
        ).__artcovrHeroTransformWrites || [];

      return {
        matchesStaticMedia: window.matchMedia(mediaQuery).matches,
        opacity: Number.parseFloat(getComputedStyle(wordmark).opacity),
        transform,
        transformY: transform === "none" ? 0 : new DOMMatrix(transform).m42,
        wordmarkHeight: rect.height,
        wordmarkTop: rect.top,
        clipBottom: clip.bottom,
        inlineTransformWrites: [...writes],
      };
    }, staticMediaQuery);
}

async function openHome(
  browser: import("@playwright/test").Browser,
  options: Parameters<import("@playwright/test").Browser["newContext"]>[0],
) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await installHeroTransformProbe(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".artcovr-hero-wordmark")).toBeAttached();
  return { context, page };
}

async function readIntroArtworkState(
  page: import("@playwright/test").Page,
): Promise<IntroArtworkState> {
  return page.locator("#artcovr-preloader img").evaluateAll((images) => {
    const states = images.map((image) => {
      const rect = image.getBoundingClientRect();
      return {
        rendered:
          image.complete &&
          image.naturalWidth > 0 &&
          rect.width > 1 &&
          rect.height > 1,
        collapsed: rect.width <= 1 && rect.height <= 1,
      };
    });

    return {
      total: states.length,
      rendered: states.filter(({ rendered }) => rendered).length,
      collapsed: states.filter(({ collapsed }) => collapsed).length,
    };
  });
}

test("animated desktop stages the hero before the curtain opens, then reveals it without inline transform writes", async ({
  browser,
}) => {
  const { context, page } = await openHome(browser, {
    ...test.info().project.use,
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "no-preference",
    hasTouch: false,
  });

  try {
    const initial = await readHeroState(page);
    expect(initial.matchesStaticMedia).toBe(false);
    expect(initial.transform).not.toBe("none");
    expect(initial.opacity).toBe(0);
    expect(initial.transformY).toBeGreaterThan(0);
    expect(initial.transformY).toBeLessThan(initial.wordmarkHeight * 0.35);
    expect(initial.inlineTransformWrites).toEqual([]);
    await expect(page.locator("#hero-title")).toHaveCSS("opacity", "0");

    await expect(page.locator("#artcovr-preloader")).toHaveCount(0, {
      timeout: 8_000,
    });
    await expect
      .poll(async () => (await readHeroState(page)).transform)
      .toBe("none");
    await expect.poll(async () => (await readHeroState(page)).opacity).toBe(1);
    await expect(page.locator(".artcovr-hero-wordmark")).toBeVisible();
    await expect(page.locator("#hero-title")).toHaveCSS("opacity", "1");
    expect((await readHeroState(page)).inlineTransformWrites).toEqual([]);
  } finally {
    await context.close();
  }
});

test("mobile intro renders its artwork stack before collapsing it on exit", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 402, height: 874 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();

  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const preloader = page.locator("#artcovr-preloader");
    const artwork = page.locator("#artcovr-preloader img");
    await expect(preloader).toBeVisible();
    await expect(artwork).not.toHaveCount(0);

    const initial = await readIntroArtworkState(page);
    expect(initial.total).toBeGreaterThan(1);
    await expect
      .poll(async () => (await readIntroArtworkState(page)).rendered, {
        timeout: 3_500,
      })
      .toBeGreaterThan(0);
    await expect(preloader).toHaveAttribute(
      "aria-label",
      /Loading \d+ percent/,
    );

    await expect
      .poll(async () => (await readIntroArtworkState(page)).collapsed, {
        timeout: 6_000,
      })
      .toBe(initial.total);
    await expect(preloader).toHaveAttribute("aria-hidden", "true");
    await expect(preloader).toBeAttached();

    await expect(preloader).toHaveCount(0, { timeout: 2_000 });
  } finally {
    await context.close();
  }
});

test.describe("static presentations keep the hero wordmark visible without the entrance timeline", () => {
  const presentations = [
    {
      name: "reduced motion",
      preloader: "skip" as const,
      options: {
        viewport: { width: 1440, height: 1000 },
        reducedMotion: "reduce" as const,
        hasTouch: false,
      },
    },
    {
      name: "coarse pointer",
      preloader: "complete" as const,
      options: {
        viewport: { width: 1440, height: 1000 },
        reducedMotion: "no-preference" as const,
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: "narrow screen",
      preloader: "complete" as const,
      options: {
        viewport: { width: 640, height: 900 },
        reducedMotion: "no-preference" as const,
        hasTouch: false,
      },
    },
  ] as const;

  for (const presentation of presentations) {
    test(`${presentation.name} renders the wordmark in its final position`, async ({
      browser,
    }) => {
      const { context, page } = await openHome(browser, presentation.options);

      try {
        const initial = await readHeroState(page);
        expect(initial.matchesStaticMedia).toBe(true);
        expect(initial.transform).toBe("none");
        expect(initial.wordmarkTop).toBeLessThan(initial.clipBottom);

        await expect(page.locator(".artcovr-hero-wordmark")).toBeVisible();
        await expect(page.locator("#artcovr-preloader")).toHaveCount(0, {
          timeout: presentation.preloader === "skip" ? 1_000 : 8_000,
        });
        await expect(page.locator("#page")).not.toHaveAttribute(
          "aria-hidden",
          "true",
        );
        await expect(page.locator("#page")).not.toHaveAttribute("inert", "");
        const after = await readHeroState(page);
        expect(after.transform).toBe("none");
        expect(after.wordmarkTop).toBeLessThan(after.clipBottom);
        expect(after.inlineTransformWrites).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});

test("home header logo waits until the oversized hero wordmark is passed", async ({
  browser,
}) => {
  const { context, page } = await openHome(browser, {
    ...test.info().project.use,
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    hasTouch: false,
  });

  try {
    const brand = page.locator('a[aria-label="ARTCOVR home"]');
    await expect(page.locator("#artcovr-preloader")).toHaveCount(0, {
      timeout: 8_000,
    });
    await expect(brand).toHaveAttribute("aria-hidden", "true");
    await expect(brand).toHaveAttribute("tabindex", "-1");

    await page.evaluate(() => {
      const wordmark = document.querySelector<HTMLElement>("#hero-wordmark");
      if (!wordmark) throw new Error("Hero wordmark target is missing");
      const documentBottom =
        wordmark.getBoundingClientRect().bottom + window.scrollY;
      window.scrollTo(0, documentBottom + 1);
    });

    await expect(brand).toHaveAttribute("aria-hidden", "false");
    await expect(brand).not.toHaveAttribute("tabindex");
    await expect(brand).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(brand).toHaveAttribute("aria-hidden", "true");
    await expect(brand).toHaveAttribute("tabindex", "-1");
  } finally {
    await context.close();
  }
});
