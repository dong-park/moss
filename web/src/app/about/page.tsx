// 로그인 없이 열리는 소개 페이지. Google 브랜딩 인증의 홈페이지 요건을 채운다.
// 서버 컴포넌트로 둔다. 클라이언트 상태나 인증 코드를 넣지 않는다.
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "moss - 소개",
  description:
    "moss는 메모, 보드, 사진 카드를 만들어 쓰는 웹 서비스입니다. 생각은, 머무는 동안 형태가 된다.",
};

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-[15px] leading-7">
      <h1 className="text-2xl font-medium">moss</h1>
      <p className="mt-2 text-sm text-neutral-500">
        생각은, 머무는 동안 형태가 된다.
      </p>

      <h2 className="mt-8 text-lg font-medium">moss는 무엇인가요</h2>
      <p className="mt-4">
        moss는 메모, 보드, 사진 카드를 만들어 쓰는 웹 서비스입니다. 로그인한 사용자는 AI
        요약과 연결 기능을 쓸 수 있고, 외부 AI 클라이언트를 MCP로 연결할 수 있습니다.
        박동환이 혼자 운영하는 무료 개인 서비스입니다.
      </p>

      <h2 className="mt-8 text-lg font-medium">Google 로그인과 사용자 데이터</h2>
      <p className="mt-4">
        moss는 이메일과 비밀번호 또는 Google 계정으로 로그인할 수 있습니다. Google
        로그인을 쓰면 Google 계정 식별자, 이름, 프로필 이미지를 받습니다. 이 정보는
        계정을 만들고 로그인한 사용자를 알아보는 데만 씁니다. 광고나 외부 판매에 쓰지
        않습니다.
      </p>
      <p className="mt-4">
        자세한 내용은 <a className="underline" href="/legal/privacy">개인정보 처리방침</a>과{" "}
        <a className="underline" href="/legal/terms">이용약관</a>에 있습니다.
      </p>

      <h2 className="mt-8 text-lg font-medium">서비스 열기</h2>
      <p className="mt-4">
        <Link className="underline" href="/">moss 열기</Link>
      </p>

      <h2 className="mt-8 text-lg font-medium">운영자 연락처</h2>
      <p className="mt-4">
        박동환, <a className="underline" href="mailto:rakddh@gmail.com">rakddh@gmail.com</a>
      </p>

      <h2 className="mt-8 text-lg font-medium">English summary</h2>
      <p className="mt-4">
        moss is a web service for making notes, boards, and photo cards. It is a free
        personal service run by one operator. If you sign in with Google, moss receives
        your Google account ID, name, and profile image, and uses them only to create
        your account and recognize you when you sign in. See the{" "}
        <a className="underline" href="/legal/privacy">privacy policy</a>.
      </p>
    </main>
  );
}
