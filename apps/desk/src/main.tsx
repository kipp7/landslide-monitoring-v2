import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
import "./styles.css";

function normalizeHashRouterLocation() {
  if (window.location.hash) return;
  const pathname = window.location.pathname;
  const search = window.location.search ?? "";

  const routePrefixes = ["/app/", "/app", "/login"];
  const hit = routePrefixes.find((p) => pathname.includes(p));
  if (!hit) return;

  const idx = pathname.indexOf(hit);
  if (idx < 0) return;
  const basePrefix = pathname.slice(0, idx);
  const route = pathname.slice(idx);

  const base = basePrefix.endsWith("/") ? basePrefix : `${basePrefix}/`;
  const target = `${base}#${route}${search}`;
  window.location.replace(target);
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

normalizeHashRouterLocation();

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
