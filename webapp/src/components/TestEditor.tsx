import { FormEvent, useMemo, useState } from "react";
import type { AxiosInstance } from "axios";
import WebApp from "@twa-dev/sdk";

import type { TelegramUser } from "../types/telegram";
import { AnswerDraft, QuestionDraft, ResultDraft, TestDraft, TestType } from "../types";
import { slugify } from "../utils/slugify";

interface TestEditorProps {
  type: TestType;
  api: AxiosInstance;
  user: TelegramUser;
  onClose: () => void;
}

const defaultQuestion = (order: number): QuestionDraft => ({
  orderNum: order,
  text: "",
  answers: [defaultAnswer(1), defaultAnswer(2), defaultAnswer(3)]
});

const defaultAnswer = (order: number): AnswerDraft => ({
  orderNum: order,
  text: ""
});

const defaultResult = (): ResultDraft => ({
  title: "Результат",
  description: "",
  minScore: null,
  maxScore: null
});

const initialDraft = (type: TestType): TestDraft => ({
  slug: "",
  title: "",
  type,
  description: "",
  isPublic: false,
  questions: type === "cards" ? [] : [defaultQuestion(1)],
  answers: type === "cards" ? [defaultAnswer(1), defaultAnswer(2), defaultAnswer(3)] : [],
  results: [defaultResult()]
});

export function TestEditor({ type, api, user, onClose }: TestEditorProps) {
  const [draft, setDraft] = useState<TestDraft>(() => initialDraft(type));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successSlug, setSuccessSlug] = useState<string | null>(null);

  const canSubmit = useMemo(() => draft.title.trim().length > 2 && draft.slug.trim().length > 2, [draft]);

  const updateDraft = <K extends keyof TestDraft>(key: K, value: TestDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload = toApiPayload(draft, user.id);
      const response = await api.post("/tests", payload, {
        headers: {
          "X-Telegram-Init-Data": WebApp.initData ?? ""
        }
      });
      setSuccessSlug(response.data.slug);
      WebApp.HapticFeedback?.notificationOccurred?.("success");
      WebApp.showPopup({ title: "Готово", message: "Тест сохранён", buttons: [{ type: "ok" }] });
    } catch (err: any) {
      WebApp.HapticFeedback?.notificationOccurred?.("error");
      const message = err?.response?.data?.detail ?? err?.message ?? "Не удалось сохранить тест";
      setError(String(message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="card">
      <form className="form" onSubmit={handleSubmit}>
        <h2>Новый тест — {modeToLabel(type)}</h2>

        <label>
          Название
          <input
            required
            maxLength={255}
            value={draft.title}
            onChange={(event) => {
              const newTitle = event.target.value;
              setDraft((prev) => ({
                ...prev,
                title: newTitle,
                slug: prev.slug ? prev.slug : slugify(newTitle)
              }));
            }}
          />
        </label>

        <label>
          Слаг ссылки (t.me/{__BOT_USERNAME__}?start=run_{draft.slug || "slug"})
          <input
            required
            value={draft.slug}
            onChange={(event) => updateDraft("slug", slugify(event.target.value))}
          />
        </label>

        <label>
          Краткое описание
          <textarea value={draft.description ?? ""} onChange={(event) => updateDraft("description", event.target.value)} />
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.isPublic}
            onChange={(event) => updateDraft("isPublic", event.target.checked)}
          />
          Доступен по ссылке сразу после сохранения
        </label>

        <EditorByType draft={draft} onChange={updateDraft} />
        <ResultList draft={draft} onChange={updateDraft} />

        {error && <p className="error">{error}</p>}
        {successSlug && (
          <p className="success">Скопируйте ссылку: t.me/{__BOT_USERNAME__}?start=run_{successSlug}</p>
        )}

        <footer className="actions">
          <button type="button" className="secondary" onClick={onClose} disabled={submitting}>
            Назад
          </button>
          <button type="submit" disabled={!canSubmit || submitting}>
            {submitting ? "Сохранение..." : "Сохранить"}
          </button>
        </footer>
      </form>
    </section>
  );
}

function EditorByType({ draft, onChange }: { draft: TestDraft; onChange: <K extends keyof TestDraft>(key: K, value: TestDraft[K]) => void }) {
  switch (draft.type) {
    case "single":
    case "multi":
      return <QuestionList draft={draft} onChange={onChange} />;
    case "cards":
      return <CardsList draft={draft} onChange={onChange} />;
    default:
      return null;
  }
}

function QuestionList({ draft, onChange }: { draft: TestDraft; onChange: <K extends keyof TestDraft>(key: K, value: TestDraft[K]) => void }) {
  const questions = draft.questions;

  const updateQuestion = (index: number, value: QuestionDraft) => {
    const next = [...questions];
    next[index] = value;
    onChange("questions", next.map((item, idx) => ({ ...item, orderNum: idx + 1 })));
  };

  const addQuestion = () => {
    onChange("questions", [...questions, defaultQuestion(questions.length + 1)]);
  };

  return (
    <div className="editor-section">
      <h3>Вопросы</h3>
      {questions.map((question, idx) => (
        <div key={idx} className="editor-block">
          <label>
            Вопрос {idx + 1}
            <textarea
              required
              placeholder="Введите текст вопроса"
              value={question.text}
              onChange={(event) => updateQuestion(idx, { ...question, text: event.target.value })}
            />
          </label>
          <AnswerList
            draft={draft}
            answers={question.answers}
            onChange={(answers) => updateQuestion(idx, { ...question, answers })}
          />
        </div>
      ))}
      <button type="button" className="tertiary" onClick={addQuestion}>
        Добавить вопрос
      </button>
    </div>
  );
}

