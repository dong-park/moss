// 이용약관 초안. 운영자가 읽고 승인한 뒤 공개한다.
// 약관을 고칠 때 서버의 MOSS_TERMS_VERSION과 웹의 NEXT_PUBLIC_MOSS_TERMS_VERSION 버전 문자열도 함께 올린다.

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-[15px] leading-7">
      <h1 className="text-2xl font-medium">이용약관</h1>
      <p className="mt-2 text-sm text-neutral-500">시행일: 2026-11-08</p>

      <p className="mt-6">
        이 약관은 moss 서비스를 쓰는 조건을 정합니다. moss는 박동환이 혼자
        운영하는 무료 개인 서비스입니다. 가입할 때 이 약관에 동의해야 서비스를 쓸 수
        있습니다.
      </p>

      <h2 className="mt-8 text-lg font-medium">제1조 서비스 내용</h2>
      <p className="mt-4">
        moss는 메모, 보드, 사진 카드를 만들어 쓰는 웹 서비스입니다. 서비스 주소는{" "}
        <code>https://moss.dongpark.dev</code>입니다. 로그인한 사용자는 AI 요약과 연결
        기능을 쓸 수 있고, 외부 AI 클라이언트를 MCP로 연결할 수 있습니다.
      </p>

      <h2 className="mt-8 text-lg font-medium">제2조 가입과 계정</h2>
      <p className="mt-4">
        전체 가입 계정은 100개로 제한합니다. 상한이 차면 새 가입이 닫힙니다. 한 사람이
        여러 계정을 만들지 않습니다. 계정과 비밀번호는 본인이 관리합니다.
      </p>
      <p className="mt-4">
        이번 공개 버전에는 비밀번호 재설정 화면이 없습니다. 비밀번호를 잊으면 운영자에게
        직접 요청해 처리합니다.
      </p>

      <h2 className="mt-8 text-lg font-medium">제3조 콘텐츠 권리</h2>
      <p className="mt-4">
        사용자가 올린 메모, 보드, 사진의 권리는 사용자에게 있습니다. 운영자는 서비스를
        제공하고 백업하는 데 필요한 범위에서만 콘텐츠를 저장하고 처리합니다. 운영자는
        콘텐츠를 광고나 외부 판매에 쓰지 않습니다.
      </p>

      <h2 className="mt-8 text-lg font-medium">제4조 금지 행위</h2>
      <p className="mt-4">다음 행위를 금지합니다.</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>법을 어기거나 다른 사람의 권리를 침해하는 콘텐츠를 올리는 행위</li>
        <li>다른 사용자의 계정이나 콘텐츠에 무단으로 접근하는 행위</li>
        <li>서버에 과도한 부하를 주거나 서비스 동작을 방해하는 행위</li>
        <li>자동 수단으로 계정을 대량 생성하거나 서비스를 악용하는 행위</li>
      </ul>
      <p className="mt-4">
        이 약관을 어기면 운영자는 사전 통지 없이 해당 계정의 이용을 제한하거나 삭제할 수
        있습니다.
      </p>

      <h2 className="mt-8 text-lg font-medium">제5조 서비스 변경과 중단</h2>
      <p className="mt-4">
        moss는 서버 한 대로 운영하는 개인 서비스입니다. 운영자는 서비스 내용을 바꾸거나
        중단할 수 있습니다. 서비스를 완전히 종료할 때는 데이터를 내려받을 수 있도록 미리
        안내하려고 노력합니다. 다만 개인 운영 특성상 장애나 점검으로 서비스가 멈출 수
        있습니다.
      </p>

      <h2 className="mt-8 text-lg font-medium">제6조 책임 제한</h2>
      <p className="mt-4">
        moss는 무료로 &ldquo;있는 그대로&rdquo; 제공합니다. 운영자는 데이터 손실, 서비스
        중단, 사용 중 생긴 손해에 법이 허용하는 한도에서 책임을 지지 않습니다. 중요한
        데이터는 사용자가 따로 보관하기를 권합니다.
      </p>

      <h2 className="mt-8 text-lg font-medium">제7조 탈퇴</h2>
      <p className="mt-4">
        이번 공개 버전에는 사용자가 직접 계정을 지우는 화면이 없습니다. 탈퇴하려면
        운영자에게 rakddh@gmail.com로 요청합니다. 요청을 받으면 운영자가 계정과 콘텐츠를
        지웁니다.
      </p>

      <h2 className="mt-8 text-lg font-medium">제8조 약관 변경</h2>
      <p className="mt-4">
        운영자는 이 약관을 바꿀 수 있습니다. 약관을 바꾸면 이 페이지에 새 내용과 시행일을
        올립니다. 바뀐 약관에 다시 동의해야 서비스를 계속 쓸 수 있습니다.
      </p>

      <h2 className="mt-8 text-lg font-medium">문의</h2>
      <p className="mt-4">
        약관에 대한 문의는 박동환, rakddh@gmail.com로 보냅니다. 개인정보 처리는{" "}
        <a href="/legal/privacy" className="underline">
          개인정보 처리방침
        </a>
        을 따릅니다.
      </p>
    </main>
  );
}
