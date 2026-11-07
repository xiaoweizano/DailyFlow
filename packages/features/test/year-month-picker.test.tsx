// @vitest-environment jsdom

import "./setup-dom.js";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { YearMonthPicker } from "../src/timeline/year-month-picker.js";

describe("YearMonthPicker", () => {
  it("accepts a year from 1 through 9999 and jumps to a month", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<YearMonthPicker year={2026} month="2026-11" onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: "2026 年" }));
    const yearInput = screen.getByRole("spinbutton", { name: "年份" });
    await user.clear(yearInput);
    await user.type(yearInput, "1998");
    await user.click(screen.getByRole("button", { name: "前往 1998 年 3 月" }));

    expect(onSelect).toHaveBeenCalledWith("1998-03");
  });

  it.each(["", "0", "10000", "abcd"])("rejects invalid year %s", async (value) => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<YearMonthPicker year={2026} month="2026-11" onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: "2026 年" }));
    const yearInput = screen.getByRole("spinbutton", { name: "年份" });
    await user.clear(yearInput);
    if (value !== "") {
      await user.type(yearInput, value);
    }
    await user.click(screen.getByRole("button", { name: /前往 .* 年 1 月/u }));

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("请输入 1 到 9999 之间的年份");
    expect(yearInput).toHaveValue(value);
  });

  it.each([
    ["今年", 0],
    ["去年", -1],
    ["前年", -2],
  ])("uses the real current year for the %s shortcut", async (label, offset) => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const expectedYear = new Date().getFullYear() + offset;
    render(<YearMonthPicker year={1998} month="1998-11" onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: "1998 年" }));
    await user.click(screen.getByRole("button", { name: label }));

    expect(onSelect).toHaveBeenCalledWith(`${String(expectedYear).padStart(4, "0")}-11`);
  });

  it("moves through the month grid with arrow keys and Escape restores trigger focus", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<YearMonthPicker year={2026} month="2026-11" onSelect={onSelect} />);

    const trigger = screen.getByRole("button", { name: "2026 年" });
    await user.click(trigger);
    const january = screen.getByRole("button", { name: "前往 2026 年 1 月" });
    january.focus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "前往 2026 年 2 月" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "前往 2026 年 5 月" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("2026-05");

    await user.click(trigger);
    screen.getByRole("button", { name: "前往 2026 年 11 月" }).focus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "快速选择年月" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
