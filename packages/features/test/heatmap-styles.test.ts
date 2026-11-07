import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  fileURLToPath(new URL("../../ui/src/styles/globals.css", import.meta.url)),
  "utf8",
);

function ruleFor(selector: string, fromIndex = 0): string {
  const selectorStart = stylesheet.indexOf(`${selector} {`, fromIndex);
  const openBrace = stylesheet.indexOf("{", selectorStart);
  if (selectorStart < 0 || openBrace < 0) {
    return "";
  }

  let depth = 0;
  for (let index = openBrace; index < stylesheet.length; index += 1) {
    if (stylesheet[index] === "{") {
      depth += 1;
    } else if (stylesheet[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return stylesheet.slice(openBrace + 1, index);
      }
    }
  }
  return "";
}

describe("heatmap styles", () => {
  it.each([":root", ':root[data-theme="dark"]'])(
    "defines six explicit green heatmap tokens in %s",
    (selector) => {
      const rule = ruleFor(selector);

      expect(rule).toBeTruthy();
      for (let level = 0; level <= 5; level += 1) {
        expect(rule).toMatch(new RegExp(`--heatmap-${level}:\\s*#[0-9a-f]{6};`, "iu"));
      }
    },
  );

  it("maps every activity level to its semantic heatmap token", () => {
    for (let level = 0; level <= 5; level += 1) {
      expect(ruleFor(`.df-activity-green-${level}`)).toMatch(
        new RegExp(`background-color:\\s*var\\(--heatmap-${level}\\)`, "u"),
      );
    }
  });

  it("defines shared motion tokens", () => {
    const root = ruleFor(":root");

    expect(root).toMatch(/--motion-duration-fast:\s*120ms;/u);
    expect(root).toMatch(/--motion-duration-base:\s*180ms;/u);
    expect(root).toMatch(/--motion-ease-out:\s*cubic-bezier\(/u);
  });

  it("removes motion when the user prefers reduced motion", () => {
    const selector = "@media (prefers-reduced-motion: reduce)";
    const reducedMotion = ruleFor(selector, stylesheet.lastIndexOf(selector));

    expect(reducedMotion).toMatch(/--motion-duration-fast:\s*0ms;/u);
    expect(reducedMotion).toMatch(/--motion-duration-base:\s*0ms;/u);
    expect(reducedMotion).toMatch(/animation-duration:\s*0\.01ms !important;/u);
    expect(reducedMotion).toMatch(/transition-duration:\s*0\.01ms !important;/u);
  });
});
