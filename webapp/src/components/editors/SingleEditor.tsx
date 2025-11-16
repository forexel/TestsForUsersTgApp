import { useEffect, useState } from "react";
import type { AxiosInstance } from "axios";
import WebApp from "@twa-dev/sdk";
import type { TelegramUser } from "../../types/telegram";
import type { TestRead } from "../../types/tests";

type Answer = { text: string; explanationTitle?: string; explanationText?: string };

export default function SingleEditor({
  api,
  user,
  onClose,
  onCreated,
  editSlug,
}: {
  api: AxiosInstance;
  user?: TelegramUser;
  onClose: () => void;
  onCreated?: (t: { slug: string; title: string; type: "single" }) => void;
  editSlug?: string;
}) {
  const [title, setTitle] = useState<string>("");
  const [step, setStep] = useState<"title" | "question">("title");
  const [initialQA, setInitialQA] = useState<{ question?: string; answers?: Answer[] } | null>(null);
  const [testId, setTestId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isEdit = Boolean(editSlug);

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
        if (data.type !== "single") {
          setLoadError("Нельзя редактировать этот тип теста в этом редакторе");
          return;
        }
        setTestId(data.id);
        setTitle(data.title);
        setInitialQA({
          question: data.questions?.[0]?.text ?? "",
          answers: (data.questions?.[0]?.answers || []).map((a) => ({
            text: a.text || "",
            explanationTitle: a.explanation_title || undefined,
            explanationText: a.explanation_text || undefined,
          })),
        });
        setStep("question");
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

  const save = async (data: { question: string; answers: Answer[] }) => {
    const payload = {
      title,
      type: "single" as const,
      description: "",
      is_public: true,
      questions: [
        {
          order_num: 1,
          text: data.question,
          answers: data.answers.map((a, idx) => ({
            order_num: idx + 1,
            text: a.text,
            explanation_title: a.explanationTitle,
            explanation_text: a.explanationText,
          })),
        },
      ],
      results: [{ title: "Результат", description: "", min_score: null, max_score: null }],
    };
    const headers = { headers: { "X-Telegram-Init-Data": WebApp.initData ?? "" } };
    setSubmitting(true);
    setSubmitError(null);
    let slug = editSlug || "";
    try {
      if (isEdit) {
        if (!testId) throw new Error("Тест не найден");
        const res = await api.patch(`/tests/${testId}`, payload, headers);
        slug = String(res?.data?.slug || slug || "");
      } else {
        const res = await api.post("/tests", payload, headers);
        slug = String((res?.data && (res.data.slug || (res as any)?.data?.data?.slug || (res as any)?.data?.test?.slug)) || "");
        if (!slug && (res as any)?.data?.id) {
          try {
            const r2 = await api.get(`/tests/${(res as any).data.id}`, headers);
            slug = String((r2 as any)?.data?.slug || "");
          } catch {}
        }
      }
      WebApp.HapticFeedback?.notificationOccurred?.("success");
      try { window.dispatchEvent(new CustomEvent(isEdit ? "test_updated" : "test_created", { detail: { slug, title, type: "single" as const } })); } catch {}
      if (slug) {
        if (onCreated) onCreated({ slug, title, type: "single" });
        else try { window.location.assign(`#/testsuccess?slug=${encodeURIComponent(slug)}`); } catch { window.location.hash = `#/testsuccess?slug=${encodeURIComponent(slug)}`; }
      } else {
        try { window.location.assign("#/home"); } catch { window.location.hash = "#/home"; }
      }
    } catch (err: any) {
      WebApp.HapticFeedback?.notificationOccurred?.("error");
      const message = err?.response?.data?.detail ?? err?.message ?? "Не удалось сохранить тест";
      setSubmitError(String(message));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <section className="card form-card"><p>Загрузка…</p></section>;
  if (loadError) return (
    <section className="card form-card">
      <p className="error">{loadError}</p>
      <div className="actions bottom">
        <button className="secondary" type="button" onClick={onClose}>Закрыть</button>
      </div>
    </section>
  );
  if (step === "title") {
    return <TitleStep initial={title} onNext={(val) => { setTitle(val); setStep("question"); }} onBack={onClose} />;
  }
  return (
    <QuestionStep
      title={title}
      initial={initialQA ?? undefined}
      mode={isEdit ? "edit" : "create"}
      submitting={submitting}
      error={submitError}
      onSubmit={save}
      onBack={() => setStep("title")}
    />
  );
}

function TitleStep({ initial = "", onNext, onBack }: { initial?: string; onNext: (title: string) => void; onBack: () => void }) {
  const [title, setTitle] = useState(initial);
  const canNext = title.trim().length > 0;
  return (
    <section className="card selector">
      <h2 className="selector-title">Название теста</h2>
      <input className="input" placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="actions bottom">
        <button className="secondary" type="button" onClick={onBack}>Назад</button>
        <button type="button" disabled={!canNext} onClick={() => onNext(title.trim())}>Далее</button>
      </div>
    </section>
  );
}

function QuestionStep({
  title,
  initial,
  onSubmit,
  onBack,
  mode,
  submitting,
  error,
}: {
  title: string;
  initial?: { question?: string; answers?: Answer[] };
  onSubmit: (data: { question: string; answers: Answer[] }) => void;
  onBack: () => void;
  mode: "create" | "edit";
  submitting: boolean;
  error: string | null;
}) {
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [answers, setAnswers] = useState<Answer[]>(initial?.answers?.length ? initial!.answers : [{ text: "" }, { text: "" }]);
  useEffect(() => {
    if (!initial) return;
    setQuestion(initial.question ?? "");
    if (initial.answers?.length) setAnswers(initial.answers);
  }, [initial?.question, initial?.answers]);
  const addAnswer = () => setAnswers((a) => [...a, { text: "" }]);
  const setAns = (i: number, patch: Partial<Answer>) => setAnswers((a) => a.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const valid = question.trim().length > 0 && answers.length >= 2 && answers.every((a) => a.text.trim().length > 0);
  return (
    <section className="card">
      <h2 className="selector-title">Вопрос и ответы</h2>
      <label className="label">Вопрос</label>
      <input className="input" placeholder="Введите вопрос" value={question} onChange={(e) => setQuestion(e.target.value)} />
      {answers.map((a, i) => (
        <div key={i} style={{ marginTop: 16 }}>
          <div className="label">Ответ {i + 1}</div>
          <input className="input" placeholder="Введите ответ" value={a.text} onChange={(e) => setAns(i, { text: e.target.value })} />
          <input className="input" placeholder="Заголовок расшифровки" value={a.explanationTitle ?? ""} onChange={(e) => setAns(i, { explanationTitle: e.target.value })} style={{ marginTop: 8 }} />
          <textarea className="textarea" placeholder="Введите расшифровку ответа теста" value={a.explanationText ?? ""} onChange={(e) => setAns(i, { explanationText: e.target.value })} rows={4} style={{ marginTop: 8 }} />
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
        <button type="button" className="secondary" onClick={addAnswer}>+ Ответ</button>
      </div>
      <div className="actions bottom">
        <button className="secondary" type="button" onClick={onBack}>Назад</button>
        <button
          type="button"
          disabled={!valid || submitting}
          onClick={() => onSubmit({
            question: question.trim(),
            answers: answers.map(a => ({
              text: a.text.trim(),
              explanationTitle: a.explanationTitle,
              explanationText: a.explanationText,
            })),
          })}
        >
          {submitting ? "Сохранение..." : mode === "edit" ? "Сохранить" : "Создать"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
