#!/usr/bin/env python3
"""업무 분류·담당 그룹 골든셋 검사 (ADR-031, docs/11-test-plan.md 1-2절).

docs/golden/business-classify-golden.json 의 가상 문의를 실제 브라우저에서 ApiClient.classifyInquiry 로 분류하고
기대 업무·질문·현업 담당 그룹·IT 담당 그룹·대체 경로와 비교한다.
골든셋은 "검토 전 예시"(실무자 검토 전, 규칙 작성자와 같은 사람이 만든 개발용 세트)다.
이 결과는 규칙 기반 분류의 결과이며 LLM 자연어 이해 성능이 아니다.
결과표는 target/golden/business-classify-result.md 에 쓴다(Git 제외).
"""
import json
import pathlib
import tempfile

from field_verification_check import open_real, run
from ui_check import Chrome, find_browser

ROOT = pathlib.Path(__file__).resolve().parents[1]
GOLDEN = ROOT / "docs" / "golden" / "business-classify-golden.json"
OUT = ROOT / "target" / "golden" / "business-classify-result.md"


def classify_all(chrome, cases):
    open_real(chrome, "index.html", "#role=FC")
    return run(chrome, "const cases = " + json.dumps(cases, ensure_ascii=False) + """;
      const out = [];
      for (const c of cases) {
        const r = await ApiClient.classifyInquiry({ oneLine: c.text, business: c.business || '', diagnosticMode: c.diagnosticMode || '',
          businessAnswer: c.businessAnswer || null, businessQuestionId: c.businessQuestionId || null });
        const it = await ApiClient.getItGroupFor(r.confirmed ? r.businessCode : null);
        out.push({ id: c.id, confirmed: r.confirmed, parent: r.confirmed ? r.parentCode : null, business: r.confirmed ? r.businessCode : null,
          question: r.question ? r.question.id : null, inbox: r.inboxId, itGroup: it ? it.id : null, fallback: r.fallback || null,
          basis: r.basis.map(b => b.label + ':' + b.text) });
      }
      return out;
    """)


def main():
    data = json.loads(GOLDEN.read_text(encoding="utf-8"))
    cases = data["cases"]
    assert len(cases) >= 30, "골든셋은 30건 이상"
    browser = find_browser()
    if not browser:
        raise SystemExit("Chrome/Edge를 찾지 못했습니다.")
    with tempfile.TemporaryDirectory(prefix="business-classify-") as profile:
        chrome = Chrome(browser, profile)
        try:
            got = classify_all(chrome, cases)
        finally:
            chrome.close()
    by = {g["id"]: g for g in got}
    rows, fails = [], []
    m = {"business": 0, "inbox": 0, "it": 0, "q_need": 0, "q_hit": 0, "q_extra": 0, "none_need": 0, "none_ok": 0, "fallback": 0}
    for c in cases:
        e, g = c["expect"], by[c["id"]]
        ok_business = e["confirmed"] == g["confirmed"] and e["parent"] == g["parent"] and e["business"] == g["business"] and e["question"] == g["question"]
        ok_inbox = e["inbox"] == g["inbox"]
        ok_it = e["itGroup"] == g["itGroup"]
        ok_fb = (e.get("fallback") or None) == g["fallback"]
        m["business"] += ok_business
        m["inbox"] += ok_inbox
        m["it"] += ok_it
        m["fallback"] += ok_fb
        if e["question"]:
            m["q_need"] += 1
            m["q_hit"] += g["question"] == e["question"]
        elif g["question"]:
            m["q_extra"] += 1
        if not e["confirmed"] and not e["question"] and e["inbox"] in ("IB-UNCLASSIFIED", "IB-TRIAGE"):
            m["none_need"] += 1
            m["none_ok"] += g["inbox"] == e["inbox"] and not g["confirmed"]
        passed = ok_business and ok_inbox and ok_it and ok_fb
        if not passed:
            fails.append((c, g))
        exp = e["business"] or ("질문 " + e["question"] if e["question"] else "미확정")
        res = g["business"] or ("질문 " + g["question"] if g["question"] else "미확정")
        rows.append(f"| {c['id']} | {c['type']} | {c['text']}{' · 고른 업무 ' + c['business'] if c.get('business') else ''}"
                    f"{' · 진단 ' + c['diagnosticMode'] if c.get('diagnosticMode') else ''}{' · 답 ' + c['businessAnswer'] if c.get('businessAnswer') else ''}"
                    f" | {exp} / {e['inbox']} / {e['itGroup']} | {res} / {g['inbox']} / {g['itGroup']}{' / ' + g['fallback'] if g['fallback'] else ''}"
                    f" | {'통과' if passed else '불일치'} |")
    n = len(cases)
    summary = [
        f"- 업무 분류(업무·확정 여부·질문이 모두 기대와 같음): {m['business']}/{n}",
        f"- 현업 담당 그룹: {m['inbox']}/{n}",
        f"- IT 담당 그룹: {m['it']}/{n}",
        f"- 대체 경로(담당자 부재·매핑 누락): {m['fallback']}/{n}",
        f"- 필요한 질문을 물음: {m['q_hit']}/{m['q_need']}",
        f"- 불필요한 질문: {m['q_extra']}건",
        f"- 분류 불가·복수 업무를 공통·미분류 문의함으로: {m['none_ok']}/{m['none_need']}",
    ]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("# 업무 분류 골든셋 결과 (검토 전 예시, 규칙 분류)\n\n" + "\n".join(summary) +
                   "\n\n| ID | 유형 | 문의(가상) | 기대 업무 / 현업 / IT | 결과 | 판정 |\n|---|---|---|---|---|---|\n" + "\n".join(rows) + "\n",
                   encoding="utf-8")
    print("\n".join(summary))
    for c, g in fails:
        print("불일치", c["id"], c["text"], "기대", c["expect"], "결과", {k: g[k] for k in ("confirmed", "business", "question", "inbox", "itGroup", "fallback")}, g["basis"])
    if fails:
        raise SystemExit(f"FAIL: 골든셋 {len(fails)}건 불일치 (결과표 {OUT.relative_to(ROOT)})")
    print(f"PASS: 골든셋 {n}건 (검토 전 예시, 규칙 분류). 결과표 {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
