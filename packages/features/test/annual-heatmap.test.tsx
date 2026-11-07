// @vitest-environment jsdom

import "./setup-dom.js";

import type { TimelineDaySummary } from "@dailyflow/application";
import { parseEntityId, parseLocalDate, parseUtcTimestamp } from "@dailyflow/domain";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { createRuntimeSettingsStub } from "./runtime-settings-stub.js";
import { AppServicesProvider } from "../src/app-services-provider.js";
import type { AppRuntimeServices } from "../src/app-services-context.js";
import { AnnualHeatmap } from "../src/timeline/annual-heatmap.js";
import {
  buildAnnualHeatmapData,
  keyboardHeatmapDate,
} from "../src/timeline/annual-heatmap-data.js";

const JOURNAL_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c26");
const NOW = parseUtcTimestamp("2026-10-30T03:20:11.123Z");

const day: TimelineDaySummary = {
  date: parseLocalDate("2024-02-29"),
  journalId: JOURNAL_ID,
  journalCount: 1,
  taskDueCount: 2,
  title: "闰日记录",
  excerpt: "验证全年热力图。",
  updatedAt: NOW,
};

describe("annual heatmap data", () => {
  it("renders 371 cells and keeps February 29 in a leap year", () => {
    const data = buildAnnualHeatmapData({
      year: 2024,
      timezone: "Asia/Shanghai",
      weekStartsOn: 1,
      days: [],
    });

    expect(data.cells).toHaveLength(371);
    expect(data.cells.some((cell) => cell.date === "2024-02-29")).toBe(true);
  });

  it("builds month and localized weekday context for the configured week start", () => {
    const data = buildAnnualHeatmapData({
      year: 2025,
      timezone: "Asia/Shanghai",
      weekStartsOn: 0,
      days: [],
    });

    expect(data.cells[0]?.date).toBe("2024-12-29");
    expect(data.monthLabels).toHaveLength(12);
    expect(data.weekdayLabels.map((label) => label.label)).toEqual([
      "周日",
      "周一",
      "周二",
      "周三",
      "周四",
      "周五",
      "周六",
    ]);
  });

  it("moves by day, week, month, and row boundary", () => {
    expect(keyboardHeatmapDate("2024-02-29", "ArrowRight", 1)).toBe("2024-03-01");
    expect(keyboardHeatmapDate("2024-02-29", "ArrowDown", 1)).toBe("2024-03-07");
    expect(keyboardHeatmapDate("2024-01-31", "PageDown", 1)).toBe("2024-02-29");
    expect(keyboardHeatmapDate("2024-02-29", "Home", 1)).toBe("2024-02-26");
    expect(keyboardHeatmapDate("2024-02-29", "End", 1)).toBe("2024-03-03");
  });
});

describe("AnnualHeatmap", () => {
  it("jumps to any valid year without month controls", async () => {
    const onYearChange = vi.fn();
    const user = userEvent.setup();
    render(
      <AppServicesProvider services={createRuntimeSettingsStub() as AppRuntimeServices}>
        <AnnualHeatmap
          year={2024}
          days={[]}
          weekStartsOn={1}
          onYearChange={onYearChange}
          onOpenDate={() => undefined}
        />
      </AppServicesProvider>,
    );

    await user.click(screen.getByRole("button", { name: "2024 年" }));
    expect(screen.queryByRole("group", { name: "选择月份" })).not.toBeInTheDocument();

    const yearInput = screen.getByRole("spinbutton", { name: "年份" });
    await user.clear(yearInput);
    await user.type(yearInput, "1998");
    await user.click(screen.getByRole("button", { name: "前往 1998 年" }));

    expect(onYearChange).toHaveBeenCalledWith(1998);
  });

  it("shows task markers, year controls, and accessible day details", async () => {
    const onYearChange = vi.fn();
    const onOpenDate = vi.fn();
    const user = userEvent.setup();
    render(
      <AppServicesProvider services={createRuntimeSettingsStub() as AppRuntimeServices}>
        <AnnualHeatmap
          year={2024}
          today="2024-02-29"
          days={[day]}
          weekStartsOn={1}
          onYearChange={onYearChange}
          onOpenDate={onOpenDate}
        />
      </AppServicesProvider>,
    );

    expect(screen.getAllByRole("gridcell")).toHaveLength(371);
    expect(screen.getByText("1 月")).toBeTruthy();
    expect(screen.getByText("周一")).toBeTruthy();
    const leapDay = screen.getByRole("gridcell", {
      name: "2024-02-29，1 篇日志，2 个任务到期",
    });
    expect(leapDay.querySelector(".df-heatmap-task-corner")).not.toBeNull();

    leapDay.focus();
    await user.keyboard("{ArrowRight}");
    expect(
      screen.getByRole("gridcell", { name: "2024-03-01，0 篇日志，0 个任务到期" }),
    ).toHaveFocus();
    expect(screen.getByText(/2024年3月1日/u)).toBeTruthy();

    await user.keyboard("{Enter}");
    expect(onOpenDate).toHaveBeenCalledWith("2024-03-01");

    await user.click(screen.getByRole("button", { name: "上一年" }));
    expect(onYearChange).toHaveBeenCalledWith(2023);
  });
});
