import { isLocalDate } from "../date-utils.js";

const monthPattern = /^(\d{4})-(\d{2})$/u;

export function parseMonth(
  month: string,
): { readonly year: number; readonly monthIndex: number } | null {
  const match = monthPattern.exec(month);
  if (match === null) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (year < 1 || year > 9999 || monthIndex < 0 || monthIndex > 11) {
    return null;
  }

  return { year, monthIndex };
}

export function formatMonth(month: string): string {
  const parts = parseMonth(month);
  if (parts === null) {
    return month;
  }
  return `${parts.year} 年 ${parts.monthIndex + 1} 月`;
}

export function formatDate(year: number, monthIndex: number, day: number): string {
  return [
    String(year).padStart(4, "0"),
    String(monthIndex + 1).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

export function shiftMonth(month: string, offset: number): string {
  const parts = parseMonth(month);
  if (parts === null) {
    return month;
  }
  const shifted = new Date(Date.UTC(parts.year, parts.monthIndex + offset, 1));
  return `${String(shifted.getUTCFullYear()).padStart(4, "0")}-${String(
    shifted.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
}

export function monthDateRange(
  month: string,
): { readonly from: string; readonly to: string } | null {
  const parts = parseMonth(month);
  if (parts === null) {
    return null;
  }
  const dayCount = new Date(Date.UTC(parts.year, parts.monthIndex + 1, 0)).getUTCDate();
  return {
    from: formatDate(parts.year, parts.monthIndex, 1),
    to: formatDate(parts.year, parts.monthIndex, dayCount),
  };
}

export function isCalendarMonth(value: string): boolean {
  return parseMonth(value) !== null && isLocalDate(`${value}-01`);
}
