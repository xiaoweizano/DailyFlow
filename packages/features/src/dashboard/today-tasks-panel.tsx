import { ArrowRight, CheckSquare2 } from "lucide-react";
import { Link } from "react-router-dom";

import { getAppMessages, type AppMessages } from "../preferences/app-messages.js";

const defaultCopy = getAppMessages("zh-CN").dashboard;

export interface TodayTasksPanelProps {
  readonly copy?: AppMessages["dashboard"];
}

export function TodayTasksPanel({ copy = defaultCopy }: TodayTasksPanelProps): React.JSX.Element {
  return (
    <section aria-labelledby="today-tasks-title" className="border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase text-muted-foreground">Focus</p>
          <h2 id="today-tasks-title" className="mt-1 text-sm font-semibold text-foreground">
            {copy.todayTasks}
          </h2>
        </div>
        <CheckSquare2 aria-hidden="true" className="size-4 shrink-0 text-primary" />
      </div>
      <p className="mt-6 text-sm font-medium text-foreground">{copy.noTasks}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.noTasksDescription}</p>
      <Link
        to="/tasks"
        className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
      >
        {copy.viewAllTasks}
        <ArrowRight aria-hidden="true" className="size-3.5" />
      </Link>
    </section>
  );
}
