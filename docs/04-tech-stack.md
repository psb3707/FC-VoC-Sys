# 04. 기술 스택 정의서

> 상태: 제안(ADR-003). **버전은 11/13 스파이크로 확인한 뒤 이 표에 고정**한다.

## 1. 선택
| 영역 | 선택 | 근거 | 제외한 대안 |
|---|---|---|---|
| 런타임 | Java 21 LTS + Spring Boot 안정판(착수 시점) | 개발자 숙련도가 일정의 최대 자산. 17보다 지원 기간이 길다 | Java 17(요청 기본 가정). 제약이 있으면 17로 후퇴 가능 |
| 빌드 | Maven + Wrapper | 설정 단순, 흔함 | Gradle(학습·설정 비용) |
| 저장소 | H2 파일 모드 + Spring Data JPA | Spring Boot 궁합, 콘솔 내장, 파일 삭제와 재시드로 초기화 단순 | SQLite(Dialect 추가 필요) |
| 화면 | 정적 HTML + Alpine.js + 공용 CSS | 빌드·Node 불필요, JAR 하나로 배포, 상태 관리에 충분 | Thymeleaf(상태 관리 불편), React(3주 일정에 과함) |
| LLM 호출 | 자체 `LlmGateway` + Spring `RestClient` | 프롬프트·스키마·기록 직접 통제, 사내 모델 교체 시 추상화 방해 없음 | Spring AI(프레임워크 버전 종속) |
| 스키마 검증 | networknt json-schema-validator | 공급자와 무관하게 서버에서 동일 검증 | 공급자 기능만 의존 |
| 설정 | YAML, JAR 밖 `config/` | 재빌드 없이 교체 | DB 설정 |
| 테스트 | JUnit 5, AssertJ, ArchUnit | 마스킹 말뭉치·계층 경계 검증 | |
| 실행 | `start.cmd` / `reset.cmd` | 한 번의 명령, 시드 초기화 | |

## 2. 제약
- 외부 통신은 LLM API뿐. CDN 금지, Alpine.js 등은 `vendor/`에 포함.
- API 키: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` 환경 변수만.
- 개발 PC에는 현재 git, Python만 있음. JDK/Maven 설치는 11/13 이전에 확인 [가정 G1, G2]. 불가 시 ZIP 배포 JDK를 `.tools/`에 둔다(Git 제외).

## 3. 스파이크 항목 (`spikes/`, Git 제외, 코드는 버림)
| 항목 | 확인 내용 | 결과 기록 |
|---|---|---|
| 환경 | JDK 설치, Maven Central 접근 | 아래 표 |
| 프록시 | 사내망/프록시 경유 LLM 호출, SSL 검사 인증서 | |
| 공급자 비교 | OpenAI vs Claude: 지연, 구조화 출력 안정성, 한국어 되묻기 품질 | |
| 응답 형식 | 실제 응답이 `07-ai-design.md` 스키마와 맞는지 | |

| 항목 | 결과 | 확인일 |
|---|---|---|
| JDK 버전 | (미확인) | |
| Maven Central | (미확인) | |
| LLM 호출(프록시) | (미확인) | |
| 선택 공급자·모델 | (미확인, 11/13 결정 후 실험 기간 고정) | |
| 고정 버전(Boot, Alpine 등) | (미확인) | |

## 4. 후퇴 경로
- Java 21 불가 → 17. Spring Boot 버전은 선택한 Java에 맞춰 조정.
- H2 문제 → SQLite. 접근은 JPA 뒤에 있어 영향 제한.
- 두 번째 공급자·`compatible` 어댑터 완성도는 일정 초과 시 축소 대상(12번 문서).
