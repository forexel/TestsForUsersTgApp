import { useState } from "react";
import type { AxiosInstance } from "axios";
import WebApp from "@twa-dev/sdk";
import type { TelegramUser } from "../../types/telegram";

type Answer = { text: string; explanationTitle?: string; explanationText?: string };

export default function SingleEditor({ api, user, onClose, onCreated }: { api: AxiosInstance; user?: TelegramUser; onClose: () => void; onCreated?: (t: { slug: string; title: string; type: "single" }) => void }) {
  const [title, setTitle] = useState<string>("");
  const create = async (data: { question: string; answers: Answer[] }) => {
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
      answers: [],
      results: [{ title: "Результат", description: "", min_score: null, max_score: null }],
    };
    const res = await api.post("/tests", payload, { headers: { "X-Telegram-Init-Data": WebApp.initData ?? "" } });
    let slug = String((res?.data && (res.data.slug || (res as any)?.data?.data?.slug || (res as any)?.data?.test?.slug)) || "");
    if (!slug && (res as any)?.data?.id) {
      try {
        const r2 = await api.get(`/tests/${(res as any).data.id}`, { headers: { "X-Telegram-Init-Data": WebApp.initData ?? "" } });
        slug = String((r2 as any)?.data?.slug || "");
      } catch {}
    }
    WebApp.HapticFeedback?.notificationOccurred?.("success");
    try { window.dispatchEvent(new CustomEvent("test_created", { detail: { slug, title, type: "single" as const } })); } catch {}
    if (slug) {
      if (onCreated) onCreated({ slug, title, type: "single" });
      else try { window.location.assign(`#/testsuccess?slug=${encodeURIComponent(slug)}`); } catch { window.location.hash = `#/testsuccess?slug=${encodeURIComponent(slug)}`; }
    } else {
      try { window.location.assign("#/home"); } catch { window.location.hash = "#/home"; }
    }
  };
  if (!title) return <TitleStep onNext={setTitle} onBack={onClose} />;
  return <QuestionStep title={title} onCreate={create} onBack={() => setTitle("")} />;
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

function QuestionStep({ title, initial, onCreate, onBack }: { title: string; initial?: { question?: string; answers?: Answer[] }; onCreate: (data: { question: string; answers: Answer[] }) => void; onBack: () => void }) {
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [answers, setAnswers] = useState<Answer[]>(initial?.answers?.length ? initial!.answers : [{ text: "" }, { text: "" }]);
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
        <button type="button" disabled={!valid} onClick={() => onCreate({ question: question.trim(), answers: answers.map(a => ({ text: a.text.trim(), explanationTitle: a.explanationTitle, explanationText: a.explanationText })) })}>Создать</button>
      </div>
    </section>
  );
}

