

const __DBG: string[] = (typeof window !== 'undefined' && (window as any).__DBG) || [];
if (typeof window !== 'undefined') (window as any).__DBG = __DBG;
const log = (...args: any[]) => { try { console.log(...args); __DBG.push(args.map((a)=> (typeof a==='string'? a : JSON.stringify(a))).join(' ')); if (__DBG.length>400) __DBG.splice(0,__DBG.length-400);} catch{} };
const warn = (...args: any[]) => { try { console.warn(...args); __DBG.push('[warn] '+args.map((a)=> (typeof a==='string'? a : JSON.stringify(a))).join(' ')); if (__DBG.length>400) __DBG.splice(0,__DBG.length-400);} catch{} };



import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import "./testpage.css";
import backCard from "../../cardunit.png";
import type { AxiosInstance } from "axios";
import WebApp from "@twa-dev/sdk";
import LeadCapture from "./LeadCapture";

type Answer = {
  id: string;
  order_num: number;
  text: string;
  explanation_title?: string | null;
  explanation_text?: string | null;
};
type Question = {
  id: string;
  order_num: number;
  text: string;
  image_url?: string | null;
  answers: Answer[];
};
type TestRead = {
  id: string;
  slug: string;
  title: string;
  type: string;
  description?: string | null;
  questions: Question[];
  answers: Answer[];
  results?: Array<{ id: string; order_num?: number | null; title: string; description?: string | null; image_url?: string | null; min_score?: number | null; max_score?: number | null }>;
  bg_color?: string | null;
  lead_enabled?: boolean;
  lead_collect_name?: boolean;
  lead_collect_phone?: boolean;
  lead_collect_email?: boolean;
  lead_collect_site?: boolean;
  lead_site_url?: string | null;
};

