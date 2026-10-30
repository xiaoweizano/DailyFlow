const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

declare const localDateBrand: unique symbol;

export type LocalDate = string & { readonly [localDateBrand]: "LocalDate" };

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseLocalDate(value: string): LocalDate {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (match === null) {
    throw new RangeError(`Invalid LocalDate: ${value}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (
    year < 1 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    throw new RangeError(`Invalid LocalDate: ${value}`);
  }

  return value as LocalDate;
}

export function toLocalDate(utcIso: string, timeZone: string): LocalDate {
  const instant = new Date(utcIso);
  if (
    !UTC_TIMESTAMP_PATTERN.test(utcIso) ||
    Number.isNaN(instant.getTime()) ||
    instant.toISOString() !== utcIso
  ) {
    throw new RangeError(`Invalid UTC timestamp: ${utcIso}`);
  }

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      calendar: "gregory",
      numberingSystem: "latn",
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    throw new RangeError(`Invalid IANA timezone: ${timeZone}`);
  }

  const parts = formatter.formatToParts(instant);
  const dateParts = Object.fromEntries(
    parts
      .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
      .map((part) => [part.type, part.value]),
  );

  return parseLocalDate(`${dateParts.year?.padStart(4, "0")}-${dateParts.month}-${dateParts.day}`);
}
