"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { translate } from "@/lib/translations";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [imports, setImports] = useState([]);
  const [stockOverrides, setStockOverrides] = useState([]);
  const [language, setLanguageState] = useState("en");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef(0);

  // One timer at a time, so a new toast is not dismissed early by the previous toast's timer.
  const showToast = useCallback((message) => {
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(""), 3500);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/store")
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load saved local data.");
        return response.json();
      })
      .then((data) => {
        if (!active) return;
        setImports(Array.isArray(data.imports) ? data.imports : []);
        setStockOverrides(Array.isArray(data.stockOverrides) ? data.stockOverrides : []);
        setLanguageState(["en", "ru", "uz"].includes(data.language) ? data.language : "en");
      })
      .catch((loadError) => {
        if (active) setError(loadError.message);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => { active = false; };
  }, []);

  const save = useCallback(async (nextImports, nextLanguage = language, nextStockOverrides = stockOverrides) => {
    const body = JSON.stringify({ imports: nextImports, stockOverrides: nextStockOverrides, language: nextLanguage });
    // shortcut: the whole workspace goes in one request, so it must stay under Vercel's 4.5 MB body limit
    // (and MongoDB's 16 MB document limit); save each import separately when sellers need bigger data.
    if (new Blob([body]).size > 4_000_000) throw new Error(translate(nextLanguage, "saveTooLarge"));
    const response = await fetch("/api/store", { method: "PUT", headers: { "Content-Type": "application/json" }, body });
    if (response.status === 413) throw new Error(translate(nextLanguage, "saveTooLarge"));
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not save your data.");
    setImports(nextImports);
    setStockOverrides(nextStockOverrides);
    setLanguageState(nextLanguage);
    setError("");
  }, [language, stockOverrides]);

  const setLanguage = useCallback(async (nextLanguage) => {
    try {
      await save(imports, nextLanguage);
    } catch (saveError) {
      showToast(saveError.message);
    }
  }, [imports, save, showToast]);

  const value = useMemo(() => ({
    imports, stockOverrides, language, ready, error, toast,
    t: (key) => translate(language, key),
    save,
    setLanguage,
    clearToast: () => setToast(""),
    notify: showToast,
  }), [imports, stockOverrides, language, ready, error, toast, save, setLanguage, showToast]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider.");
  return context;
}
