// 개인정보 처리방침 초안. 운영자가 읽고 승인한 뒤 공개한다.
// 수집·처리 항목은 2026-11-08 기준 코드 근거로 작성했다. 코드가 바뀌면 이 문서도 함께 고친다.

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-[15px] leading-7">
      <h1 className="text-2xl font-medium">개인정보 처리방침</h1>
      <p className="mt-2 text-sm text-neutral-500">시행일: 2026-11-08</p>

      <p className="mt-6">
        박동환은 moss 서비스를 운영하면서 사용자의 개인정보를 아래와 같이
        처리합니다. moss는 서버 한 대로 운영하는 무료 개인 서비스입니다. 이 방침은 한국
        개인정보 보호법을 따릅니다.
      </p>

      <h2 className="mt-8 text-lg font-medium">1. 처리하는 개인정보 항목</h2>
      <p className="mt-4">서비스는 다음 항목을 처리합니다.</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          계정 정보: 이메일, 비밀번호, 이름. 구글 로그인을 쓰면 구글 계정 식별자와 이름,
          프로필 이미지.
        </li>
        <li>약관 동의 기록: 동의한 약관 버전과 동의 시각.</li>
        <li>
          사용자 콘텐츠: 사용자가 만든 메모, 보드, 사진, 첨부 파일과 그 파일 이름·크기·형식.
        </li>
        <li>
          접속·보안 정보: 로그인과 가입 요청의 IP 주소. IP는 짧은 시간 횟수 제한에만 쓰고
          데이터베이스에 저장하지 않습니다.
        </li>
        <li>
          연결 기록: 외부 AI 클라이언트를 MCP로 연결하면 연결 토큰의 해시값과 연결한
          클라이언트 이름, 연결·사용·해지 시각.
        </li>
        <li>
          서비스 로그: 운영자가 서버 동작과 오류를 확인하기 위한 요청 로그. 메모 본문과
          비밀번호는 로그에 남기지 않습니다.
        </li>
      </ul>
      <p className="mt-4">
        비밀번호는 평문으로 저장하지 않습니다. bcrypt 해시로 바꿔 저장하므로 운영자도
        원래 비밀번호를 알 수 없습니다.
      </p>

      <h2 className="mt-8 text-lg font-medium">2. 처리 목적</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>계정 생성과 로그인, 본인 확인</li>
        <li>메모·보드·사진 저장과 동기화</li>
        <li>로그인 사용자의 AI 요약·연결 기능 제공</li>
        <li>부정 가입과 무차별 로그인 시도 차단</li>
        <li>서비스 장애 대응과 백업</li>
      </ul>

      <h2 className="mt-8 text-lg font-medium">3. 보유 기간과 파기</h2>
      <p className="mt-4">
        계정 정보와 사용자 콘텐츠는 계정을 지울 때까지 보관합니다. 탈퇴하면 운영자가
        계정과 콘텐츠를 지웁니다.
      </p>
      <p className="mt-4">
        백업은 데이터베이스 전체와 첨부 파일을 날짜별 파일로 만듭니다. 백업은 30일 동안
        보관합니다. 30일이 지난 백업 파일은 자동으로 지웁니다. 탈퇴한 사용자의 데이터는
        백업에 최대 30일 남았다가, 그 백업이 지워질 때 함께 사라집니다.
      </p>

      <h2 className="mt-8 text-lg font-medium">4. 제3자 제공</h2>
      <p className="mt-4">
        운영자는 사용자의 개인정보를 제3자에게 판매하거나 제공하지 않습니다. 법이 정한
        절차에 따른 요청이 있을 때만 예외로 제공합니다.
      </p>

      <h2 className="mt-8 text-lg font-medium">5. 처리 위탁과 국외 이전</h2>
      <p className="mt-4">
        AI 기능을 쓰면 해당 메모 본문이 아래 해외 회사의 AI API로 전송됩니다. 이 전송은
        국외 이전에 해당합니다. AI 기능은 로그인 사용자가 직접 실행할 때만 호출되고 횟수
        제한이 있습니다.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-neutral-300 text-left">
              <th className="py-2 pr-4 font-medium">받는 회사</th>
              <th className="py-2 pr-4 font-medium">목적</th>
              <th className="py-2 pr-4 font-medium">보내는 항목</th>
              <th className="py-2 font-medium">이전 국가</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-neutral-200">
              <td className="py-2 pr-4">Anthropic</td>
              <td className="py-2 pr-4">메모 요약, 연결 라벨 생성</td>
              <td className="py-2 pr-4">사용자가 고른 메모 본문</td>
              <td className="py-2">미국</td>
            </tr>
            <tr>
              <td className="py-2 pr-4">OpenAI</td>
              <td className="py-2 pr-4">메모 임베딩 생성</td>
              <td className="py-2 pr-4">사용자가 고른 메모 본문</td>
              <td className="py-2">미국</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-4">
        운영자는 전송한 메모 본문과 AI 응답을 서버에 따로 저장하지 않습니다. 두 회사의
        데이터 처리는 각 회사의 개인정보 정책을 따릅니다.
      </p>

      <h2 className="mt-8 text-lg font-medium">6. 쿠키와 브라우저 저장소</h2>
      <p className="mt-4">
        서비스는 광고·추적 쿠키를 쓰지 않습니다. 로그인 상태를 유지하려고 인증 토큰을
        사용자 브라우저의 저장소에 보관합니다. 로그아웃하면 서버가 해당 토큰을 폐기합니다.
      </p>

      <h2 className="mt-8 text-lg font-medium">7. 정보주체의 권리</h2>
      <p className="mt-4">
        사용자는 자기 개인정보의 열람, 정정, 삭제, 처리 정지를 요청할 수 있습니다.
        이번 공개 버전에는 계정을 직접 지우는 화면이 없습니다. 권리를 행사하려면 운영자에게
        rakddh@gmail.com로 요청합니다. 운영자가 확인 후 처리합니다.
      </p>

      <h2 className="mt-8 text-lg font-medium">8. 안전성 확보 조치</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>비밀번호는 bcrypt 해시로 저장합니다.</li>
        <li>MCP 연결 토큰은 원문 대신 해시값만 저장합니다.</li>
        <li>로그인과 가입에 IP 기준 횟수 제한을 둡니다.</li>
        <li>백업 파일은 소유자만 읽도록 권한을 제한합니다.</li>
        <li>통신은 HTTPS로 암호화합니다.</li>
      </ul>

      <h2 className="mt-8 text-lg font-medium">9. 개인정보 보호책임자</h2>
      <p className="mt-4">
        개인정보 처리와 문의, 권리 행사는 아래로 연락합니다.
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>책임자: 박동환</li>
        <li>연락처: rakddh@gmail.com</li>
      </ul>

      <h2 className="mt-8 text-lg font-medium">10. 방침 변경</h2>
      <p className="mt-4">
        이 방침을 바꾸면 이 페이지에 새 내용과 시행일을 올립니다. 중요한 변경은 서비스
        안에서 따로 안내합니다.
      </p>
    </main>
  );
}
