import type { Metadata } from "next";
// 자체 호스팅 Geist Mono (geist 패키지의 next/font/local 번들).
// next/font/google과 달리 빌드 시 Google Fonts를 fetch하지 않아 오프라인/CI에서도 빌드된다.
import { GeistMono } from "geist/font/mono";
import { Providers } from "@/components/providers";
import { I18nProvider } from "@/i18n/Provider";
import { t } from "@/i18n";
import { ToastContainer } from "@/components/notifications/ToastContainer";
import { OfflineStrip } from "@/components/notifications/OfflineStrip";
import { StorageBootstrap } from "@/components/notifications/StorageBootstrap";
import { ServiceWorkerRegister } from "@/components/notifications/ServiceWorkerRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: t("meta.title"),
  description: t("meta.description"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <I18nProvider locale="ko">
          <Providers>
            <StorageBootstrap />
            <ServiceWorkerRegister />
            <OfflineStrip />
            {children}
            <ToastContainer />
          </Providers>
        </I18nProvider>
      </body>
    </html>
  );
}
