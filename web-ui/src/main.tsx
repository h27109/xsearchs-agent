import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App as AntApp, theme } from "antd";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AntApp theme={{ algorithm: theme.defaultAlgorithm }}>
      <App />
    </AntApp>
  </StrictMode>
);
