import type { AppServices } from "@dailyflow/application";
import { createContext } from "react";

export type AppRuntimeServices = Pick<AppServices, "journals" | "search">;

export const AppServicesContext = createContext<AppRuntimeServices | null>(null);
