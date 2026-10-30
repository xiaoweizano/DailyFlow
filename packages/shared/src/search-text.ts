const HAN_RUN_PATTERN = /\p{Script=Han}+/gu;
const SEARCH_PUNCTUATION_PATTERN = /[^\p{L}\p{N}\s_+\-.#/'\u2019]/gu;
// Control characters are intentionally sanitized at the search boundary.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/gu;

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(CONTROL_CHARACTER_PATTERN, (character) => (/\s/u.test(character) ? " " : ""))
    .replace(SEARCH_PUNCTUATION_PATTERN, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .normalize("NFKC");
}

export function createSearchBigrams(value: string): string[] {
  const normalized = normalizeSearchText(value);
  const bigrams = new Set<string>();

  for (const match of normalized.matchAll(HAN_RUN_PATTERN)) {
    const characters = Array.from(match[0]);
    for (let index = 0; index < characters.length - 1; index += 1) {
      bigrams.add(`${characters[index]}${characters[index + 1]}`);
    }
  }

  return [...bigrams];
}
