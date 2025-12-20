import { FormEvent, useEffect, useMemo, useState } from "react";
import type { AxiosInstance } from "axios";
import WebApp from "@twa-dev/sdk";
import { compressImage } from "../../utils/image";

import { AnswerDraft, QuestionDraft, ResultDraft, TestDraft, ScoringMode } from "../../types";
import type { TestRead } from "../../types/tests";

type Props = { api: AxiosInstance; onClose: () => void; editSlug?: string };

const STORAGE_KEY = "multi_draft_v1";
const BG_COLORS = ["3E8BBF", "ED7AC3", "73C363", "9A7071"];

const defaultAnswer = (order: number): AnswerDraft => ({ orderNum: order, text: "" });
const defaultQuestion = (order: number, answersCount = 2): QuestionDraft => ({
  orderNum: order,
  text: "",
  answers: Array.from({ length: answersCount }, (_, i) => defaultAnswer(i + 1)),
});
const defaultResult = (): ResultDraft => ({ title: "Результат", description: "", minScore: null, maxScore: null });

type PointRange = { min: number; max: number };

function buildPointRanges(questionCount: number, answerCount: number): PointRange[] {
  const qCount = Math.max(1, questionCount);
  const aCount = Math.max(1, answerCount);
  const minSum = 1 * qCount;
  const maxSum = aCount * qCount;
  const buckets = aCount;
  const totalValues = maxSum - minSum + 1;
  const baseSize = Math.floor(totalValues / buckets);
  const remainder = totalValues % buckets;
  let start = minSum;
  return Array.from({ length: buckets }, (_, i) => {
    const size = baseSize + (i < remainder ? 1 : 0);
    const end = start + size - 1;
    const out = { min: start, max: end };
    start = end + 1;
    return out;
  });
}

const initialDraft = (): TestDraft => ({
  slug: "",
  title: "",
  type: "multi",
  description: "",
  isPublic: true,
  bgColor: BG_COLORS[0],
  scoringMode: "majority",
  questions: [defaultQuestion(1)],
  answers: [],
  results: [defaultResult()],
});

