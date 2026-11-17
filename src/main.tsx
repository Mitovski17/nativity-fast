import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { IS_ARTIFACT } from "./lib/env";

const root = createRoot(document.getElementById("root")!);

if (IS_ARTIFACT) {
  // Inside Claude: the viewer is already signed in to Claude
  root.render(<App />);
} else {
  import("./components/Auth").then(({ AuthGate }) =>
    root.render(
      <AuthGate>
        <App />
      </AuthGate>,
    ),
  );
  // Lets the installed app open without a connection (data is cached on the phone too)
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => undefined));
  }
}
