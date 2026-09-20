import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { ExportModal } from "../ExportModal";
import { useExportStore } from "@/state/exportStore";
import { I18nProvider } from "@/i18n/Provider";

beforeEach(() => {
  useExportStore.setState({
    exportModalOpen: true,
    exportDefaults: null,
    exporting: false,
    progress: null,
  });
});

describe("ExportModal smoke", () => {
  it("모달 제목 렌더", () => {
    render(
      <I18nProvider locale="ko">
        <ExportModal />
      </I18nProvider>,
    );
    expect(screen.getByRole("heading", { name: "내보내기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "내보내기" })).toBeTruthy();
  });
});