export function MultiQuestionEditor({ api, onClose, editSlug }: Props) {
  const [draft, setDraft] = useState<TestDraft>(() => initialDraft());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [testId, setTestId] = useState<string | null>(null);
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isEdit = Boolean(editSlug);
  const hasScoreRanges = useMemo(
    () => draft.results.some((r) => r.minScore !== null || r.maxScore !== null),
    [draft.results]
  );
  const showPointRanges = (draft.scoringMode ?? "majority") === "points" || hasScoreRanges || draft.questions.length > 0;

  useEffect(() => {
    if (!draft.bgColor) updateDraft("bgColor", BG_COLORS[0]);
  }, [draft.bgColor]);

  const canSubmit = useMemo(() => {
    const titleOk = draft.title.trim().length > 2;
    const hasQuestions = draft.questions.length > 0;
    const eachQ = draft.questions.every(q => q.text.trim().length > 0 && q.answers.length >= 2 && q.answers.every(a => (a.text ?? '').trim().length > 0));
    return titleOk && hasQuestions && eachQ && !loading;
  }, [draft.title, draft.questions, loading]);
  const updateDraft = <K extends keyof TestDraft>(key: K, value: TestDraft[K]) => setDraft((p) => ({ ...p, [key]: value }));
  const pointRanges = useMemo(() => {
    const aCount = draft.questions[0]?.answers?.length || draft.results.length || 1;
    return buildPointRanges(draft.questions.length, aCount);
  }, [draft.questions, draft.results.length]);

  useEffect(() => {
    if (isEdit) return;
    try {
      const raw = typeof window !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        setDraft(JSON.parse(raw) as TestDraft);
      }
    } catch {}
  }, [isEdit]);

  useEffect(() => {
    if (isEdit) return;
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      }
    } catch {}
  }, [draft, isEdit]);

  useEffect(() => {
    if (!editSlug) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    api
      .get(`/tests/slug/${encodeURIComponent(editSlug)}`, { headers: { "X-Telegram-Init-Data": WebApp.initData ?? "" } })
      .then((res) => {
        if (cancelled) return;
        const data = res.data as TestRead;
        if (data.type !== "multi") {
          setLoadError("Нельзя редактировать этот тип теста в этом редакторе");
          return;
        }
        setDraft(fromApiTest(data));
        setTestId(data.id);
        setCurrentSlug(data.slug);
        setStep(1);
      })
      .catch((err: any) => {
        if (cancelled) return;
        const message = err?.response?.data?.detail ?? err?.message ?? "Не удалось загрузить тест";
        setLoadError(String(message));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, editSlug]);

  const submitDraft = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = toApiPayload(draft, { includeSlug: !isEdit });
      const headers = { headers: { "X-Telegram-Init-Data": WebApp.initData ?? "" } };
      let slug = currentSlug || editSlug || "";
      if (isEdit) {
        if (!testId) throw new Error("Тест не найден");
        const response = await api.patch(`/tests/${testId}`, payload, headers);
        slug = String(response?.data?.slug || slug || "");
      } else {
        const response = await api.post("/tests", payload, headers);
        slug = String((response?.data && (response.data.slug || (response as any)?.data?.data?.slug || (response as any)?.data?.test?.slug)) || "");
        if (!slug && (response as any)?.data?.id) {
          try {
            const r2 = await api.get(`/tests/${(response as any).data.id}`, headers);
            slug = String((r2 as any)?.data?.slug || "");
          } catch {}
        }
      }
      WebApp.HapticFeedback?.notificationOccurred?.("success");
      if (!isEdit) {
        try { if (typeof window !== 'undefined') sessionStorage.removeItem(STORAGE_KEY); } catch {}
      }
      try { window.dispatchEvent(new CustomEvent(isEdit ? "test_updated" : "test_created", { detail: { slug, title: draft.title, type: "multi" } })); } catch {}
      if (slug) {
        const next = `#/testsuccess?slug=${encodeURIComponent(slug)}`;
        try { window.location.assign(next); } catch { window.location.hash = next; }
      } else {
        try { window.location.assign("#/home"); } catch { window.location.hash = "#/home"; }
      }
    } catch (err: any) {
      WebApp.HapticFeedback?.notificationOccurred?.("error");
      const status = err?.response?.status;
      const message = status === 401 || status === 403
        ? "Сессия Telegram устарела или нет доступа. Закройте и откройте мини‑приложение заново."
        : err?.response?.data?.detail ?? err?.message ?? "Не удалось сохранить тест";
      setError(String(message));
    } finally { setSubmitting(false); }
  };
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitDraft();
  };

  if (loading) return <section className="card form-card"><p>Загрузка…</p></section>;
  if (loadError) {
    return (
      <section className="card form-card">
        <p className="error">{loadError}</p>
        <div className="actions bottom">
          <button className="secondary" type="button" onClick={onClose}>Закрыть</button>
        </div>
      </section>
    );
  }

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
          <ResultList draft={draft} onChange={updateDraft} pointRanges={pointRanges} showPointRanges={showPointRanges} />
          {error && <p className="error">{error}</p>}
          <footer className="actions bottom">
            <button type="button" className="secondary" onClick={() => setStep(2)} disabled={submitting}>Назад</button>
            <button type="button" onClick={() => setStep(4)} disabled={!canSubmit || submitting}>Далее</button>
          </footer>
        </form>
      )}
      {step === 4 && (
        <section className="form">
          <h2 className="form-title">Выберите цвет фона</h2>
          <div className="color-grid">
            {BG_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`color-swatch${draft.bgColor === c ? " color-swatch--active" : ""}`}
                style={{ background: `#${c}` }}
                onClick={() => updateDraft("bgColor", c)}
                aria-label={`Цвет ${c}`}
              />
            ))}
          </div>
          {error && <p className="error">{error}</p>}
          <footer className="actions bottom">
            <button type="button" className="secondary" onClick={() => setStep(3)} disabled={submitting}>Назад</button>
            <button type="button" onClick={submitDraft} disabled={!canSubmit || submitting}>
              {submitting ? "Сохранение..." : isEdit ? "Сохранить" : "Создать"}
            </button>
          </footer>
        </section>
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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadQuestionImage = async (file: File, index: number) => {
    setUploadError(null);
    try {
      const base = String((import.meta as any).env?.VITE_API_BASE_URL || "").replace(/\/$/, "");
      const endpoint = `${base}/media/upload`;
      const processed = await compressImage(file, { cropTallToSquare: true });
      const form = new FormData();
      form.append("file", processed);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "X-Telegram-Init-Data": WebApp.initData ?? "" },
        body: form,
      });
      if (!res.ok) {
        setUploadError("Не удалось загрузить изображение.");
        return;
      }
      const data = await res.json();
      if (!data?.url) {
        setUploadError("Не удалось получить ссылку на изображение.");
        return;
      }
      const q = questions[index];
      updateQuestion(index, { ...q, imageUrl: data.url });
    } catch {
      setUploadError("Ошибка загрузки изображения.");
    }
  };
  return (
    <div className="editor-section">
      <h3>Вопросы</h3>
      {questions.map((q, idx) => (
        <div key={idx} className="editor-block">
          <div className="question-label">
            <span className="question-label__title">Вопрос {idx + 1}</span>
            <label className="question-image-picker">
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadQuestionImage(file, idx);
                  e.currentTarget.value = "";
                }}
              />
              {q.imageUrl ? (
                <img className="question-image-preview" src={q.imageUrl} alt="question" />
              ) : (
                <span className="question-image-placeholder">Добавить картинку</span>
              )}
            </label>
            <textarea
              required
              placeholder="Введите текст вопроса"
              value={q.text}
              onChange={(e) => updateQuestion(idx, { ...q, text: e.target.value })}
            />
          </div>
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
      {uploadError && <p className="error">{uploadError}</p>}
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

function ResultList({
  draft,
  onChange,
  pointRanges,
  showPointRanges,
}: {
  draft: TestDraft;
  onChange: <K extends keyof TestDraft>(key: K, value: TestDraft[K]) => void;
  pointRanges: PointRange[];
  showPointRanges: boolean;
}) {
  const results = draft.results;
  const update = (i: number, v: ResultDraft) => onChange("results", results.map((r, idx) => (idx === i ? v : r)));
  const add = () => onChange("results", [...results, defaultResult()]);
  const remove = (i: number) => onChange("results", results.filter((_, idx) => idx !== i).length ? results.filter((_, idx) => idx !== i) : [defaultResult()]);
  const [imageError, setImageError] = useState<string | null>(null);
  const uploadResultImage = async (file: File, index: number) => {
    setImageError(null);
    try {
      const processed = await compressImage(file);
      const base = String((import.meta as any).env?.VITE_API_BASE_URL || "").replace(/\/$/, "");
      const endpoint = `${base}/media/upload`;
      const form = new FormData();
      form.append("file", processed);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "X-Telegram-Init-Data": WebApp.initData ?? "" },
        body: form,
      });
      if (!res.ok) {
        setImageError("Не удалось загрузить изображение.");
        return;
      }
      const data = await res.json();
      if (!data?.url) {
        setImageError("Не удалось получить ссылку на изображение.");
        return;
      }
      update(index, { ...results[index], imageUrl: data.url });
    } catch {
      setImageError("Ошибка загрузки изображения.");
    }
  };
  return (
    <div className="editor-section">
      {results.map((r, idx) => (
        <div key={idx} className="editor-block">
          <label className="label">
            Заголовок результата {idx + 1}
            {(showPointRanges && pointRanges[idx]) ? (
              <span className="label-range">{` (баллы ${pointRanges[idx].min}-${pointRanges[idx].max})`}</span>
            ) : null}
          </label>
          <label className="question-image-picker">
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadResultImage(file, idx);
                e.currentTarget.value = "";
              }}
            />
            {r.imageUrl ? (
              <img className="question-image-preview" src={r.imageUrl} alt="result" />
            ) : (
              <span className="question-image-placeholder">Добавить картинку результата</span>
            )}
          </label>
          <input
            className="input"
            placeholder={`Например, «Тип ${idx + 1}»`}
            value={r.title ?? ""}
            onChange={(e) =>
              update(idx, {
                ...r,
                title: e.target.value,
              })
            }
          />
          <label className="label" style={{ marginTop: 8 }}>Описание</label>
          <textarea
            className="textarea"
            placeholder={`Добавьте описание результата ${idx + 1}`}
            value={r.description ?? ""}
            onChange={(e) =>
              update(idx, {
                ...r,
                description: e.target.value,
              })
            }
          />
          {results.length > 1 && (
            <button type="button" className="secondary" onClick={() => remove(idx)}>Удалить</button>
          )}
        </div>
      ))}
      {imageError && <p className="error">{imageError}</p>}
      <button type="button" className="tertiary" onClick={add}>Добавить результат</button>
    </div>
  );
}

