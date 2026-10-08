import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { ConfigurationScreen } from "./components/auth";
import { AuthPersistence } from "./lib/auth-storage";
import { readRuntimeConfig } from "./lib/config";
import { createRuntimeClient, DirectoryApi } from "./lib/directory-api";
import { asRuntimeError } from "./lib/errors";
import { RuntimeProvider } from "./lib/runtime";
import { router } from "./router";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
try {
  const config = readRuntimeConfig(import.meta.env);
  const persistence = new AuthPersistence(config.url);
  const api = new DirectoryApi(createRuntimeClient(config, persistence.initialLease()));
  root.render(<StrictMode><RuntimeProvider api={api} config={config} persistence={persistence}><RouterProvider router={router} /></RuntimeProvider></StrictMode>);
} catch (error) {
  root.render(<ConfigurationScreen error={asRuntimeError(error)} />);
}
