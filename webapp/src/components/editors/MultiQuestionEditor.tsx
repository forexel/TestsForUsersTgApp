import { FormEvent, useEffect, useMemo, useState } from "react";
import type { AxiosInstance } from "axios";
import WebApp from "@twa-dev/sdk";

import { AnswerDraft, QuestionDraft, ResultDraft, TestDraft, ScoringMode } from "../../types";

type Props = { api: AxiosInstance; onClose: () => void };

const STORAGE_KEY = "multi_draft_v1";

const defaultAnswer = (order: number): AnswerDraft => ({ orderNum: order, text: "" });
const defaultQuestion = (order: number, answersCount = 3): QuestionDraft => ({
  orderNum: order,
  text: "",
  answers: Array.from({ length: answersCount }, (_, i) => defaultAnswer(i + 1)),
});
const defaultResult = (): ResultDraft => ({ title: "Результат", description: "", minScore: null, maxScore: null });

const initialDraft = (): TestDraft => ({
  slug: "",
  title: "",
  type: "multi",
  description: "",
  isPublic: true,
  scoringMode: "majority",
  questions: [defaultQuestion(1)],
  answers: [],
  results: [defaultResult()],
});

export function MultiQuestionEditor({ api, onClose }: Props) {
  const [draft, setDraft] = useState<TestDraft>(() => {
    try {
      const raw = typeof window !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null;
      if (raw) return JSON.parse(raw) as TestDraft;
    } catch {}
    return initialDraft();
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const canSubmit = useMemo(() => {
    const titleOk = draft.title.trim().length > 2;
    const hasQuestions = draft.questions.length > 0;
    const eachQ = draft.questions.every(q => q.text.trim().length > 0 && q.answers.length >= 2 && q.answers.every(a => (a.text ?? '').trim().length > 0));
    return titleOk && hasQuestions && eachQ;
  }, [draft.title, draft.questions]);
  const updateDraft = <K extends keyof TestDraft>(key: K, value: TestDraft[K]) => setDraft((p) => ({ ...p, [key]: value }));

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      }
    } catch {}
  }, [draft]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = toApiPayload(draft);
      const response = await api.post("/tests", payload, { headers: { "X-Telegram-Init-Data": WebApp.initData ?? "" } });
      let slug = String((response?.data && (response.data.slug || (response as any)?.data?.data?.slug || (response as any)?.data?.test?.slug)) || "");
      if (!slug && (response as any)?.data?.id) {
        try {
          const r2 = await api.get(`/tests/${(response as any).data.id}`, { headers: { "X-Telegram-Init-Data": WebApp.initData ?? "" } });
          slug = String((r2 as any)?.data?.slug || "");
        } catch {}
      }
      WebApp.HapticFeedback?.notificationOccurred?.("success");
      try { if (typeof window !== 'undefined') sessionStorage.removeItem(STORAGE_KEY); } catch {}
      try { window.dispatchEvent(new CustomEvent("test_created", { detail: { slug, title: draft.title, type: "multi" } })); } catch {}
      if (slug) {
        const next = `#/testsuccess?slug=${encodeURIComponent(slug)}`;
        try { window.location.assign(next); } catch { window.location.hash = next; }
      } else {
        try { window.location.assign("#/home"); } catch { window.location.hash = "#/home"; }
      }
    } catch (err: any) {
      WebApp.HapticFeedback?.notificationOccurred?.("error");
      const message = err?.response?.data?.detail ?? err?.message ?? "Не удалось сохранить тест";
      setError(String(message));
    } finally { setSubmitting(false); }
  };

  // Intro step: title + scoring choice
  if (step === 1) {
    return (
      <section className="card form-card">
        <h2 className="form-title">Название теста</h2>
        <input
          required
          maxLength={255}
          value={draft.title}
          placeholder="Название"
          onChange={(e) => updateDraft("title", e.target.value)}
        />
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ marginBottom: 6 }}>Как считать результат?</div>
          <label className="checkbox">
            <input
              type="radio"
              name="scoring"
              checked={(draft.scoringMode ?? "majority") === "majority"}
              onChange={() => updateDraft("scoringMode", "majority")}
            />
            Количество больших ответов
          </label>
          <label className="checkbox">
            <input
              type="radio"
              name="scoring"
              checked={(draft.scoringMode ?? "majority") === "points"}
              onChange={() => updateDraft("scoringMode", "points")}
            />
            По сумме очков
          </label>
        </div>
        <div className="actions bottom">
          <button className="secondary" type="button" onClick={onClose}>Назад</button>
          <button type="button" disabled={!draft.title.trim()} onClick={() => setStep(2)}>Далее</button>
        </div>
      </section>
    );
  }

  return (
    <section className="card form-card">
      {step === 2 && (
        <>
          <QuestionList draft={draft} onChange={updateDraft} />
          {error && <p className="error">{error}</p>}
          <footer className="actions bottom">
            <button type="button" className="secondary" onClick={() => setStep(1)} disabled={submitting}>Назад</button>
            <button type="button" onClick={() => setStep(3)} disabled={!canSubmit || submitting}>Далее</button>
          </footer>
        </>
      )}

      {step === 3 && (
        <form className="form" onSubmit={handleSubmit}>
          <h2 className="form-title">Результат</h2>
          <ResultList draft={draft} onChange={updateDraft} />
          {error && <p className="error">{error}</p>}
          <footer className="actions bottom">
            <button type="button" className="secondary" onClick={() => setStep(2)} disabled={submitting}>Назад</button>
            <button type="submit" disabled={!canSubmit || submitting}>{submitting ? "Сохранение..." : "Создать"}</button>
          </footer>
        </form>
      )}
    </section>
  );
}