function toApiPayload(draft: TestDraft, opts?: { includeSlug?: boolean }) {
  const base: any = {
    title: draft.title,
    type: "multi",
    description: draft.description,
    is_public: true,
    bg_color: draft.bgColor || BG_COLORS[0],
    questions: draft.questions.map((q, qi) => ({
      order_num: qi + 1,
      text: q.text,
      image_url: q.imageUrl,
      answers: q.answers.map((a, ai) => ({
        order_num: ai + 1,
        text: a.text,
        explanation_title: (a as any).explanationTitle,
        explanation_text: (a as any).explanationText,
      })),
    })),
    results: draft.results.map((r, i) => ({
      title: r.title && r.title.trim() ? r.title : `Результат ${i + 1}`,
      description: r.description,
      image_url: (r as any).imageUrl,
      min_score: r.minScore,
      max_score: r.maxScore,
    })),
  };
  if ((draft.scoringMode ?? "majority") === "points") {
    const qCount = draft.questions.length || 1;
    const aCount = draft.questions[0]?.answers?.length || 1;
    const ranges = buildPointRanges(qCount, aCount);

    // гарантируем длину results ровно равной buckets
    base.results = Array.from({ length: aCount }, (_, i) => base.results[i] || {
      title: `Результат ${i + 1}`,
      description: base.results[i]?.description ?? null,
      min_score: null,
      max_score: null,
    });

    base.results = base.results.map((r: any, i: number) => {
      const range = ranges[i];
      const out = {
        ...r,
        min_score: r.min_score ?? range.min,
        max_score: r.max_score ?? range.max,
      };
      return out;
    });
  }
  if (opts?.includeSlug && draft.slug && draft.slug.trim()) base.slug = draft.slug.trim();
  return base;
}

function fromApiTest(test: TestRead): TestDraft {
  const questions = (test.questions || []).map((question) => ({
    id: question.id,
    orderNum: question.order_num,
    text: question.text,
    imageUrl: (question as any).image_url || undefined,
    answers: (question.answers || []).map((answer, idx) => ({
      id: answer.id,
      orderNum: answer.order_num ?? idx + 1,
      text: answer.text || "",
      explanationTitle: answer.explanation_title || undefined,
      explanationText: answer.explanation_text || undefined,
    })),
  }));
  const scoringMode: ScoringMode =
    (test.results || []).some((r) => (r.min_score ?? null) !== null || (r.max_score ?? null) !== null) ? "points" : "majority";
  return {
    id: test.id,
    slug: test.slug,
    title: test.title,
    type: "multi",
    description: test.description || "",
    isPublic: test.is_public,
    bgColor: (test as any).bg_color || BG_COLORS[0],
    scoringMode,
    questions,
    answers: [],
    results: (test.results || []).map((res) => ({
      id: res.id,
      title: res.title,
      description: res.description || "",
      imageUrl: (res as any).image_url || undefined,
      minScore: res.min_score ?? null,
      maxScore: res.max_score ?? null,
    })),
  };
}

export default MultiQuestionEditor;