export default function TestPage({ api, slug }: { api: AxiosInstance; slug: string }) {
  // Toggle blue background on <html> and <body> while тестовая страница активна
  useEffect(() => {
    try {
      document.documentElement.classList.add('tp-blue');
      document.body.classList.add('tp-blue');
    } catch {}
    return () => {
      try {
        document.documentElement.classList.remove('tp-blue');
        document.body.classList.remove('tp-blue');
      } catch {}
    };
  }, []);
  const apiBase = (api as any)?.defaults?.baseURL || '';
  log('TestPage mount: slug=', slug, ' apiBase=', apiBase);
  const [test, setTest] = useState<TestRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const logStateRef = useRef<"idle" | "pending" | "done">("idle");
  const eventStateRef = useRef<"idle" | "done">("idle");
  useEffect(() => {
    const raw = test?.bg_color || "3E8BBF";
    const clean = String(raw).replace(/^#/, "");
    try {
      document.documentElement.style.setProperty("--tp-bg", `#${clean}`);
      document.body.style.setProperty("--tp-bg", `#${clean}`);
    } catch {}
  }, [test?.bg_color]);

  const q = useMemo(() => test?.questions?.[0], [test]);
  const cleanedDescription = useMemo(() => {
    const raw = test?.description || "";
    return raw.replace(/^\s*\[(?:open|closed)\]\s*/i, "");
  }, [test]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    const pubUrl = `/tests/slug/${encodeURIComponent(slug)}/public`;
    log('TestPage fetch: GET', pubUrl);

    api.get(pubUrl, { headers: { "X-Telegram-Init-Data": WebApp.initData ?? "" } })
      .then((r) => {
        if (!mounted) return;
        setTest(r.data as TestRead);
        log('TestPage response (public):', r.status);
      })
      .catch((e: any) => {
        if (!mounted) return;
        const status = e?.response?.status;
        const detail = e?.response?.data?.detail;
        const message = e?.message;
        warn('TestPage fetch fail:', status || message, e?.response?.data);
        const parts = [
          detail || message || 'Тест не найден',
          status ? `status=${status}` : null,
          apiBase ? `api=${apiBase}` : null,
          slug ? `slug=${slug}` : null,
        ].filter(Boolean);
        setError(parts.join(" | "));
      })
      .finally(() => { if (mounted) setLoading(false); });

    return () => { mounted = false; };
  }, [api, slug]);

  const logEvent = useCallback((eventType: string, questionIndex?: number) => {
    if (!slug) return;
    api.post(
      `/tests/slug/${encodeURIComponent(slug)}/events`,
      { event_type: eventType, question_index: questionIndex ?? null },
      { headers: { "X-Telegram-Init-Data": WebApp.initData ?? "" } }
    ).catch((err: any) => {
      warn("logEvent fail", eventType, err?.response?.status || err?.message);
    });
  }, [api, slug]);

  useEffect(() => {
    if (!test || eventStateRef.current === "done") return;
    eventStateRef.current = "done";
    logEvent("screen_open");
  }, [test, logEvent]);

  const logCompletion = useCallback(() => {
    if (!slug) return;
    if (logStateRef.current === "pending" || logStateRef.current === "done") return;
    logStateRef.current = "pending";
    api.post(
      `/tests/slug/${encodeURIComponent(slug)}/logs`,
      { event_type: "complete" },
      { headers: { "X-Telegram-Init-Data": WebApp.initData ?? "" } }
    )
      .then(() => { logStateRef.current = "done"; })
      .catch((err: any) => {
        logStateRef.current = "idle";
        warn("logCompletion fail", err?.response?.status || err?.message);
      });
  }, [api, slug]);

  const createResponse = useCallback(async (answers: any[], resultTitle?: string | null) => {
    if (!slug) return null;
    try {
      const res = await api.post(
        `/tests/slug/${encodeURIComponent(slug)}/responses`,
        { answers, result_title: resultTitle ?? null },
        { headers: { "X-Telegram-Init-Data": WebApp.initData ?? "" } }
      );
      return String(res?.data?.response_id || "");
    } catch (err: any) {
      warn("createResponse fail", err?.response?.status || err?.message);
      return null;
    }
  }, [api, slug]);

  if (loading) return <section className="card"><p>Загрузка…</p></section>;
  if (error) return <section className="card"><p className="error">{error}</p></section>;
  if (!test) return null;

  const wrapperClass =
    `card form-card ${(test.type==='cards' || test.type==='single' || test.type==='multi') ? 'tp-no-frame' : ''}`;
  return (
    <section className={wrapperClass} style={{ marginTop: 0 }}>

      {test.type === "single" && q && (
        <div className="tp-wrap">
          <div className="tp-root-title">Выбери ответ</div>
          <div className="tp-panel">
          <div className="tp-panel__content tp-panel__content--tight">
            <div className="tp-step">{`Вопрос 1/1`}</div>
            {q.image_url && <img className="tp-question-image" src={q.image_url} alt="question" />}
            <h3 className="tp-question-title">{q.text}</h3>
              <div className="tp-options">
                {q.answers.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={`tp-option${picked === a.id ? " tp-option--selected" : ""}`}
                    onClick={() => setPicked(a.id)}
                  >
                    {a.text}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="tp-btn tp-btn--spaced"
                disabled={!picked}
                onClick={async () => {
                  if (!picked) return;
                  WebApp.HapticFeedback?.impactOccurred?.("medium");
                  logCompletion();
                  logEvent("answer", 1);
                  const answer = q.answers.find((a) => String(a.id) === String(picked));
                  const responseAnswers = [
                    {
                      question_id: q.id,
                      question_text: q.text,
                      answer_id: answer?.id,
                      answer_text: answer?.text || "",
                      order_num: 1,
                    },
                  ];
                  const resultTitle = answer?.explanation_title || "Результат";
                  const newResponseId = await createResponse(responseAnswers, resultTitle);
                  try {
                    const rid = newResponseId ? `&responseId=${encodeURIComponent(newResponseId)}` : "";
                    const hash = `#/result?slug=${encodeURIComponent(slug)}&answerId=${encodeURIComponent(picked)}${rid}`;
                    (window as any).location.hash = hash;
                  } catch {}
                }}
              >
                Ответить
              </button>
            </div>
          </div>
        </div>
      )}

      {test.type === "multi" && (
        <MultiRunner
          api={api}
          test={test}
          onResultReady={logCompletion}
          onLogEvent={logEvent}
          createResponse={createResponse}
        />
      )}
      {test.type === "cards" && (
        <CardsRunner
          api={api}
          test={test as any}
          onReveal={logCompletion}
          onLogEvent={logEvent}
          createResponse={createResponse}
        />
      )}
      {test.type !== "single" && test.type !== "multi" && test.type !== "cards" && (
        <p className="muted">Этот тип теста пока запускается из бота. Поддержку в WebApp добавим позже.</p>
      )}
    </section>
  );
}

function CardsRunner({
  api,
  test,
  onReveal,
  onLogEvent,
  createResponse,
}: {
  api: AxiosInstance;
  test: any;
  onReveal?: () => void;
  onLogEvent?: (eventType: string, questionIndex?: number) => void;
  createResponse?: (answers: any[], resultTitle?: string | null) => Promise<string | null>;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [responseId, setResponseId] = useState<string | null>(null);
  const answers = (test.answers || []).slice().sort((a: any, b: any) => (a.order_num || 0) - (b.order_num || 0));
  const limited = answers.slice(0, 6);
  const countOk = limited.length >= 2;
  const { mode, text } = useMemo(() => {
    const raw = test.description || "";
    // allow instructions to span multiple lines after the [open]/[closed] prefix
    const m = raw.match(/^\s*\[(open|closed)\]\s*([\s\S]*)$/i);
    if (m) return { mode: m[1].toLowerCase(), text: m[2].trim() } as any;
    return { mode: "closed", text: raw } as any;
  }, [test]);
  const current = limited.find((a: any) => String(a.id) === String(picked));

  useEffect(() => {
    if (picked) {
      onReveal?.();
      onLogEvent?.("answer", 1);
      const current = limited.find((a: any) => String(a.id) === String(picked));
      if (current && createResponse && responseId === null) {
        const payload = [
          {
            question_id: "card",
            question_text: "Выбранная карта",
            answer_id: current.id,
            answer_text: current.text || "",
            order_num: 1,
          },
        ];
        createResponse(payload, current.text || "Результат").then((id) => {
          const next = id || null;
          setResponseId(next);
        });
      }
    }
  }, [picked, onReveal, onLogEvent, createResponse, limited, responseId]);

  if (!picked) {
    return (
      <div className="tp-wrap">
        <div className="tp-root-title">Выбери карту</div>
        <div className="tp-panel">
          <div className="tp-panel__content tp-panel__content--tight">
            <div className="tp-instruction">{text || "Сосредоточься и задай себе вопрос"}</div>
            <div className={`tp-grid-cards tp-grid-${limited.length}`}>
              {limited.map((a: any) => (
                <button
                  key={a.id}
                  type="button"
                  className="tp-card-img"
                  onClick={() => setPicked(String(a.id))}
                >
                  <img
                    src={mode === 'open' ? (a.image_url || (a as any).imageUrl || backCard) : backCard}
                    alt="card"
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tp-wrap">
      <div className="tp-root-title">Результат</div>
      <div className="tp-panel">
        <div className="tp-panel__content tp-result">
          {current ? (
            <>
              <div className="tp-result-title">{current.text || "Карта"}</div>
              <div className="tp-image-frame">
                <img
                  className="tp-image-big"
                  src={current.image_url || (current as any).imageUrl || backCard}
                  alt={current.text || "card"}
                />
              </div>
              <div className="tp-result-box">
                <p>{current.explanation_text || ""}</p>
              </div>
              <LeadCapture
                api={api}
                slug={test.slug}
                config={test}
                responseId={responseId}
                onEvent={(eventType) => onLogEvent?.(eventType)}
              />
            </>
          ) : (
            <div className="tp-result-box"><p className="muted">Карта не найдена</p></div>
          )}
        </div>
      </div>
    </div>
  );
}

function MultiRunner({
  api,
  test,
  onResultReady,
  onLogEvent,
  createResponse,
}: {
  api: AxiosInstance;
  test: TestRead;
  onResultReady?: () => void;
  onLogEvent?: (eventType: string, questionIndex?: number) => void;
  createResponse?: (answers: any[], resultTitle?: string | null) => Promise<string | null>;
}) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Record<string, string>>({}); // qid -> answerId
  const [done, setDone] = useState(false);
  const [responseId, setResponseId] = useState<string | null>(null);

  const questions = test.questions || [];
  const current = questions[index];
  const answersCount = questions[0]?.answers?.length || 0;

  const isPointsMode = useMemo(() => {
    const anyRange = (test.results || []).some(r => (r?.min_score ?? null) !== null || (r?.max_score ?? null) !== null);
    return anyRange;
  }, [test]);

  const computeResult = (): { title: string; description?: string; imageUrl?: string | null } | null => {
    try {
      if (!questions.length) return { title: "Результат", description: undefined };
      const picks = questions.map((q) => {
        const aId = selected[q.id];
        const a = (q.answers || []).find(x => String(x.id) === String(aId));
        return a ? { order: a.order_num, id: a.id } : null;
      }).filter(Boolean) as { order: number; id: string }[];
      if (picks.length !== questions.length) return null;

      const results = (test.results || []).slice().sort((a, b) => (a.order_num ?? 0) - (b.order_num ?? 0));
      if (isPointsMode) {
        const total = picks.reduce((sum, p) => sum + (p.order || 1), 0);
        const ranged = results.find((r) => {
          const min = r.min_score ?? null;
          const max = r.max_score ?? null;
          if (min === null || max === null) return false;
          return total >= min && total <= max;
        });
        if (ranged) return { title: ranged.title, description: ranged.description || undefined, imageUrl: ranged.image_url };
        const fallback = results[0] || results[results.length - 1];
        return fallback ? { title: fallback.title, description: fallback.description || undefined, imageUrl: fallback.image_url } : { title: "Результат", description: undefined };
      } else {
        const counts: Record<number, number> = {};
        picks.forEach(p => { counts[p.order] = (counts[p.order] || 0) + 1; });
        let bestOrder = 1;
        let bestCount = -1;
        Object.keys(counts).map(k => Number(k)).sort((a, b) => a - b).forEach(o => {
          const c = counts[o];
          if (c > bestCount || (c === bestCount && o < bestOrder)) { bestCount = c; bestOrder = o; }
        });
        const idx = Math.max(0, Math.min((results.length || answersCount) - 1, bestOrder - 1));
        const res = results[idx];
        if (res) return { title: res.title, description: res.description || undefined, imageUrl: res.image_url };
        const a = questions[0]?.answers?.[bestOrder - 1];
        if (a?.explanation_title || a?.explanation_text) {
          return { title: a.explanation_title || "Результат", description: a.explanation_text || undefined };
        }
        return { title: "Результат", description: undefined };
      }
    } catch (err) {
      warn("computeResult fail", err);
      return { title: "Результат", description: undefined };
    }
  };

  useEffect(() => {
    if (done) onResultReady?.();
  }, [done, onResultReady]);

  const result = computeResult();
  const resultTitle = result?.title || "Результат";

  useEffect(() => {
    if (!done || !createResponse || responseId !== null) return;
    const answersPayload = questions.map((q, idx) => {
      const aId = selected[q.id];
      const a = q.answers.find((x) => String(x.id) === String(aId));
      return {
        question_id: q.id,
        question_text: q.text,
        answer_id: a?.id,
        answer_text: a?.text || "",
        order_num: idx + 1,
      };
    });
    createResponse(answersPayload, resultTitle).then((id) => {
      const next = id || null;
      setResponseId(next);
    });
  }, [done, createResponse, questions, selected, responseId, resultTitle]);

  if (!done && current) {
    const picked = selected[current.id] || null;
    const answersList = current.answers || [];
    return (
      <div className="tp-wrap">
        <div className="tp-root-title">Выбери ответ</div>
        <div className="tp-panel">
          <div className="tp-panel__content">
            <div className="tp-step">{`Вопрос ${index + 1}/${questions.length}`}</div>
            {current.image_url && <img className="tp-question-image" src={current.image_url} alt="question" />}
            <h3 className="tp-question-title">{current.text}</h3>
            <div className="tp-options">
              {answersList.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`tp-option${picked === a.id ? " tp-option--selected" : ""}`}
                  onClick={() => setSelected(prev => ({ ...prev, [current.id]: a.id }))}
                >
                  {a.text}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="tp-btn tp-btn--spaced"
              disabled={!picked}
              onClick={() => {
                onLogEvent?.("answer", index + 1);
                if (index + 1 < questions.length) setIndex(index + 1);
                else setDone(true);
              }}
            >
              {index + 1 < questions.length ? "Далее" : "Показать результат"}
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="tp-wrap">
      <div className="tp-root-title">Результат</div>
      <div className="tp-panel">
        <div className="tp-panel__content tp-result">
          {result ? (
            <>
              {result.imageUrl && <img className="tp-result-image" src={result.imageUrl} alt="result" />}
              <div className="tp-result-title">{result.title}</div>
              <div className="tp-result-box"><p style={{ margin: 0 }}>{result.description || ""}</p></div>
              <LeadCapture
                api={api}
                slug={test.slug}
                config={test}
                responseId={responseId}
                onEvent={(eventType) => onLogEvent?.(eventType)}
              />
            </>
          ) : (
            <div className="tp-result-box"><p className="muted" style={{ margin: 0 }}>Результат не вычислен</p></div>
          )}
        </div>
      </div>
    </div>
  );
}
