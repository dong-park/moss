"use client";

/** 약관 링크와 동의 체크. 메일 가입과 Google 가입 마무리가 같이 쓴다. */
export function TermsCheckbox({ accepted, onChange }: { accepted: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-[11px] text-[#2c2e33]">
      <input
        type="checkbox"
        checked={accepted}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span>
        <a href="/legal/terms" target="_blank" rel="noreferrer" className="underline">이용약관</a>
        {"과 "}
        <a href="/legal/privacy" target="_blank" rel="noreferrer" className="underline">개인정보 처리방침</a>
        에 동의합니다
      </span>
    </label>
  );
}
