const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

function localDateParts(value: string): readonly [number, number, number] | null {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (match === null) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const instant = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1 ||
    year > 9999 ||
    instant.getUTCFullYear() !== year ||
    instant.getUTCMonth() !== month - 1 ||
    instant.getUTCDate() !== day
  ) {
    return null;
  }

  return [year, month, day];
}

function formatUtcDate(date: Date): string {
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function toUtcDate(value: string): Date {
  const parts = localDateParts(value);
  if (parts === null) {
    throw new RangeError(`Invalid local date: ${value}`);
  }
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

export function isLocalDate(value: string): boolean {
  return localDateParts(value) !== null;
}

export function currentLocalDate(): string {
  const now = new Date();
  return [
    String(now.getFullYear()).padStart(4, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

export function shiftLocalDate(value: string, days: number): string {
  const date = toUtcDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDate(date);
}

export function localDatesEndingAt(endDate: string, count: number): readonly string[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError("Date count must be a positive integer.");
  }

  return Array.from({ length: count }, (_, index) => shiftLocalDate(endDate, index - (count - 1)));
}
