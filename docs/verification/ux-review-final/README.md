# 검증 아티팩트

`original-export.tar.gz`는 원격에서 받은 13개 파일을 바이트 그대로 보존한다. 안의 `SHA256SUMS.txt`(여기서는 `EXPORT-SHA256SUMS.txt`)는 원본 로그·패치·보고서의 체크섬이다. 원본은 추출한 폴더에서 `shasum -a 256 -c SHA256SUMS.txt`로 확인한다.

읽기용 `.log` 사본은 Git 공백 검사에 맞춰 진행 표시의 CR·줄 끝 공백·마지막 빈 줄만 정리했다. 실행 내용과 결과는 바꾸지 않았다. `.patch.gz`를 풀면 원본 델타 패치가 나온다. 최종 소스 manifest와 보고서는 원본 그대로다.

이 폴더의 `SHA256SUMS.txt`는 원본 압축파일과 읽기용 사본을 포함한 현재 아티팩트의 체크섬이다. 앱 소스의 검증 대상은 `final-source.manifest.json`이다.
