import { FormEvent, useMemo, useState } from "react";
import type { AxiosInstance } from "axios";
import WebApp from "@twa-dev/sdk";

import { AnswerDraft, ResultDraft, TestDraft } from "../../types";

type Props = { api: AxiosInstance; onClose: () => void };

const defaultAnswer = (order: number): AnswerDraft => ({ orderNum: order, text: "" });
const defaultResult = (): ResultDraft => ({ title: "Результат", description: "", minScore: null, maxScore: null });

const initialDraft = (): TestDraft => ({
  slug: "",
  title: "",
  type: "cards",
  description: "",
  isPublic: true,
  questions: [],
  answers: [defaultAnswer(1), defaultAnswer(2)],
  results: [defaultResult()],
});

export function CardsEditor({ api, onClose }: Props) {
  const [draft, setDraft] = useState<TestDraft>(() => initialDraft());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<"open" | "closed">("closed");
  const [uploadDebug, setUploadDebug] = useState<any | null>(null);

  const canSubmit = useMemo(() => {
    const titleOk = draft.title.trim().length > 2;
    const countOk = draft.answers.length >= 2 && draft.answers.length <= 6;
    const perOk = draft.answers.every((a) =>
      (a.text && a.text.trim().length > 0) &&
      ((a as any).imageUrl && String((a as any).imageUrl).length > 0) &&
      ((a as any).explanationText !== undefined ? String((a as any).explanationText).trim().length > 0 : true)
    );
    return titleOk && countOk && perOk;
  }, [draft.title, draft.answers]);
  const updateDraft = <K extends keyof TestDraft>(key: K, value: TestDraft[K]) => setDraft((p) => ({ ...p, [key]: value }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = toApiPayload(draft, mode);
      const response = await api.post("/tests", payload, { headers: { "X-Telegram-Init-Data": WebApp.initData ?? "" } });
      let slug = String((response?.data && (response.data.slug || (response as any)?.data?.data?.slug || (response as any)?.data?.test?.slug)) || "");
      if (!slug && (response as any)?.data?.id) {
        try {
          const r2 = await api.get(`/tests/${(response as any).data.id}`, { headers: { "X-Telegram-Init-Data": WebApp.initData ?? "" } });
          slug = String((r2 as any)?.data?.slug || "");
        } catch {}
      }
      WebApp.HapticFeedback?.notificationOccurred?.("success");
      try { window.dispatchEvent(new CustomEvent("test_created", { detail: { slug, title: draft.title, type: "cards" } })); } catch {}
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

  // Step 1 — Название и вопрос (используем description как текст вопроса/подсказки)
  if (step === 1) {
    const canNext = draft.title.trim().length > 0;
    return (
      <section className="card form-card">
        <h2 className="form-title">Название и вопрос</h2>
        <label className="label-inline">
          <span className="label-text">Название</span>
          <input required maxLength={255} value={draft.title} onChange={(e) => updateDraft("title", e.target.value)} placeholder="Название" />
        </label>
        <label className="label-inline">
          <span className="label-text">Напиши вопрос</span>
          <textarea placeholder="Сосредоточься и задай себе вопрос" value={draft.description ?? ""} onChange={(e) => updateDraft("description", e.target.value)} />
        </label>
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ marginBottom: 6 }}>Как выбирать карту?</div>
          <label className="checkbox">
            <input type="radio" name="cards_mode" checked={mode === "closed"} onChange={() => setMode("closed")} />
            В закрытую (рубашкой вниз)
          </label>
          <label className="checkbox">
            <input type="radio" name="cards_mode" checked={mode === "open"} onChange={() => setMode("open")} />
            В открытую (показывать картинки)
          </label>
        </div>
        <div className="actions bottom">
          <button type="button" className="secondary" onClick={onClose}>Назад</button>
          <button type="button" disabled={!canNext} onClick={() => setStep(2)}>Далее</button>
        </div>
        {uploadDebug && (
          <details className="debug-panel" open>
            <summary>Upload debug</summary>
            <div className="debug-panel__content">{JSON.stringify(uploadDebug, null, 2)}</div>
          </details>
        )}
      </section>
    );
  }

  // Step 2 — Карты
  return (
    <section className="card form-card">
      <form className="form" onSubmit={handleSubmit}>
        <h2 className="form-title form-title--tight">Карты</h2>
        <CardsList draft={draft} onChange={updateDraft} onDebug={(info) => setUploadDebug(info)} />
        {error && <p className="error">{error}</p>}
        <footer className="actions bottom">
          <button type="button" className="secondary" onClick={() => setStep(1)} disabled={submitting}>Назад</button>
          <button type="submit" disabled={!canSubmit || submitting}>{submitting ? "Сохранение..." : "Создать"}</button>
        </footer>
      </form>
      {uploadDebug && (
        <details className="debug-panel" open>
          <summary>Upload debug</summary>
          <div className="debug-panel__content">{JSON.stringify(uploadDebug, null, 2)}</div>
        </details>
      )}
    </section>
  );
}

