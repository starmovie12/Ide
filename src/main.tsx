import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { requestPersistentStorage } from "@/lib/db/dexie";

/**
 * Bug #B24 — Request persistent IndexedDB storage on first load.
 * Without this, iOS Safari / Chrome may evict our Dexie DB when disk is low.
 * This is a one-time browser prompt — subsequent loads are silent.
 */
requestPersistentStorage().then((granted) => {
  if (import.meta.env.DEV) {
    console.info(
      `[AI Agent Studio] Persistent storage: ${granted ? "granted ✅" : "denied (data may be evicted on low disk)"}`
    );
  }
});

createRoot(document.getElementById("root")!).render(<App />);
