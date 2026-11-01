/**
 * 운영자가 승인한 약관 버전. 서버의 MOSS_TERMS_VERSION과 같은 값이어야 가입이 열린다.
 * 비어 있으면 서버가 신규가입을 닫는다. 읽는 시점에 평가해 테스트가 바꿀 수 있게 한다.
 */
export function termsVersion(): string {
  return process.env.NEXT_PUBLIC_MOSS_TERMS_VERSION ?? "";
}
