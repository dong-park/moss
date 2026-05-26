import koMessages from "./messages/ko.json";

export type Messages = Record<string, unknown>;
export type Locale = "ko";

export const messagesByLocale: Record<Locale, Messages> = {
  ko: koMessages as Messages,
};

export type Translator = (key: string, vars?: Record<string, string | number>) => string;

function lookup(messages: Messages, key: string): string | undefined {
  let node: unknown = messages;
  for (const segment of key.split(".")) {
    if (node && typeof node === "object" && segment in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = vars[name];
    return value === undefined ? `{${name}}` : String(value);
  });
}

export function createT(messages: Messages): Translator {
  return (key, vars) => {
    const value = lookup(messages, key);
    if (value === undefined) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[i18n] missing key: ${key}`);
      }
      return key;
    }
    return vars ? interpolate(value, vars) : value;
  };
}

export const t: Translator = createT(messagesByLocale.ko);
