# ADR-003. 기술 스택
- 상태: **제안** (버전은 11/13 스파이크 후 04번 문서에 고정, G1에서 승인)
- 배경: 요청의 기본 가정(Java 17 + Spring Boot, H2/SQLite)은 임시이며 최적안 제안을 요청받았다.
- 결정(안): Java 21 LTS + Spring Boot, Maven, H2 파일 DB + JPA, 정적 HTML + Alpine.js, 자체 `LlmGateway` + `RestClient`, networknt 스키마 검증, YAML 설정.
- 근거와 제외한 대안: `04-tech-stack.md`.
- 영향: 개발 PC에 JDK 필요(현재 없음). 불가 시 ZIP JDK 또는 Java 17 후퇴.
