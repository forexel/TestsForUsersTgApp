

const __DBG: string[] = (typeof window !== 'undefined' && (window as any).__DBG) || [];
if (typeof window !== 'undefined') (window as any).__DBG = __DBG;
const log = (...args: any[]) => { try { console.log(...args); __DBG.push(args.map((a)=> (typeof a==='string'? a : JSON.stringify(a))).join(' ')); if (__DBG.length>400) __DBG.splice(0,__DBG.length-400);} catch{} };
const warn = (...args: any[]) => { try { console.warn(...args); __DBG.push('[warn] '+args.map((a)=> (typeof a==='string'? a : JSON.stringify(a))).join(' ')); if (__DBG.length>400) __DBG.splice(0,__DBG.length-400);} catch{} };



import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import "./testpage.css";
import backCard from "../../cardunit.png";
import type { AxiosInstance } from "axios";
import WebApp from "@twa-dev/sdk";

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
  results?: Array<{ id: string; title: string; description?: string | null; min_score?: number | null; max_score?: number | null }>;
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
  const openLogRef = useRef<"idle" | "pending" | "done">("idle");

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

    api.get(pubUrl)
      .then((r) => {
        if (!mounted) return;
        setTest(r.data as TestRead);
        log('TestPage response (public):', r.status);
      })
      .catch((e: any) => {
        if (!mounted) return;
        warn('TestPage fetch fail:', e?.response?.status || e?.message, e?.response?.data);
        setError(e?.response?.data?.detail || e?.message || 'Тест не найден');
      })
      .finally(() => { if (mounted) setLoading(false); });

    return () => { mounted = false; };
  }, [api, slug]);

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

  const logOpen = useCallback(() => {
    if (!slug) return;
    if (openLogRef.current === "pending" || openLogRef.current === "done") return;
    openLogRef.current = "pending";
    api.post(
      `/tests/slug/${encodeURIComponent(slug)}/logs`,
      { event_type: "open" },
      { headers: { "X-Telegram-Init-Data": WebApp.initData ?? "" } }
    )
      .then(() => { openLogRef.current = "done"; })
      .catch((err: any) => {
        openLogRef.current = "idle";
        warn("logOpen fail", err?.response?.status || err?.message);
      });
  }, [api, slug]);

  useEffect(() => {
    if (test) logOpen();
  }, [test, logOpen]);

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
          <div className="tp-panel__content">
            <div className="tp-step">{`Вопрос 1/1`}</div>
            <h3 className="tp-question-title">{q.text}</h3>
              {q.answers.map((a) => (
                <label key={a.id} className="tp-radio">
                  <input
                    type="radio"
                    name="answer"
                    checked={picked === a.id}
                    onChange={() => setPicked(a.id)}
                  />
                  <span>{a.text}</span>
                </label>
              ))}
              <button
                type="button"
                className="tp-btn"
                disabled={!picked}
                onClick={() => {
                  if (!picked) return;
                  WebApp.HapticFeedback?.impactOccurred?.("medium");
                  logCompletion();
                  try {
                    const hash = `#/result?slug=${encodeURIComponent(slug)}&answerId=${encodeURIComponent(picked)}`;
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
        <MultiRunner test={test} onResultReady={logCompletion} />
      )}
      {test.type === "cards" && (
        <CardsRunner test={test as any} onReveal={logCompletion} />
      )}
      {test.type !== "single" && test.type !== "multi" && test.type !== "cards" && (
        <p className="muted">Этот тип теста пока запускается из бота. Поддержку в WebApp добавим позже.</p>
      )}
    </section>
  );
}

function CardsRunner({ test, onReveal }: { test: any; onReveal?: () => void }) {
  const [picked, setPicked] = useState<string | null>(null);
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
    if (picked) onReveal?.();
  }, [picked, onReveal]);

  if (!picked) {
    return (
      <div className="tp-wrap">
        <div className="tp-root-title">Выбери карту</div>
        <div className="tp-panel">
          <div className="tp-panel__content">
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
            </>
          ) : (
            <div className="tp-result-box"><p className="muted">Карта не найдена</p></div>
          )}
        </div>
      </div>
    </div>
  );
}

function MultiRunner({ test, onResultReady }: { test: TestRead; onResultReady?: () => void }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Record<string, string>>({}); // qid -> answerId
  const [done, setDone] = useState(false);

  const questions = test.questions || [];
  const current = questions[index];
  const answersCount = questions[0]?.answers?.length || 0;

  const isPointsMode = useMemo(() => {
    const anyRange = (test.results || []).some(r => (r?.min_score ?? null) !== null || (r?.max_score ?? null) !== null);
    return anyRange;
  }, [test]);

  const computeResult = (): { title: string; description?: string } | null => {
    if (!questions.length) return null;
    const picks = questions.map((q) => {
      const aId = selected[q.id];
      const a = q.answers.find(x => String(x.id) === String(aId));
      return a ? { order: a.order_num, id: a.id } : null;
    }).filter(Boolean) as { order: number; id: string }[];
    if (picks.length !== questions.length) return null;

    const results = test.results || [];
    if (isPointsMode) {
      const total = picks.reduce((sum, p) => sum + (p.order || 1), 0);
      const ranged = results.find((r) => {
        const min = r.min_score ?? null;
        const max = r.max_score ?? null;
        if (min === null || max === null) return false;
        return total >= min && total <= max;
      });
      if (ranged) return { title: ranged.title, description: ranged.description || undefined };
      const fallback = results[0] || results[results.length - 1];
      return fallback ? { title: fallback.title, description: fallback.description || undefined } : null;
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
      if (res) return { title: res.title, description: res.description || undefined };
      const a = questions[0]?.answers?.[bestOrder - 1];
      if (a?.explanation_title || a?.explanation_text) {
        return { title: a.explanation_title || "Результат", description: a.explanation_text || undefined };
      }
      return { title: "Результат", description: undefined };
    }
  };

  useEffect(() => {
    if (done) onResultReady?.();
  }, [done, onResultReady]);

  if (!done && current) {
    const picked = selected[current.id] || null;
    return (
      <div className="tp-wrap">
        <div className="tp-root-title">Выбери ответ</div>
        <div className="tp-panel">
          <div style={{ padding: 18 }}>
            <div className="tp-step">{`Вопрос ${index + 1}/${questions.length}`}</div>
            <h3 className="tp-question-title">{current.text}</h3>
            {current.answers.map((a) => (
              <label key={a.id} className="tp-radio">
                <input
                  type="radio"
                  name={`answer_${current.id}`}
                  checked={picked === a.id}
                  onChange={() => setSelected(prev => ({ ...prev, [current.id]: a.id }))}
                />
                <span>{a.text}</span>
              </label>
            ))}
            <button
              type="button"
              className="tp-btn"
              disabled={!picked}
              onClick={() => {
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

  const result = computeResult();
  return (
    <div className="tp-wrap">
      <div className="tp-root-title">Результат</div>
      <div className="tp-panel" style={{ padding: 0 }}>
        <div style={{ padding: 18 }}>
          {result ? (
            <>
              <div className="tp-result-title">{result.title}</div>
              <div className="tp-result-box"><p style={{ margin: 0 }}>{result.description || ""}</p></div>
            </>
          ) : (
            <div className="tp-result-box"><p className="muted" style={{ margin: 0 }}>Результат не вычислен</p></div>
          )}
        </div>
      </div>
    </div>
  );
}
