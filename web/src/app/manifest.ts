import type { MetadataRoute } from "next";
import { t } from "@/i18n";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: t("meta.title"),
    short_name: "moss",
    description: t("meta.description"),
    start_url: "/",
    display: "standalone",
    background_color: "#ebecee",
    theme_color: "#4f7cf3",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
    lang: "ko",
  };
}
