"use client";

import { createContext, useContext, useMemo } from "react";
import { createT, type Locale, type Messages, type Translator, messagesByLocale } from "./index";

type I18nContextValue = {
  locale: Locale;
  t: Translator;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages?: Messages;
  children: React.ReactNode;
}) {
  const value = useMemo<I18nContextValue>(() => {
    const resolved = messages ?? messagesByLocale[locale];
    return { locale, t: createT(resolved) };
  }, [locale, messages]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): Translator {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useT must be used within <I18nProvider>");
  }
  return ctx.t;
}

export function useLocale(): Locale {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useLocale must be used within <I18nProvider>");
  }
  return ctx.locale;
}
