import { expect, test } from "@playwright/test";

test.use({ reducedMotion: "no-preference" });

test("home motion hydrates, respects the static gate, and keeps the restored art", async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const isMobile = testInfo.project.name.startsWith("mobile");
  const preloader = page.locator("#artcovr-preloader");

  await expect(preloader).toBeVisible();
  await expect(preloader).toHaveCount(0, { timeout: 8_000 });

  await expect(page.locator("main")).not.toHaveAttribute("inert", "");
  await expect(page.locator("html")).toHaveClass(/loaded/);

  const archiveLink = page.locator("#hero-link");
  await expect(archiveLink).toHaveClass(/link-hover/);
  await expect(archiveLink).not.toHaveClass(/rounded-full/);
  const licenseLink = isMobile
    ? page.locator("#hero-license-link-mobile a")
    : page.locator("#hero-license-link");
  await expect(licenseLink).toHaveClass(/link-hover/);
  await expect(licenseLink).not.toHaveClass(/rounded-full/);

  const artworkLinks = page.locator(
    'section[aria-labelledby="selected-artworks"] a[data-artwork="true"]',
  );
  await expect.poll(() => artworkLinks.count()).toBeGreaterThanOrEqual(3);
  const imageState = await artworkLinks.evaluateAll(async (allLinks) => {
    const links = allLinks.slice(0, 3);
    const images = links.map((link) => link.querySelector("img") as HTMLImageElement);
    images.forEach((image) => {
      image.loading = "eager";
    });
    await Promise.all(
      images.map(
        (image) =>
          image.complete ||
          new Promise<void>((resolve) => {
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          }),
      ),
    );
    return {
      paths: links.map((link) => (link as HTMLAnchorElement).pathname),
      widths: images.map((image) => image.naturalWidth),
    };
  });
  expect(imageState.widths.every((width) => width > 0)).toBe(true);
  const isPublicCatalog =
    process.env.PLAYWRIGHT_EXPECT_PUBLIC_CATALOG === "1" ||
    imageState.paths[0] === "/product/graphic-surrealist-minimalism";
  if (isPublicCatalog) {
    expect(imageState.paths).toEqual([
      "/product/graphic-surrealist-minimalism",
      "/product/graphic-surrealist-collage",
      "/product/graphic-surreal-pop",
    ]);
    await expect(artworkLinks.nth(14)).toHaveAttribute(
      "href",
      "/product/electric-cobalt-minimalist",
    );
  }
  await expect(
    page.locator('[aria-labelledby="selected-artworks"] [data-artwork-runway]'),
  ).toHaveCount(1);
  const runway = page.locator("[data-artwork-runway]");

  const journey = page.locator('section[aria-label="ARTCOVR archive journey"]');
  if (isMobile) {
    await expect(runway).not.toHaveAttribute("data-runway-motion", "true");
    await expect(runway).toHaveCSS("overflow-x", "auto");
    const staticRunway = await runway.evaluate((element) => {
      const before = element.scrollLeft;
      element.scrollLeft = 120;
      return {
        cards: element.querySelectorAll('a[data-artwork="true"]').length,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        before,
        after: element.scrollLeft,
      };
    });
    expect(staticRunway.cards).toBe(5);
    expect(staticRunway.scrollWidth).toBeGreaterThan(staticRunway.clientWidth);
    expect(staticRunway.after).toBeGreaterThan(staticRunway.before);
    await expect(journey).toHaveCount(0);
    await expect(page.locator('section[aria-label="The ARTCOVR archive"]')).toBeVisible();
  } else {
    await expect(runway).toHaveAttribute("data-runway-motion", "true");
    await expect(runway).toHaveCSS("overflow-x", "hidden");
    const runwayTrack = page.locator("[data-runway-track]");
    const runwayMetrics = await runway.evaluate((element) => ({
      top: element.getBoundingClientRect().top + window.scrollY,
      range: element.clientHeight + window.innerHeight,
      viewportHeight: window.innerHeight,
    }));
    const scrollImmediately = async (target: number) => {
      await page.evaluate((nextTarget) => {
        const lenis = (
          window as Window & {
            __lenis?: {
              scrollTo: (
                value: number,
                options: { immediate: boolean },
              ) => void;
            };
          }
        ).__lenis;
        if (lenis) lenis.scrollTo(nextTarget, { immediate: true });
        else window.scrollTo(0, nextTarget);
      }, target);
    };
    await scrollImmediately(
      runwayMetrics.top -
        runwayMetrics.viewportHeight +
        runwayMetrics.range * 0.2,
    );
    await page.waitForTimeout(900);
    const runwayStartTransform = await runwayTrack.evaluate(
      (element) => getComputedStyle(element).transform,
    );
    await scrollImmediately(
      runwayMetrics.top -
        runwayMetrics.viewportHeight +
        runwayMetrics.range * 0.8,
    );
    await expect
      .poll(() =>
        runwayTrack.evaluate((element) => getComputedStyle(element).transform),
      )
      .not.toBe(runwayStartTransform);
    const runwayCards = runway.locator('a[data-artwork="true"]');
    await expect(runwayCards).toHaveCount(5);
    const runwayGeometry = await runwayCards.evaluateAll((cards) =>
      cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return {
          top: rect.top,
          width: rect.width,
          metadataLines: card.querySelectorAll("p").length,
        };
      }),
    );
    const referenceCardWidth = await artworkLinks.first().evaluate(
      (card) => card.getBoundingClientRect().width,
    );
    expect(
      Math.max(...runwayGeometry.map(({ top }) => top)) -
        Math.min(...runwayGeometry.map(({ top }) => top)),
    ).toBeLessThan(2);
    expect(
      Math.max(...runwayGeometry.map(({ width }) => width)) -
        Math.min(...runwayGeometry.map(({ width }) => width)),
    ).toBeLessThan(2);
    expect(Math.abs(runwayGeometry[0].width - referenceCardWidth)).toBeLessThan(2);
    expect(runwayGeometry.every(({ metadataLines }) => metadataLines === 2)).toBe(true);

    await expect(journey).toHaveCount(1);
    const spiral = page.locator('section[aria-label="ARTCOVR spiral archive"]');
    await expect(spiral).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(spiral.locator('a[href="/archive"]')).not.toHaveClass(/rounded-full/);
    await expect(spiral.locator('[aria-label="Current artwork"]')).not.toHaveClass(
      /rounded-full/,
    );
    const motionState = await journey.evaluate((section) => {
      const top = section.getBoundingClientRect().top + window.scrollY;
      const target = top + 2_000;
      const lenis = (
        window as Window & {
          __lenis?: { scrollTo: (value: number, options: { immediate: boolean }) => void };
        }
      ).__lenis;
      if (lenis) lenis.scrollTo(target, { immediate: true });
      else window.scrollTo(0, target);
      return section.parentElement?.classList.contains("pin-spacer") ?? false;
    });
    expect(motionState).toBe(true);
    await expect
      .poll(() =>
        page.locator(".carousel-card").first().evaluate((card) => {
          const track = card.parentElement;
          return track?.style.transform ?? "";
        }),
      )
      .not.toBe("translateX(0px)");

    const carouselCount = await page.locator(".carousel-card").count();
    const journeyMetrics = await journey.evaluate((section) => {
      const spacer = section.parentElement!;
      return {
        top: spacer.getBoundingClientRect().top + window.scrollY,
        range: spacer.offsetHeight - window.innerHeight,
      };
    });
    const carouselSpan = Math.max(6_000, carouselCount * 170);
    const carouselEndP = carouselSpan / (carouselSpan + 12_000);
    await scrollImmediately(
      journeyMetrics.top + journeyMetrics.range * (carouselEndP + 0.001),
    );
    await page.waitForTimeout(1_100);

    const sharedState = await page.evaluate(() => {
      const carouselLead = [...document.querySelectorAll<HTMLElement>(
        ".carousel-card",
      )].at(-1)!;
      const spiralLead = document.querySelector<HTMLElement>(
        '[data-shared-lead="true"]',
      )!;
      const carouselRect = carouselLead.getBoundingClientRect();
      const spiralRect = spiralLead.getBoundingClientRect();
      return {
        carouselSrc: carouselLead.querySelector("img")?.getAttribute("src"),
        spiralSrc: spiralLead.querySelector("img")?.getAttribute("src"),
        carouselVisibility: getComputedStyle(carouselLead).visibility,
        spiralVisibility: getComputedStyle(spiralLead).visibility,
        widthDelta: Math.abs(carouselRect.width - spiralRect.width),
        centerDelta: Math.hypot(
          carouselRect.x + carouselRect.width / 2 -
            (spiralRect.x + spiralRect.width / 2),
          carouselRect.y + carouselRect.height / 2 -
            (spiralRect.y + spiralRect.height / 2),
        ),
        transform: spiralLead.style.transform,
      };
    });
    expect(sharedState.carouselSrc).toBe(sharedState.spiralSrc);
    expect(sharedState.carouselVisibility).toBe("hidden");
    expect(sharedState.spiralVisibility).toBe("visible");
    expect(sharedState.widthDelta).toBeLessThan(10);
    expect(sharedState.centerDelta).toBeLessThan(12);

    await scrollImmediately(
      journeyMetrics.top + journeyMetrics.range * (carouselEndP + 0.035),
    );
    await page.waitForTimeout(1_100);
    await expect
      .poll(() =>
        page
          .locator('[data-shared-lead="true"]')
          .evaluate((element) => (element as HTMLElement).style.transform),
      )
      .not.toBe(sharedState.transform);
    await expect
      .poll(() =>
        page.locator(".spiral-item").evaluateAll((items) =>
          items.filter(
            (item) => Number(getComputedStyle(item).opacity) > 0.05,
          ).length,
        ),
      )
      .toBeGreaterThan(1);

    await scrollImmediately(journeyMetrics.top + journeyMetrics.range * 0.999);
    await page.waitForTimeout(1_100);
    const exitGrid = await page
      .locator('[data-exit-grid="true"]')
      .evaluateAll((items) =>
        items
          .map((item) => {
            const rect = item.getBoundingClientRect();
            return {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              opacity: Number(getComputedStyle(item).opacity),
              visibility: getComputedStyle(item).visibility,
            };
          })
          .sort((a, b) => a.x - b.x),
      );
    expect(exitGrid).toHaveLength(4);
    expect(exitGrid.every(({ opacity }) => opacity > 0.95)).toBe(true);
    expect(exitGrid.every(({ visibility }) => visibility === "visible")).toBe(true);
    expect(
      Math.max(...exitGrid.map(({ y }) => y)) -
        Math.min(...exitGrid.map(({ y }) => y)),
    ).toBeLessThan(6);
    expect(
      Math.max(...exitGrid.map(({ width }) => width)) -
        Math.min(...exitGrid.map(({ width }) => width)),
    ).toBeLessThan(6);
    expect(
      Math.max(...exitGrid.map(({ height }) => height)) -
        Math.min(...exitGrid.map(({ height }) => height)),
    ).toBeLessThan(6);
    const centerSteps = exitGrid.slice(1).map((item, index) =>
      item.x + item.width / 2 -
      (exitGrid[index].x + exitGrid[index].width / 2),
    );
    expect(Math.max(...centerSteps) - Math.min(...centerSteps)).toBeLessThan(6);
  }

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
