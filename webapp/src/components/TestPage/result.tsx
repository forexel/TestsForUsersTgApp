


import { useEffect, useMemo, useState, useCallback } from "react";
import type { AxiosInstance } from "axios";
import WebApp from "@twa-dev/sdk";
import "./testpage.css";
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
  bg_color?: string | null;
  lead_enabled?: boolean;
  lead_collect_name?: boolean;
  lead_collect_phone?: boolean;
  lead_collect_email?: boolean;
  lead_collect_site?: boolean;
  lead_site_url?: string | null;
};

export default function ResultPage({
  api,
  slug,
  answerId,
  responseId,
}: {
  api: AxiosInstance;
  slug: string;
  answerId: string;
  responseId?: string;
}) {
  const [test, setTest] = useState<TestRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  useEffect(() => {
    const raw = test?.bg_color || "3E8BBF";
    const clean = String(raw).replace(/^#/, "");
    try {
      document.documentElement.style.setProperty("--tp-bg", `#${clean}`);
      document.body.style.setProperty("--tp-bg", `#${clean}`);
    } catch {}
  }, [test?.bg_color]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    api
      .get(`/tests/slug/${encodeURIComponent(slug)}/public`, { headers: { "X-Telegram-Init-Data": WebApp.initData ?? "" } })
      .then((res) => {
        if (mounted) setTest(res.data as TestRead);
      })
      .catch((e) => {
        if (mounted) setError(e?.response?.data?.detail || e?.message || "Тест не найден");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [api, slug]);

  const logEvent = useCallback((eventType: string) => {
    if (!slug) return;
    api.post(
      `/tests/slug/${encodeURIComponent(slug)}/events`,
      { event_type: eventType },
      { headers: { "X-Telegram-Init-Data": WebApp.initData ?? "" } }
    ).catch(() => {});
  }, [api, slug]);

  const pickedAnswer = useMemo(() => {
    const q = test?.questions?.[0];
    return q?.answers?.find((a) => String(a.id) === String(answerId));
  }, [test, answerId]);

  if (loading) return <section className="card"><p>Загрузка…</p></section>;
  if (error) return <section className="card"><p className="error">{error}</p></section>;
  if (!test) return null;

  return (
    <div className="tp-wrap">
      <div className="tp-root-title">Результат</div>
      <div className="tp-panel tp-panel--result">
        <div className="tp-panel__content tp-result">
          {pickedAnswer ? (
            <>
              {pickedAnswer.explanation_title && (
                <div className="tp-result-title">{pickedAnswer.explanation_title}</div>
              )}
              <div className="tp-result-box">
                <p style={{ margin: 0 }}>{pickedAnswer.explanation_text || ""}</p>
              </div>
              {test && (
                <LeadCapture
                  api={api}
                  slug={slug}
                  config={test}
                  responseId={responseId || null}
                  onEvent={(eventType) => logEvent(eventType)}
                />
              )}
              <button
                className="tp-btn"
                type="button"
                onClick={() => {
                  WebApp.HapticFeedback?.notificationOccurred?.("success");
                  try {
                    (window as any).location.hash = "#/home";
                  } catch {}
                }}
              >
                Закрыть
              </button>
            </>
          ) : (
            <div className="tp-result-box">
              <p className="muted" style={{ margin: 0 }}>Ответ не найден</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
