// @vitest-environment jsdom

import "./setup-dom.js";

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AppServicesProvider } from "../src/app-services-provider.js";
import type { AppRuntimeServices } from "../src/app-services-context.js";
import { ModulePage, NotFoundPage } from "../src/module-page.js";
import { createRuntimeSettingsStub } from "./runtime-settings-stub.js";

function renderEnglishRoute(element: React.JSX.Element, path = "/timeline"): void {
  const services = createRuntimeSettingsStub({
    locale: "en-US",
  }) as unknown as AppRuntimeServices;

  render(
    <MemoryRouter initialEntries={[path]}>
      <AppServicesProvider services={services}>
        <Routes>
          <Route path="*" element={element} />
        </Routes>
      </AppServicesProvider>
    </MemoryRouter>,
  );
}

describe("module pages", () => {
  it("localizes module metadata, context, and timeline controls", async () => {
    renderEnglishRoute(<ModulePage moduleId="timeline" />);

    expect(await screen.findByRole("heading", { name: "Timeline" })).toBeInTheDocument();
    expect(screen.getByText("Review your work cadence and continuous notes.")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Context" })).toBeInTheDocument();
    expect(screen.getByText("Current location")).toBeInTheDocument();
    expect(screen.getByText("Date")).toBeInTheDocument();
    expect(screen.getByText("Data status")).toBeInTheDocument();
    expect(screen.getByText("Available locally")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Time view" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Timeline view" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Heatmap" })).toBeInTheDocument();
  });

  it("localizes the not-found page", async () => {
    renderEnglishRoute(<NotFoundPage />, "/missing");

    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(
      screen.getByText("This address does not match a page in DailyFlow."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to workbench" })).toHaveAttribute("href", "/");
  });
});