function AnswerList({
  draft,
  answers,
  onChange
}: {
  draft: TestDraft;
  answers: AnswerDraft[];
  onChange: (answers: AnswerDraft[]) => void;
}) {
  const isMulti = draft.type === "multi";
  const isSingle = draft.type === "single";

  const updateAnswer = (index: number, value: AnswerDraft) => {
    const next = [...answers];
    next[index] = value;
    onChange(next.map((item, idx) => ({ ...item, orderNum: idx + 1 })));
  };

  return (
    <div className="answers">
      {answers.map((answer, idx) => (
        <div key={idx} className="answer-row">
          <input
            required
            placeholder={`Ответ ${idx + 1}`}
            value={answer.text ?? ""}
            onChange={(event) => updateAnswer(idx, { ...answer, text: event.target.value })}
          />
          {isMulti && (
            <input
              type="number"
              placeholder="Вес"
              value={answer.weight ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                updateAnswer(idx, { ...answer, weight: value === "" ? undefined : Number(value) });
              }}
            />
          )}
          {isSingle && (
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={Boolean(answer.isCorrect)}
                onChange={(event) => updateAnswer(idx, { ...answer, isCorrect: event.target.checked })}
              />
              Правильный
            </label>
          )}
        </div>
      ))}
      <button
        type="button"
        className="tertiary"
        onClick={() => onChange([...answers, defaultAnswer(answers.length + 1)])}
      >
        Добавить ответ
      </button>
    </div>
  );
}

function CardsList({ draft, onChange }: { draft: TestDraft; onChange: <K extends keyof TestDraft>(key: K, value: TestDraft[K]) => void }) {
  const answers = draft.answers;

  const updateAnswer = (index: number, value: AnswerDraft) => {
    const next = [...answers];
    next[index] = value;
    onChange("answers", next.map((item, idx) => ({ ...item, orderNum: idx + 1 })));
  };

  return (
    <div className="editor-section">
      <h3>Карты</h3>
      {answers.map((answer, idx) => (
        <div key={idx} className="answer-row">
          <input
            placeholder={`Название карты ${idx + 1}`}
            value={answer.text ?? ""}
            onChange={(event) => updateAnswer(idx, { ...answer, text: event.target.value })}
          />
          <input
            placeholder="URL изображения"
            value={answer.imageUrl ?? ""}
            onChange={(event) => updateAnswer(idx, { ...answer, imageUrl: event.target.value })}
          />
        </div>
      ))}
      <button
        type="button"
        className="tertiary"
        onClick={() => onChange("answers", [...answers, { orderNum: answers.length + 1, text: "", imageUrl: "" }])}
      >
        Добавить карту
      </button>
    </div>
  );
}

function ResultList({ draft, onChange }: { draft: TestDraft; onChange: <K extends keyof TestDraft>(key: K, value: TestDraft[K]) => void }) {
  const results = draft.results;

  const updateResult = (index: number, value: ResultDraft) => {
    const next = [...results];
    next[index] = value;
    onChange("results", next);
  };

  const addResult = () => onChange("results", [...results, defaultResult()]);

  const removeResult = (index: number) => {
    const next = results.filter((_, idx) => idx !== index);
    onChange("results", next.length ? next : [defaultResult()]);
  };

  return (
    <div className="editor-section">
      <h3>Результаты</h3>
      {results.map((result, idx) => (
        <div key={idx} className="editor-block">
          <label>
            Заголовок результата
            <input
              required
              value={result.title}
              onChange={(event) => updateResult(idx, { ...result, title: event.target.value })}
            />
          </label>
          <label>
            Описание
            <textarea
              value={result.description ?? ""}
              onChange={(event) => updateResult(idx, { ...result, description: event.target.value })}
            />
          </label>
          {draft.type === "multi" && (
            <div className="answer-row">
              <input
                type="number"
                placeholder="Мин. балл"
                value={result.minScore ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  updateResult(idx, { ...result, minScore: value === "" ? null : Number(value) });
                }}
              />
              <input
                type="number"
                placeholder="Макс. балл"
                value={result.maxScore ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  updateResult(idx, { ...result, maxScore: value === "" ? null : Number(value) });
                }}
              />
            </div>
          )}
          {results.length > 1 && (
            <button type="button" className="secondary" onClick={() => removeResult(idx)}>
              Удалить результат
            </button>
          )}
        </div>
      ))}
      <button type="button" className="tertiary" onClick={addResult}>
        Добавить результат
      </button>
    </div>
  );
}

function modeToLabel(mode: TestType): string {
  switch (mode) {
    case "single":
      return "Один вопрос";
    case "cards":
      return "Выбор карты";
    case "multi":
      return "Несколько вопросов";
    default:
      return mode;
  }
}

function toApiPayload(draft: TestDraft, userId: number) {
  return {
    slug: draft.slug,
    title: draft.title,
    type: draft.type,
    description: draft.description,
    is_public: draft.isPublic,
    questions: draft.questions.map((question, index) => ({
      order_num: index + 1,
      text: question.text,
      answers: question.answers.map((answer, answerIndex) => ({
        order_num: answerIndex + 1,
        text: answer.text,
        weight: answer.weight,
        is_correct: answer.isCorrect
      }))
    })),
    answers:
      draft.type === "cards"
        ? draft.answers.map((answer, index) => ({
            order_num: index + 1,
            text: answer.text,
            image_url: answer.imageUrl,
            result_id: answer.resultId
          }))
        : [],
    results: draft.results.map((result) => ({
      title: result.title,
      description: result.description,
      min_score: result.minScore,
      max_score: result.maxScore
    }))
  };
}
