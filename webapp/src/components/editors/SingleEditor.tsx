import { useEffect, useState } from "react";
import type { AxiosInstance } from "axios";
import WebApp from "@twa-dev/sdk";
import { compressImage } from "../../utils/image";
import type { TelegramUser } from "../../types/telegram";
import type { TestRead } from "../../types/tests";

type Answer = { text: string; explanationTitle?: string; explanationText?: string };
const BG_COLORS = ["3E8BBF", "ED7AC3", "73C363", "9A7071"];

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
  const [step, setStep] = useState<"title" | "question" | "color">("title");
  const [qa, setQa] = useState<{ question: string; answers: Answer[]; imageUrl?: string }>({ question: "", answers: [{ text: "" }, { text: "" }] });
  const [imageError, setImageError] = useState<string | null>(null);
  const [bgColor, setBgColor] = useState<string>(BG_COLORS[0]);
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
        const nextQa = {
          question: data.questions?.[0]?.text ?? "",
          imageUrl: (data.questions?.[0] as any)?.image_url || undefined,
          answers: (data.questions?.[0]?.answers || []).map((a) => ({
            text: a.text || "",
            explanationTitle: a.explanation_title || undefined,
            explanationText: a.explanation_text || undefined,
          })),
        };
        setQa(nextQa.answers.length ? nextQa : { question: "", answers: [{ text: "" }, { text: "" }] });
        setBgColor((data as any).bg_color || BG_COLORS[0]);
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

  const save = async (data: { question: string; answers: Answer[]; imageUrl?: string }) => {
    const cleanQuestion = data.question.trim();
    const cleanAnswers = data.answers.map((a) => ({
      text: (a.text || "").trim(),
      explanationTitle: a.explanationTitle,
      explanationText: a.explanationText,
    }));
    const payload = {
      title,
      type: "single" as const,
      description: "",
      is_public: true,
      bg_color: bgColor,
      questions: [
        {
          order_num: 1,
          text: cleanQuestion,
          image_url: data.imageUrl || null,
          answers: data.answers.map((a, idx) => ({
            order_num: idx + 1,
            text: cleanAnswers[idx].text,
            explanation_title: cleanAnswers[idx].explanationTitle,
            explanation_text: cleanAnswers[idx].explanationText,
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
      const status = err?.response?.status;
      const message = status === 401 || status === 403
        ? "Сессия Telegram устарела или нет доступа. Закройте и откройте мини‑приложение заново."
        : err?.response?.data?.detail ?? err?.message ?? "Не удалось сохранить тест";
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
  if (step === "question") {
    return (
      <QuestionStep
        value={qa}
        onChange={setQa}
        imageError={imageError}
        onImageError={setImageError}
        submitting={submitting}
        error={submitError}
        onNext={() => setStep("color")}
        onBack={() => setStep("title")}
      />
    );
  }
  return (
    <ColorStep
      value={bgColor}
      onChange={setBgColor}
      submitting={submitting}
      onBack={() => setStep("question")}
      onSubmit={() => save({ question: qa.question, answers: qa.answers, imageUrl: qa.imageUrl })}
      mode={isEdit ? "edit" : "create"}
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
  value,
  onChange,
  imageError,
  onImageError,
  onNext,
  onBack,
  submitting,
  error,
}: {
  value: { question: string; answers: Answer[]; imageUrl?: string };
  onChange: (data: { question: string; answers: Answer[]; imageUrl?: string }) => void;
  imageError: string | null;
  onImageError: (val: string | null) => void;
  onNext: () => void;
  onBack: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const question = value.question;
  const answers = value.answers;
  const imageUrl = (value as any).imageUrl as string | undefined;
  const addAnswer = () => onChange({ ...value, answers: [...answers, { text: "" }] });
  const setAns = (i: number, patch: Partial<Answer>) =>
    onChange({ ...value, answers: answers.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) });
  const setQuestion = (next: string) => onChange({ ...value, question: next });
  const uploadImage = async (file: File) => {
    onImageError(null);
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
        onImageError("Не удалось загрузить изображение.");
        return;
      }
      const data = await res.json();
      if (!data?.url) {
        onImageError("Не удалось получить ссылку на изображение.");
        return;
      }
      onChange({ ...value, imageUrl: data.url });
    } catch {
      onImageError("Ошибка загрузки изображения.");
    }
  };
  const valid = question.trim().length > 0 && answers.length >= 2 && answers.every((a) => a.text.trim().length > 0);
  return (
    <section className="card">
      <h2 className="selector-title">Вопрос и ответы</h2>
      <label className="question-image-picker">
        <input
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadImage(file);
            e.currentTarget.value = "";
          }}
        />
        {imageUrl ? (
          <img className="question-image-preview" src={imageUrl} alt="question" />
        ) : (
          <span className="question-image-placeholder">Добавить картинку</span>
        )}
      </label>
      {imageError && <p className="error">{imageError}</p>}
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
        <button type="button" disabled={!valid || submitting} onClick={onNext}>Далее</button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function ColorStep({
  value,
  onChange,
  onBack,
  onSubmit,
  submitting,
  mode,
}: {
  value: string;
  onChange: (color: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  mode: "create" | "edit";
}) {
  return (
    <section className="card form-card">
      <h2 className="form-title">Выберите цвет фона</h2>
      <div className="color-grid">
        {BG_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`color-swatch${value === c ? " color-swatch--active" : ""}`}
            style={{ background: `#${c}` }}
            onClick={() => onChange(c)}
            aria-label={`Цвет ${c}`}
          />
        ))}
      </div>
      <div className="actions bottom">
        <button className="secondary" type="button" onClick={onBack}>Назад</button>
        <button type="button" disabled={submitting} onClick={onSubmit}>
          {submitting ? "Сохранение..." : mode === "edit" ? "Сохранить" : "Создать"}
        </button>
      </div>
    </section>
  );
}
