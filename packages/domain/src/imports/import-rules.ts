import {
  parseLocalDate,
  type LocalDate,
} from "../shared/value-objects.js";

const FULL_DATE_COMPACT_PATTERN = /^(\d{4})(\d{2})(\d{2})(?:\D|$)/u;
const FULL_DATE_SEPARATED_PATTERN = /^(\d{4})[-._](\d{2})[-._](\d{2})(?:\D|$)/u;
const MONTH_DIRECTORY_PATTERN = /^(\d{4})(\d{2})$/u;
const MONTH_DAY_PATTERN = /^(\d{2})[-._]?(\d{2})(?:\D|$)/u;
const DAY_ONLY_PATTERN = /^(\d{1,2})(?:\D|$)/u;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[a-zA-Z]:/u;

export type ImportDateSource = "file-name" | "month-directory";

export type ImportDateDetection =
  | {
      readonly kind: "resolved";
      readonly date: LocalDate;
      readonly source: ImportDateSource;
      readonly requiresBatchUniqueness: boolean;
    }
  | {
      readonly kind: "invalid";
      readonly code: "DATE_INVALID";
      readonly message: string;
    }
  | {
      readonly kind: "unresolved";
      readonly code: "DATE_UNRESOLVED";
      readonly message: string;
    };

export function normalizeImportRelativePath(relativePath: string): string {
  if (relativePath.length === 0 || relativePath.trim().length === 0) {
    throw new RangeError("Import path cannot be empty");
  }
  if (relativePath.includes("\0")) {
    throw new RangeError("Import path cannot contain a NUL character");
  }
  if (
    relativePath.startsWith("/") ||
    relativePath.startsWith("\\") ||
    WINDOWS_ABSOLUTE_PATH_PATTERN.test(relativePath)
  ) {
    throw new RangeError("Import path must be relative");
  }

  const segments = relativePath.replaceAll("\\", "/").split("/");
  if (segments.some((segment) => segment === "..")) {
    throw new RangeError("Import path cannot traverse outside the selected root");
  }

  const normalizedSegments = segments.filter(
    (segment) => segment.length > 0 && segment !== ".",
  );
  if (normalizedSegments.length === 0) {
    throw new RangeError("Import path must identify a file");
  }

  return normalizedSegments.join("/");
}

export function detectImportDate(relativePath: string): ImportDateDetection {
  const normalizedPath = normalizeImportRelativePath(relativePath);
  const segments = normalizedPath.split("/");
  const fileName = segments.at(-1);
  if (fileName === undefined) {
    return unresolvedDate();
  }

  const baseName = stripFinalExtension(fileName);
  const fullDateMatch =
    FULL_DATE_SEPARATED_PATTERN.exec(baseName) ??
    FULL_DATE_COMPACT_PATTERN.exec(baseName);

  if (fullDateMatch !== null) {
    return resolveDateParts(
      fullDateMatch[1],
      fullDateMatch[2],
      fullDateMatch[3],
      "file-name",
      false,
    );
  }

  const monthDirectory = segments.at(-2);
  const monthMatch =
    monthDirectory === undefined
      ? null
      : MONTH_DIRECTORY_PATTERN.exec(monthDirectory);
  if (monthMatch === null) {
    return unresolvedDate();
  }

  const year = monthMatch[1];
  const month = monthMatch[2];
  const monthDayMatch = MONTH_DAY_PATTERN.exec(baseName);
  if (monthDayMatch !== null) {
    return resolveDateParts(
      year,
      monthDayMatch[1],
      monthDayMatch[2],
      "month-directory",
      false,
    );
  }

  const dayOnlyMatch = DAY_ONLY_PATTERN.exec(baseName);
  if (dayOnlyMatch !== null) {
    return resolveDateParts(
      year,
      month,
      dayOnlyMatch[1],
      "month-directory",
      true,
    );
  }

  return unresolvedDate();
}

function stripFinalExtension(fileName: string): string {
  const extensionIndex = fileName.lastIndexOf(".");
  return extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
}

function resolveDateParts(
  yearPart: string | undefined,
  monthPart: string | undefined,
  dayPart: string | undefined,
  source: ImportDateSource,
  requiresBatchUniqueness: boolean,
): ImportDateDetection {
  const month = monthPart?.padStart(2, "0");
  const day = dayPart?.padStart(2, "0");
  if (yearPart === undefined || month === undefined || day === undefined) {
    return unresolvedDate();
  }

  const value = `${yearPart}-${month}-${day}`;
  try {
    return {
      kind: "resolved",
      date: parseLocalDate(value),
      source,
      requiresBatchUniqueness,
    };
  } catch {
    return {
      kind: "invalid",
      code: "DATE_INVALID",
      message: `Import path contains an invalid calendar date: ${value}`,
    };
  }
}

function unresolvedDate(): ImportDateDetection {
  return {
    kind: "unresolved",
    code: "DATE_UNRESOLVED",
    message: "No supported calendar date was found in the import path",
  };
}
