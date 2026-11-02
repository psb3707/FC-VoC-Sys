# ADR-003. 기술 스택
- 상태: **제안** (버전은 M2 전 스파이크 후 04번 문서에 고정, 스파이크 완료 후 사용자 확인으로 확정)
- 배경: 요청의 기본 가정(Java 17 + Spring Boot, H2/SQLite)은 임시이며 최적안 제안을 요청받았다.
- 결정(안): Java 21 LTS + Spring Boot, Maven, H2 파일 DB + JPA, 정적 HTML + 순수 JavaScript, 자체 `LlmGateway` + `RestClient`, networknt 스키마 검증, YAML 설정.
- 근거와 제외한 대안: `04-tech-stack.md`.
- 영향: 개발 PC에 JDK 필요(현재 없음). 불가 시 ZIP JDK 또는 Java 17 후퇴.
- 변경: ADR-009로 확정 시점 변경 (G1 → G2).
- 변경: 2026-11-02 사용자 결정으로 Alpine.js 미사용(순수 JS)
