export type ShortcutPlatform = "windows" | "macos" | "web";

export type ShortcutCommandId =
  | "global-search"
  | "open-settings"
  | "shortcut-help"
  | (string & {});

export interface ShortcutCommand {
  readonly id: ShortcutCommandId;
  readonly label: string;
  readonly description?: string;
  readonly shortcut: string;
}

export interface ShortcutConflict {
  readonly shortcut: string;
  readonly commandIds: readonly ShortcutCommandId[];
}

export interface ResolvedShortcut {
  readonly definition: ShortcutCommand;
}

export interface ShortcutPlatformSource {
  readonly navigatorPlatform?: string;
  readonly userAgent?: string;
}

export interface CommandRegistryOptions {
  readonly platform: ShortcutPlatform;
  readonly commands?: readonly ShortcutCommand[];
}

export interface CommandRegistry {
  readonly platform: ShortcutPlatform;
  readonly commands: readonly ShortcutCommand[];
  readonly conflicts: readonly ShortcutConflict[];
  resolve(event: KeyboardEvent): ResolvedShortcut | null;
}

export const defaultShortcutCommands = [
  {
    id: "global-search",
    label: "全局搜索",
    description: "打开搜索结果并输入关键词。",
    shortcut: "/",
  },
  {
    id: "shortcut-help",
    label: "快捷键帮助",
    description: "查看当前平台可用的快捷键。",
    shortcut: "?",
  },
  {
    id: "open-settings",
    label: "打开设置",
    description: "打开 DailyFlow 设备设置。",
    shortcut: "mod+k",
  },
] as const satisfies ReadonlyArray<ShortcutCommand>;

export function detectShortcutPlatform(source: ShortcutPlatformSource = {}): ShortcutPlatform {
  const navigatorPlatform =
    source.navigatorPlatform ??
    (typeof navigator === "undefined" ? "" : (navigator.platform || navigator.userAgent));
  const userAgent = source.userAgent ?? (typeof navigator === "undefined" ? "" : navigator.userAgent);
  const platformText = `${navigatorPlatform} ${userAgent}`;

  if (/mac|iphone|ipad|ipod/iu.test(platformText)) {
    return "macos";
  }
  if (/win/iu.test(platformText)) {
    return "windows";
  }
  return "web";
}

export function formatShortcut(shortcut: string, platform: ShortcutPlatform): readonly string[] {
  return shortcut
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .map((part) => {
      if (part === "mod") {
        return platform === "macos" ? "Cmd" : "Ctrl";
      }
      if (part === "shift") {
        return "Shift";
      }
      if (part === "alt") {
        return platform === "macos" ? "Option" : "Alt";
      }
      return part.length === 1 ? part.toUpperCase() : part;
    });
}

export function isShortcutBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.matches("input, textarea, select") ||
    target.getAttribute("contenteditable") === "true" ||
    target.contentEditable === "true" ||
    target.isContentEditable ||
    target.closest("[contenteditable='true'], pre, code, [role='dialog']") !== null
  );
}

function chordMatches(
  event: KeyboardEvent,
  shortcut: string,
  platform: ShortcutPlatform,
): boolean {
  const parts = shortcut
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const key = parts.at(-1);
  if (key === undefined || event.key.toLowerCase() !== key) {
    return false;
  }

  const requiresMod = parts.includes("mod");
  const requiresShift = parts.includes("shift");
  const requiresAlt = parts.includes("alt");
  const platformModifier = platform === "macos" ? event.metaKey : event.ctrlKey;
  const inactivePlatformModifier = platform === "macos" ? event.ctrlKey : event.metaKey;

  return (
    platformModifier === requiresMod &&
    inactivePlatformModifier === false &&
    event.shiftKey === requiresShift &&
    event.altKey === requiresAlt
  );
}

function findConflicts(commands: readonly ShortcutCommand[]): readonly ShortcutConflict[] {
  const commandsByShortcut = new Map<string, ShortcutCommandId[]>();
  for (const command of commands) {
    const normalized = command.shortcut.toLowerCase();
    const commandIds = commandsByShortcut.get(normalized) ?? [];
    commandIds.push(command.id);
    commandsByShortcut.set(normalized, commandIds);
  }

  return [...commandsByShortcut.entries()]
    .filter(([, commandIds]) => commandIds.length > 1)
    .map(([shortcut, commandIds]) => ({ shortcut, commandIds }));
}

export function createCommandRegistry(options: CommandRegistryOptions): CommandRegistry {
  const commands = options.commands ?? defaultShortcutCommands;
  const conflicts = findConflicts(commands);
  const conflictingShortcuts = new Set(conflicts.map((conflict) => conflict.shortcut));

  return {
    platform: options.platform,
    commands,
    conflicts,
    resolve(event) {
      if (event.defaultPrevented || isShortcutBlockedTarget(event.target)) {
        return null;
      }

      const matches = commands.filter((command) =>
        chordMatches(event, command.shortcut, options.platform),
      );
      const match = matches[0];
      if (matches.length !== 1 || match === undefined) {
        return null;
      }
      if (conflictingShortcuts.has(match.shortcut.toLowerCase())) {
        return null;
      }

      event.preventDefault();
      return { definition: match };
    },
  };
}