function QuestionList({ draft, onChange }: { draft: TestDraft; onChange: <K extends keyof TestDraft>(key: K, value: TestDraft[K]) => void }) {
  const questions = draft.questions;
  const updateQuestion = (index: number, value: QuestionDraft) => {
    const next = [...questions];
    next[index] = value;
    onChange("questions", next.map((item, idx) => ({ ...item, orderNum: idx + 1 })));
  };
  const addQuestion = () => {
    const count = questions[0]?.answers?.length || 3;
    onChange("questions", [...questions, defaultQuestion(questions.length + 1, count)]);
  };
  return (
    <div className="editor-section">
      <h3>Вопросы</h3>
      {questions.map((q, idx) => (
        <div key={idx} className="editor-block">
          <label className="question-label">
            <span className="question-label__title">Вопрос {idx + 1}</span>
            <textarea
              required
              placeholder="Введите текст вопроса"
              value={q.text}
              onChange={(e) => updateQuestion(idx, { ...q, text: e.target.value })}
            />
          </label>
          <AnswerList
            answers={q.answers}
            onChange={(answers) => {
              const target = answers.length;
              const mapped = answers.map((a, i) => ({ ...a, orderNum: i + 1 }));
              const updated = { ...q, answers: mapped };
              const next = questions.map((it, i) => {
                if (i === idx) return updated;
                if (it.answers.length === target) return it;
                if (it.answers.length < target) {
                  const extras = Array.from({ length: target - it.answers.length }, (_, k) => defaultAnswer(it.answers.length + k + 1));
                  return { ...it, answers: [...it.answers, ...extras].map((a, j) => ({ ...a, orderNum: j + 1 })) };
                }
                return { ...it, answers: it.answers.slice(0, target).map((a, j) => ({ ...a, orderNum: j + 1 })) };
              });
              onChange("questions", next.map((it, i) => ({ ...it, orderNum: i + 1 })));
              onChange("results", Array.from({ length: target }, (_, i) => draft.results[i] || defaultResult()));
            }}
          />
        </div>
      ))}
      <button type="button" className="tertiary" onClick={addQuestion}>Добавить вопрос</button>
    </div>
  );
}

