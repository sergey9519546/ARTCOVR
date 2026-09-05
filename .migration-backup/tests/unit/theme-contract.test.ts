import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

function relativeLuminance(hex: string) {
  const channels = hex
    .match(/[0-9a-f]{2}/gi)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground: string, background: string) {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function compositeHex(foreground: string, background: string, opacity: number) {
  const foregroundChannels = foreground
    .match(/[0-9a-f]{2}/gi)!
    .map((channel) => Number.parseInt(channel, 16));
  const backgroundChannels = background
    .match(/[0-9a-f]{2}/gi)!
    .map((channel) => Number.parseInt(channel, 16));
  return `#${foregroundChannels
    .map((channel, index) =>
      Math.round(channel * opacity + backgroundChannels[index] * (1 - opacity))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function themeUtilityOpacity(css: string, theme: string, utility: string) {
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, selectors, declarations] = rule;
    if (
      !selectors.includes(`html[data-theme="${theme}"]`) ||
      !selectors.includes(`.${utility}`)
    ) {
      continue;
    }
    const opacity = declarations.match(/(?:^|;)\s*opacity:\s*([\d.]+)/)?.[1];
    if (opacity) return Number(opacity);
  }
  assert.fail(`${theme} ${utility} must declare an accessible opacity`);
}

function themeToken(css: string, theme: string, token: string) {
  const block = css.match(
    new RegExp(`html\\[data-theme="${theme}"\\] \\{([\\s\\S]*?)\\n\\}`),
  )?.[1];
  assert.ok(block, `${theme} theme block must exist`);
  const value = block.match(new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];
  assert.ok(value, `${theme} ${token} must be an opaque hex color`);
  return value;
}

test("light, dark, and red are accepted by both theme producers", async () => {
  const [hook, bootstrap] = await Promise.all([
    read("src/hooks/artcovr/useTheme.ts"),
    read("public/theme-init.js"),
  ]);

  assert.match(hook, /\["light", "dark", "red"\] as const/);
  assert.match(hook, /isTheme\(stored\)/);
  assert.match(hook, /artcovr:theme-change/);
  assert.match(hook, /window\.addEventListener\("storage", syncStoredTheme\)/);
  assert.match(
    bootstrap,
    /t === "light" \|\| t === "dark" \|\| t === "red" \? t : "light"/,
  );
});

test("red is a genuine, AA-contrast crimson theme", async () => {
  const css = await read("src/app/globals.css");
  const background = themeToken(css, "red", "--background");
  const foreground = themeToken(css, "red", "--foreground");
  const card = themeToken(css, "red", "--card");
  const cardForeground = themeToken(css, "red", "--card-foreground");
  const border = themeToken(css, "red", "--border");
  const alert = themeToken(css, "red", "--alert");

  assert.equal(background.toLowerCase(), "#8a1023");
  assert.notEqual(background.toLowerCase(), "#122519");
  assert.ok(contrast(foreground, background) >= 4.5);
  assert.ok(contrast(cardForeground, card) >= 4.5);
  assert.ok(contrast(border, background) >= 3);
  assert.ok(contrast(alert, background) >= 4.5);
});

test("red muted normal text retains AA contrast", async () => {
  const css = await read("src/app/globals.css");
  const background = themeToken(css, "red", "--background");
  const foreground = themeToken(css, "red", "--foreground");

  for (const utility of ["opacity-30", "opacity-40", "opacity-50", "opacity-60"]) {
    const opacity = themeUtilityOpacity(css, "red", utility);
    const renderedForeground = compositeHex(foreground, background, opacity);
    assert.ok(
      contrast(renderedForeground, background) >= 4.5,
      `${utility} renders at only ${contrast(renderedForeground, background).toFixed(2)}:1 in red`,
    );
  }
});

test("all users get named, touch-sized theme choices", async () => {
  const [switcher, menu, toggle] = await Promise.all([
    read("src/components/parity/ThemeSwitcher.tsx"),
    read("src/components/parity/MobileMenu.tsx"),
    read("src/components/artcovr/ThemeToggle.tsx"),
  ]);

  for (const theme of ["light", "dark", "red"]) {
    assert.match(switcher, new RegExp(`id: "${theme}"`));
    assert.match(switcher, new RegExp(`Switch to ${theme} theme`));
  }
  assert.match(switcher, /role="group"/);
  assert.match(switcher, /aria-label="Color theme"/);
  assert.match(switcher, /aria-pressed=\{theme === candidate\.id\}/);
  assert.match(switcher, /min-h-11 min-w-11/);
  assert.match(switcher, /theme === candidate\.id \? "✓"/);
  assert.match(menu, /id="mobile-theme-switcher" placement="menu"/);
  assert.match(toggle, /THEMES\.indexOf\(theme\)/);
});
