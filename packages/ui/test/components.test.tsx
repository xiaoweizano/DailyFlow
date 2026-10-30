import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button, IconButton, Input, SaveStatus, SegmentedControl } from "../src/index.js";

describe("shared UI controls", () => {
  it("keeps explicit button and input semantics", () => {
    const buttonMarkup = renderToStaticMarkup(<Button>新建记录</Button>);
    const inputMarkup = renderToStaticMarkup(
      <Input aria-label="搜索" placeholder="搜索日志、知识和任务" />,
    );

    expect(buttonMarkup).toContain('type="button"');
    expect(buttonMarkup).toContain("新建记录");
    expect(inputMarkup).toContain('aria-label="搜索"');
    expect(inputMarkup).toContain('placeholder="搜索日志、知识和任务"');
  });

  it("gives icon buttons an accessible name and tooltip", () => {
    const markup = renderToStaticMarkup(
      <IconButton label="打开搜索" tooltip="搜索全部内容">
        <span aria-hidden="true">S</span>
      </IconButton>,
    );

    expect(markup).toContain('aria-label="打开搜索"');
    expect(markup).toContain('title="搜索全部内容"');
  });

  it("expresses segmented selection without relying on color", () => {
    const markup = renderToStaticMarkup(
      <SegmentedControl
        label="时间视图"
        options={[
          { label: "月历", value: "calendar" },
          { label: "时间线", value: "timeline" },
        ]}
        value="calendar"
        onChange={() => undefined}
      />,
    );

    expect(markup).toContain('role="group"');
    expect(markup).toContain('aria-label="时间视图"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-pressed="false"');
  });

  it("announces the current save state", () => {
    const markup = renderToStaticMarkup(<SaveStatus status="saved" savedAt="14:32" />);

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("已保存 14:32");
  });
});