function AnswerList({ answers, onChange }: { answers: AnswerDraft[]; onChange: (answers: AnswerDraft[]) => void }) {
  const updateAnswer = (index: number, value: AnswerDraft) => {
    const next = [...answers];
    next[index] = value;
    onChange(next.map((item, idx) => ({ ...item, orderNum: idx + 1 })));
  };
  return (
    <div className="answers">
      {answers.map((answer, idx) => (
        <div key={idx} className="answer-row">
          <div className="answer-col">
            <input
              required
              placeholder={`Ответ ${idx + 1}`}
              value={answer.text ?? ""}
              onChange={(e) => updateAnswer(idx, { ...answer, text: e.target.value })}
            />
          </div>
        </div>
      ))}
      <button type="button" className="tertiary" onClick={() => onChange([...answers, { orderNum: answers.length + 1, text: "" }])}>Добавить ответ</button>
    </div>
  );
}

function ResultList({ draft, onChange }: { draft: TestDraft; onChange: <K extends keyof TestDraft>(key: K, value: TestDraft[K]) => void }) {
  const results = draft.results;
  const update = (i: number, v: ResultDraft) => onChange("results", results.map((r, idx) => (idx === i ? v : r)));
  const add = () => onChange("results", [...results, defaultResult()]);
  const remove = (i: number) => onChange("results", results.filter((_, idx) => idx !== i).length ? results.filter((_, idx) => idx !== i) : [defaultResult()]);
  return (
    <div className="editor-section">
      <h3>Результат</h3>
      {results.map((r, idx) => (
        <div key={idx} className="editor-block">
          <label>
            {`Результат ${idx + 1}`}
            <textarea
              placeholder={`Введите результат ${idx + 1}`}
              value={r.description ?? ""}
              onChange={(e) =>
                update(idx, {
                  ...r,
                  description: e.target.value,
                  title: r.title || `Результат ${idx + 1}`,
                })
              }
            />
          </label>
          {results.length > 1 && (
            <button type="button" className="secondary" onClick={() => remove(idx)}>Удалить</button>
          )}
        </div>
      ))}
      <button type="button" className="tertiary" onClick={add}>Добавить результат</button>
    </div>
  );
}

function toApiPayload(draft: TestDraft) {
  const base: any = {
    title: draft.title,
    type: "multi",
    description: draft.description,
    is_public: true,
    questions: draft.questions.map((q, qi) => ({
      order_num: qi + 1,
      text: q.text,
      answers: q.answers.map((a, ai) => ({
        order_num: ai + 1,
        text: a.text,
        explanation_title: (a as any).explanationTitle,
        explanation_text: (a as any).explanationText,
      })),
    })),
    answers: [],
    results: draft.results.map((r, i) => ({
      title: r.title && r.title.trim() ? r.title : `Результат ${i + 1}`,
      description: r.description,
      min_score: r.minScore,
      max_score: r.maxScore,
    })),
  };
  if ((draft.scoringMode ?? "majority") === "points") {
    const qCount = draft.questions.length || 1;
    const aCount = draft.questions[0]?.answers?.length || 1;

    // Сумма порядков: 1..aCount в каждом из qCount вопросов
    const minSum = 1 * qCount;          // минимум — везде выбран 1-й вариант
    const maxSum = aCount * qCount;     // максимум — везде выбран aCount-й вариант

    const buckets = aCount;             // число интервалов = числу ответов
    const totalValues = maxSum - minSum + 1; // количество целочисленных сумм
    const baseSize = Math.floor(totalValues / buckets);
    const remainder = totalValues % buckets; // первые remainder интервалов шире на 1

    // гарантируем длину results ровно равной buckets
    base.results = Array.from({ length: buckets }, (_, i) => base.results[i] || {
      title: `Результат ${i + 1}`,
      description: base.results[i]?.description ?? null,
      min_score: null,
      max_score: null,
    });

    let start = minSum;
    base.results = base.results.map((r: any, i: number) => {
      const size = baseSize + (i < remainder ? 1 : 0);
      const end = start + size - 1;
      const out = {
        ...r,
        min_score: r.min_score ?? start,
        max_score: r.max_score ?? end,
      };
      start = end + 1;
      return out;
    });
  }
  if (draft.slug && draft.slug.trim()) base.slug = draft.slug.trim();
  return base;
}

export default MultiQuestionEditor;
