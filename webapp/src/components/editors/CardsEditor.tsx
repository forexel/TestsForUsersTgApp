import { FormEvent, useEffect, useMemo, useState } from "react";
import type { AxiosInstance } from "axios";
import WebApp from "@twa-dev/sdk";

import { AnswerDraft, ResultDraft, TestDraft } from "../../types";
import { compressImage } from "../../utils/image";
import type { TestRead } from "../../types/tests";
import { LeadSettings, LeadSettingsValue } from "./LeadSettings";

type Props = { api: AxiosInstance; onClose: () => void; editSlug?: string; leadEnabledDefault?: boolean };

const defaultAnswer = (order: number): AnswerDraft => ({ orderNum: order, text: "" });
const defaultResult = (): ResultDraft => ({ title: "Результат", description: "", minScore: null, maxScore: null });
const BG_COLORS = ["3E8BBF", "ED7AC3", "73C363", "9A7071"];

const initialDraft = (leadEnabledDefault?: boolean): TestDraft => ({
  slug: "",
  title: "",
  type: "cards",
  description: "",
  isPublic: true,
  bgColor: BG_COLORS[0],
  leadEnabled: Boolean(leadEnabledDefault),
  leadCollectName: false,
  leadCollectPhone: false,
  leadCollectEmail: false,
  leadCollectSite: false,
  leadSiteUrl: "",
  questions: [],
  answers: [defaultAnswer(1), defaultAnswer(2)],
  results: [defaultResult()],
});

