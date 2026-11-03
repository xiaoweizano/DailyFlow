export type TxtEncoding = "utf8-bom" | "utf8" | "gb18030" | "unknown";
export type TxtNewlineStyle = "lf" | "crlf" | "mixed" | "unknown";

export interface DecodedTxt {
  readonly encoding: TxtEncoding;
  readonly text: string | null;
  readonly newlineStyle: TxtNewlineStyle;
}

const UTF8_BOM = Uint8Array.from([0xef, 0xbb, 0xbf]);

export function decodeTxt(bytes: Uint8Array): DecodedTxt {
  const hasUtf8Bom =
    bytes.length >= UTF8_BOM.length && UTF8_BOM.every((value, index) => bytes[index] === value);

  if (hasUtf8Bom) {
    const text = decodeStrict(bytes.subarray(UTF8_BOM.length), "utf-8");
    return text === null ? unknownTxt() : decoded("utf8-bom", text);
  }

  const utf8Text = decodeStrict(bytes, "utf-8");
  if (utf8Text !== null) {
    return decoded("utf8", utf8Text);
  }

  const gb18030Text = decodeStrict(bytes, "gb18030");
  if (gb18030Text !== null) {
    return decoded("gb18030", gb18030Text);
  }

  return unknownTxt();
}

function unknownTxt(): DecodedTxt {
  return {
    encoding: "unknown",
    text: null,
    newlineStyle: "unknown",
  };
}

function decodeStrict(bytes: Uint8Array, encoding: "utf-8" | "gb18030"): string | null {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function decoded(encoding: Exclude<TxtEncoding, "unknown">, text: string): DecodedTxt {
  return {
    encoding,
    text,
    newlineStyle: detectNewlineStyle(text),
  };
}

function detectNewlineStyle(text: string): TxtNewlineStyle {
  const hasCrlf = text.includes("\r\n");
  const withoutCrlf = text.replaceAll("\r\n", "");
  const hasLf = withoutCrlf.includes("\n");
  const hasCr = withoutCrlf.includes("\r");

  if ((hasCrlf && (hasLf || hasCr)) || (hasLf && hasCr)) {
    return "mixed";
  }
  if (hasCrlf) {
    return "crlf";
  }
  if (hasLf) {
    return "lf";
  }
  if (hasCr) {
    return "mixed";
  }
  return "unknown";
}