function CardsList({ draft, onChange, onDebug }: { draft: TestDraft; onChange: <K extends keyof TestDraft>(key: K, value: TestDraft[K]) => void; onDebug?: (info: any) => void }) {
  const answers = draft.answers;
  const updateAnswer = (index: number, value: AnswerDraft) => {
    const next = [...answers];
    next[index] = value;
    onChange("answers", next.map((item, idx) => ({ ...item, orderNum: idx + 1 })));
  };
  return (
    <div className="editor-section editor-section--tight">
      {answers.map((answer, idx) => (
        <div key={idx} className="card-editor">
          <div className="card-editor__header">Ответ {idx + 1}</div>
          <div className="card-editor__body">
            <ImageUploader
              initialUrl={(answer as any).imageUrl}
              previewUrl={(answer as any).localPreview}
              onPreview={(local) => updateAnswer(idx, { ...answer, localPreview: local } as any)}
              onUploaded={(url) => updateAnswer(idx, { ...answer, imageUrl: url, localPreview: url } as any)}
              onDebug={onDebug}
            />
            <div className="card-editor__fields">
              <input
                required
                placeholder={`Название карты ${idx + 1}`}
                value={answer.text ?? ""}
                onChange={(e) => updateAnswer(idx, { ...answer, text: e.target.value })}
              />
              <textarea
                required
                placeholder="Введите описание результата"
                value={(answer as any).explanationText ?? ""}
                onChange={(e) => updateAnswer(idx, { ...answer, explanationText: (e.target as any).value } as any)}
              />
            </div>
          </div>
        </div>
      ))}
      {answers.length < 6 && (
        <button type="button" className="tertiary" onClick={() => onChange("answers", [...answers, { orderNum: answers.length + 1, text: "" }])}>Добавить карту</button>
      )}
    </div>
  );
}

function ImageUploader({
  initialUrl,
  previewUrl,
  onPreview,
  onUploaded,
  onDebug,
}: {
  initialUrl?: string;
  previewUrl?: string;
  onPreview: (url: string) => void;
  onUploaded: (url: string) => void;
  onDebug?: (info: any) => void;
}) {
  const [busy, setBusy] = useState(false);
  const current = previewUrl || initialUrl;

  const upload = async (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    onPreview(objectUrl);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("prefix", "cards");
      const initData = WebApp.initData || (window as any).Telegram?.WebApp?.initData || "";
      const apiBase = (import.meta as any).env?.VITE_API_BASE_URL;
      const endpoint = String(apiBase + "/media/upload");

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "X-Telegram-Init-Data": initData },
        body: fd,
      });

      const bodyText = await res.text();
      let data: any = null;
      try { data = JSON.parse(bodyText); } catch {}

      if (!res.ok) {
        const info = { stage: "upload-fail", status: res.status, endpoint, initDataLen: initData.length, responseText: bodyText, json: data };
        console.error("[upload]", info);
        onDebug?.(info);
        throw new Error((data && (data.detail || data.message)) || `HTTP ${res.status}`);
      }

      const url = String((data && (data.url || data.Location || data.location)) || "");
      if (!url) {
        const info = { stage: "no-url", status: res.status, endpoint, initDataLen: initData.length, responseText: bodyText };
        console.error("[upload]", info);
        onDebug?.(info);
        throw new Error("Сервер не вернул URL файла");
      }
      onDebug?.({ stage: "success", status: res.status, url, endpoint });
      onUploaded(url);
    } catch (error: any) {
      onPreview(initialUrl || "");
      WebApp.showPopup?.({ title: "Загрузка", message: error?.message || "Не удалось загрузить", buttons: [{ type: "ok" }] });
    } finally {
      setBusy(false);
      URL.revokeObjectURL(objectUrl);
    }
  };

  return (
    <label className={`card-uploader ${busy ? "is-loading" : ""}`}>
      <input
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload(file);
        }}
      />
      {current ? <img src={current} alt="card" /> : <span className="card-uploader__plus">+</span>}
    </label>
  );
}

function toApiPayload(draft: TestDraft, mode: "open" | "closed") {
  const base: any = {
    title: draft.title,
    type: "cards",
    // encode display mode in description prefix: [open] or [closed]
    description: `[${mode}] ` + (draft.description || ""),
    is_public: draft.isPublic,
    questions: [],
    answers: draft.answers.map((a, idx) => ({
      order_num: idx + 1,
      text: a.text,
      explanation_title: (a as any).explanationTitle,
      explanation_text: (a as any).explanationText,
      image_url: (a as any).imageUrl,
      result_id: (a as any).resultId,
    })),
    results: draft.results.map((r) => ({ title: r.title, description: r.description, min_score: r.minScore, max_score: r.maxScore })),
  };
  if (draft.slug && draft.slug.trim()) base.slug = draft.slug.trim();
  return base;
}

export default CardsEditor;