export function CardsEditor({ api, onClose, editSlug, leadEnabledDefault }: Props) {
  const [draft, setDraft] = useState<TestDraft>(() => initialDraft(leadEnabledDefault));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [mode, setMode] = useState<"open" | "closed">("closed");
  const [uploadDebug, setUploadDebug] = useState<any | null>(null);
  const [testId, setTestId] = useState<string | null>(null);
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isEdit = Boolean(editSlug);

  const canSubmit = useMemo(() => {
    const titleOk = draft.title.trim().length > 2;
    const countOk = draft.answers.length >= 2 && draft.answers.length <= 6;
    const perOk = draft.answers.every((a) =>
      (a.text && a.text.trim().length > 0) &&
      ((a as any).imageUrl && String((a as any).imageUrl).length > 0) &&
      ((a as any).explanationText !== undefined ? String((a as any).explanationText).trim().length > 0 : true)
    );
    return titleOk && countOk && perOk && !loading;
  }, [draft.title, draft.answers, loading]);
  const updateDraft = <K extends keyof TestDraft>(key: K, value: TestDraft[K]) => setDraft((p) => ({ ...p, [key]: value }));

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
        if (data.type !== "cards") {
          setLoadError("Нельзя редактировать этот тип теста в этом редакторе");
          return;
        }
        const { parsedMode, description } = parseCardsDescription(data.description);
        setMode(parsedMode);
        setDraft({
          slug: data.slug,
          title: data.title,
          type: "cards",
          description,
          isPublic: data.is_public,
          bgColor: (data as any).bg_color || BG_COLORS[0],
          leadEnabled: Boolean((data as any).lead_enabled),
          leadCollectName: Boolean((data as any).lead_collect_name),
          leadCollectPhone: Boolean((data as any).lead_collect_phone),
          leadCollectEmail: Boolean((data as any).lead_collect_email),
          leadCollectSite: Boolean((data as any).lead_collect_site),
          leadSiteUrl: ((data as any).lead_site_url as string) || "",
          questions: [],
          answers: mapAnswersFromApi(data),
          results: (data.results || []).map((r) => ({
            id: r.id,
            title: r.title,
            description: r.description || "",
            minScore: r.min_score ?? null,
            maxScore: r.max_score ?? null,
          })),
        });
        setTestId(data.id);
        setCurrentSlug(data.slug);
        setStep(2);
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
      const payload = toApiPayload(draft, mode, { includeSlug: !isEdit });
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
      try { window.dispatchEvent(new CustomEvent(isEdit ? "test_updated" : "test_created", { detail: { slug, title: draft.title, type: "cards" } })); } catch {}
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

  // Step 1 — Название и вопрос (используем description как текст вопроса/подсказки)
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

  const showLeadStep = Boolean(isEdit || leadEnabledDefault);
  const colorStep = showLeadStep ? 4 : 3;
  const leadStep = showLeadStep ? 3 : null;

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
  if (step === 2) return (
    <section className="card form-card">
      <form className="form" onSubmit={handleSubmit}>
        <h2 className="form-title form-title--tight">Карты</h2>
        <CardsList draft={draft} onChange={updateDraft} onDebug={(info) => setUploadDebug(info)} />
        {error && <p className="error">{error}</p>}
        <footer className="actions bottom">
          <button type="button" className="secondary" onClick={() => setStep(1)} disabled={submitting}>Назад</button>
          <button type="button" onClick={() => setStep(colorStep)} disabled={!canSubmit || submitting}>Далее</button>
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
  if (leadStep !== null && step === leadStep) {
    return (
      <section className="card form-card">
        <LeadSettings
          value={{
            leadEnabled: Boolean(draft.leadEnabled),
            leadCollectName: Boolean(draft.leadCollectName),
            leadCollectPhone: Boolean(draft.leadCollectPhone),
            leadCollectEmail: Boolean(draft.leadCollectEmail),
            leadCollectSite: Boolean(draft.leadCollectSite),
            leadSiteUrl: draft.leadSiteUrl || "",
          }}
          onChange={(next: LeadSettingsValue) => {
            updateDraft("leadEnabled", next.leadEnabled);
            updateDraft("leadCollectName", next.leadCollectName);
            updateDraft("leadCollectPhone", next.leadCollectPhone);
            updateDraft("leadCollectEmail", next.leadCollectEmail);
            updateDraft("leadCollectSite", next.leadCollectSite);
            updateDraft("leadSiteUrl", next.leadSiteUrl);
          }}
        />
        <div className="actions bottom">
          <button type="button" className="secondary" onClick={() => setStep(2)} disabled={submitting}>Назад</button>
          <button type="button" onClick={() => setStep(colorStep)} disabled={submitting}>Далее</button>
        </div>
      </section>
    );
  }
  return (
    <section className="card form-card">
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
        <button type="button" className="secondary" onClick={() => setStep(showLeadStep ? 3 : 2)} disabled={submitting}>Назад</button>
        <button type="button" disabled={submitting} onClick={submitDraft}>
          {submitting ? "Сохранение..." : isEdit ? "Сохранить" : "Создать"}
        </button>
      </footer>
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
      const processed = await compressImage(file);
      const fd = new FormData();
      fd.append("file", processed);
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

function parseCardsDescription(raw: string | null | undefined): { parsedMode: "open" | "closed"; description: string } {
  const text = raw || "";
  const match = text.match(/^\s*\[(open|closed)\]\s*([\s\S]*)$/i);
  if (match) {
    return { parsedMode: match[1].toLowerCase() === "open" ? "open" : "closed", description: (match[2] || "").trim() };
  }
  return { parsedMode: "closed", description: text };
}

function mapAnswersFromApi(test: TestRead): AnswerDraft[] {
  return (test.answers || [])
    .slice()
    .sort((a, b) => (a.order_num || 0) - (b.order_num || 0))
    .map((answer, idx) => ({
      id: answer.id,
      orderNum: answer.order_num ?? idx + 1,
      text: answer.text || "",
      explanationText: answer.explanation_text || "",
      explanationTitle: answer.explanation_title || undefined,
      imageUrl: answer.image_url || undefined,
      resultId: answer.result_id || undefined,
    }));
}

function toApiPayload(draft: TestDraft, mode: "open" | "closed", opts?: { includeSlug?: boolean }) {
  const base: any = {
    title: draft.title,
    type: "cards",
    // encode display mode in description prefix: [open] or [closed]
    description: `[${mode}] ` + (draft.description || ""),
    is_public: draft.isPublic,
    bg_color: draft.bgColor || BG_COLORS[0],
    lead_enabled: Boolean(draft.leadEnabled),
    lead_collect_name: Boolean(draft.leadCollectName),
    lead_collect_phone: Boolean(draft.leadCollectPhone),
    lead_collect_email: Boolean(draft.leadCollectEmail),
    lead_collect_site: Boolean(draft.leadCollectSite),
    lead_site_url: draft.leadSiteUrl || null,
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
  if (opts?.includeSlug && draft.slug && draft.slug.trim()) base.slug = draft.slug.trim();
  return base;
}

export default CardsEditor;
