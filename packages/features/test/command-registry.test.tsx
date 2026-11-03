// @vitest-environment jsdom

import "./setup-dom.js";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  createCommandRegistry,
  detectShortcutPlatform,
  formatShortcut,
  isShortcutBlockedTarget,
  type ShortcutPlatform,
} from "../src/platform/command-registry.js";
import { ShortcutHelpPanel } from "../src/settings/shortcut-settings.js";

function keyboardEvent(
  key: string,
  options: Partial<KeyboardEventInit> & { readonly target?: EventTarget | null } = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key,
    ...options,
  });
  if (options.target != null) {
    Object.defineProperty(event, "target", { value: options.target });
  }
  return event;
}

describe("platform shortcut resolution", () => {
  it.each([
    ["Win32", "windows"],
    ["MacIntel", "macos"],
    ["Linux x86_64", "web"],
  ] satisfies ReadonlyArray<readonly [string, ShortcutPlatform]>)(
    "detects %s as %s",
    (navigatorPlatform, expected) => {
      expect(
        detectShortcutPlatform({
          navigatorPlatform,
          userAgent: "Mozilla/5.0",
        }),
      ).toBe(expected);
    },
  );

  it("maps the abstract Mod key to Ctrl on Windows and Cmd on macOS", () => {
    expect(formatShortcut("mod+k", "windows")).toEqual(["Ctrl", "K"]);
    expect(formatShortcut("mod+k", "macos")).toEqual(["Cmd", "K"]);
    expect(formatShortcut("mod+shift+t", "macos")).toEqual(["Cmd", "Shift", "T"]);
  });

  it("resolves platform shortcuts and suppresses default browser handling", () => {
    const windows = createCommandRegistry({ platform: "windows" });
    const macos = createCommandRegistry({ platform: "macos" });
    const winEvent = keyboardEvent("k", { ctrlKey: true });
    const macEvent = keyboardEvent("k", { metaKey: true });

    expect(windows.resolve(winEvent)?.definition.id).toBe("open-settings");
    expect(macos.resolve(macEvent)?.definition.id).toBe("open-settings");
    expect(winEvent.defaultPrevented).toBe(true);
    expect(macEvent.defaultPrevented).toBe(true);
  });
});

describe("text editing and dialog shortcut guards", () => {
  it.each(["input", "textarea", "pre", "code"])(
    "does not intercept shortcuts from a %s element",
    (tagName) => {
      const element = document.createElement(tagName);
      document.body.append(element);
      const registry = createCommandRegistry({ platform: "windows" });

      expect(isShortcutBlockedTarget(element)).toBe(true);
      expect(registry.resolve(keyboardEvent("?", { target: element }))).toBeNull();
      element.remove();
    },
  );

  it("does not intercept shortcuts from contenteditable or an open dialog", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const input = document.createElement("input");
    dialog.append(input);
    document.body.append(editor, dialog);
    const registry = createCommandRegistry({ platform: "windows" });

    expect(registry.resolve(keyboardEvent("/", { target: editor }))).toBeNull();
    expect(registry.resolve(keyboardEvent("/", { target: input }))).toBeNull();
    editor.remove();
    dialog.remove();
  });
});

describe("shortcut conflicts and help", () => {
  it("reports conflicting bindings and refuses to guess which command should run", () => {
    const registry = createCommandRegistry({
      platform: "windows",
      commands: [
        {
          id: "global-search",
          label: "全局搜索",
          shortcut: "mod+k",
        },
        {
          id: "open-settings",
          label: "打开设置",
          shortcut: "mod+k",
        },
      ],
    });

    expect(registry.conflicts).toEqual([
      expect.objectContaining({
        shortcut: "mod+k",
        commandIds: ["global-search", "open-settings"],
      }),
    ]);
    expect(registry.resolve(keyboardEvent("k", { ctrlKey: true }))).toBeNull();
  });

  it("renders platform-specific shortcut help with conflict warnings", () => {
    render(
      <ShortcutHelpPanel
        platform="macos"
        conflicts={[
          {
            shortcut: "mod+k",
            commandIds: ["global-search", "open-settings"],
          },
        ]}
      />,
    );

    expect(screen.getByRole("region", { name: "快捷键" })).toBeInTheDocument();
    expect(screen.getByText("Cmd+K")).toBeInTheDocument();
    expect(screen.getByText("快捷键冲突")).toBeInTheDocument();
    expect(screen.getByText(/全局搜索/)).toBeInTheDocument();
    expect(screen.getByText(/打开设置/)).toBeInTheDocument();
  });
});
