import { expect, test } from "@playwright/test";

type HeroState = {
  matchesStaticMedia: boolean;
  transform: string;
  transformY: number;
  wordmarkHeight: number;
  wordmarkTop: number;
  clipBottom: number;
  inlineTransformWrites: string[];
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

test("animated desktop starts the hero wordmark off-canvas, then reveals it after the preloader", async ({
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
    expect(initial.transformY).toBeGreaterThanOrEqual(
      initial.wordmarkHeight * 0.9,
    );

    await expect(page.locator("#artcovr-preloader")).toHaveCount(0, {
      timeout: 8_000,
    });
    await expect
      .poll(async () => (await readHeroState(page)).transform)
      .toBe("none");
    await expect(page.locator(".artcovr-hero-wordmark")).toBeVisible();
  } finally {
    await context.close();
  }
});

test.describe("static presentations keep the hero wordmark visible without the entrance timeline", () => {
  const presentations = [
    {
      name: "reduced motion",
      options: {
        viewport: { width: 1440, height: 1000 },
        reducedMotion: "reduce" as const,
        hasTouch: false,
      },
    },
    {
      name: "coarse pointer",
      options: {
        viewport: { width: 1440, height: 1000 },
        reducedMotion: "no-preference" as const,
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: "narrow screen",
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
          timeout: 8_000,
        });
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
