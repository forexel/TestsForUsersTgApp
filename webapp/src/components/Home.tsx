const BOT_USERNAME = (import.meta as any).env?.VITE_BOT_USERNAME as string | undefined;
import copyIcon from "../icons/copy.svg";
import cancelIcon from "../icons/cancel.svg";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import WebApp from "@twa-dev/sdk";
import TestPage from "./TestPage/Index";
import { TestType } from "../types";

const __DBG: string[] = (typeof window !== 'undefined' && (window as any).__DBG) || [];
if (typeof window !== 'undefined') (window as any).__DBG = __DBG;
const log = (...args: any[]) => {
  try {
    console.log(...args);
    __DBG.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    if (__DBG.length > 400) __DBG.splice(0, __DBG.length - 400);
  } catch {}
};
const warn = (...args: any[]) => {
  try {
    console.warn(...args);
    __DBG.push('[warn] ' + args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    if (__DBG.length > 400) __DBG.splice(0, __DBG.length - 400);
  } catch {}
};

const WEBAPP_ORIGIN = (typeof window !== 'undefined' ? window.location.origin : '') || '';

const parseHash = () => {
  try {
    const h = (typeof window !== 'undefined' ? window.location.hash : '') || '';
    const [path, qs] = h.replace(/^#/, '').split('?');
    const params = new URLSearchParams(qs || '');
    return { path: path || '/', params };
  } catch {
    return { path: '/', params: new URLSearchParams() };
  }
};

// --- Helpers for extracting start_param from query, hash, or Telegram initData
const parseSearch = () => {
  try {
    const s = (typeof window !== 'undefined' ? window.location.search : '') || '';
    return new URLSearchParams(s);
  } catch {
    return new URLSearchParams();
  }
};

function decodeStartParam(raw: string): string {
  // Try base64url → text, else return as-is
  try {
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(raw.length / 4) * 4, '=');
    const txt = atob(b64);
    return txt || raw;
  } catch { return raw; }
}

function extractStartParam(): string | null {
  const candidates: string[] = [];

  // 1) Try to read from Telegram initData (Desktop/Mobile put startapp here)
  try {
    const sp = (WebApp as any)?.initDataUnsafe?.start_param as string | undefined;
    if (typeof sp === "string" && sp) {
      log("deep-link: raw initData start_param =", sp);
      candidates.push(sp);
    }
  } catch {}

  // 2) Fallbacks from query (?tgWebAppStartParam | ?startapp | ?start)
  try {
    const qs = parseSearch();
    const raw = qs.get("tgWebAppStartParam") || qs.get("startapp") || qs.get("start");
    if (raw) {
      log("deep-link: raw query param =", raw);
      candidates.push(raw);
    }
  } catch {}

  if (candidates.length === 0) return null;

  // For every candidate, try several decodings and search for run_<slug>
  const expand = (val: string): string[] => {
    const out = [val];
    try {
      const dec = decodeURIComponent(val);
      if (dec && dec !== val) out.push(dec);
    } catch {}
    try {
      const b64 = val.replace(/-/g, "+").replace(/_/g, "/");
      const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
      const txt = atob(b64 + pad);
      if (txt) out.push(txt);
    } catch {}
    return out;
  };

  for (const cand of candidates) {
    for (const v of expand(cand)) {
      const m = typeof v === "string" ? v.match(/run_([A-Za-z0-9._\-]+)/) : null;
      if (m) {
        const norm = `run_${m[1]}`;
        log("deep-link: normalized start_param =", norm);
        return norm;
      }
    }
  }

  // Nothing matched run_<slug>; return the first raw candidate as a last resort
  warn("deep-link: could not normalize start_param, using raw");
  return candidates[0] || null;
}

type TestItem = {
  id: string;
  title: string;
  slug: string;
  type: TestType;
  created_at?: string | null;
};

interface HomeProps {
  onCreate: () => void;
}

export function Home({ onCreate }: HomeProps) {
  const [items, setItems] = useState<TestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [{ path, params }, setRoute] = useState(parseHash());
  log("route state:", JSON.stringify({ path, slug: params.get('slug') || null }));

  // Handle Telegram deep-links like startapp=run_<slug> → redirect to #/run?slug=...
  useEffect(() => {
    try {
      const sp = extractStartParam();
      log('deep-link check: normalized start_param =', sp);
      if (sp && typeof sp === 'string') {
        const m = sp.match(/^run_([A-Za-z0-9._\-]+)/);
        if (m && m[1]) {
          const slug = m[1];
          log('deep-link parsed → slug =', slug);
          window.location.hash = `#/run?slug=${encodeURIComponent(slug)}`;
        }
      }
    } catch (e) {
      warn('deep-link error', (e as any)?.message);
    }
  }, []);

  // Track hash route changes
  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    // initialize once on mount too
    onHash();
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const [dbg, setDbg] = useState<string[]>(() => (typeof window !== 'undefined' ? ((window as any).__DBG || []) : []));
  useEffect(() => {
    const t = setInterval(() => {
      try { setDbg([...(typeof window !== 'undefined' ? ((window as any).__DBG || []) : [])]); } catch {}
    }, 500);
    return () => clearInterval(t);
  }, []);

  const api = useMemo(() => axios.create({ baseURL: (import.meta as any).env?.VITE_API_BASE_URL }), []);

  const fetchTests = async () => {
    setLoading(true);
    setError(null);
    log("Home.tsx init: API_BASE=", (import.meta as any).env?.VITE_API_BASE_URL, "BOT=", BOT_USERNAME);
    log("Home.tsx initData length:", (WebApp.initData || "").length, "userId:", WebApp.initDataUnsafe?.user?.id);

    const tryEndpoints = async (): Promise<any[]> => {
      const url = "/tests/mine?limit=200";
      const headers = { headers: { "X-Telegram-Init-Data": WebApp.initData ?? "" } };
      try {
        const res = await api.get(url, headers);
        log("fetch", url, "status=", res.status, "ctype=", String(res?.headers?.["content-type"] || "").toLowerCase(), "len=", (Array.isArray(res?.data) ? res.data.length : Object.keys(res?.data || {}).length));
        const data = res?.data as any;
        const arr = Array.isArray(data) ? data : Array.isArray((data as any)?.items) ? (data as any).items : Array.isArray((data as any)?.results) ? (data as any).results : [];
        return Array.isArray(arr) ? arr : [];
      } catch (e: any) {
        warn("fetch fail", url, e?.response?.status || e?.message);
        throw e;
      }
    };

    try {
      const list = await tryEndpoints();
      log("final list raw count:", Array.isArray(list) ? list.length : -1);
      const mapped: TestItem[] = Array.isArray(list)
        ? list.map((t: any) => ({
            id: String(t.id),
            title: String(t.title),
            slug: String(t.slug),
            type: (t.type || "single") as TestType,
            created_at: (t.created_at || t.createdAt || null) as string | null,
          }))
        : [];
      // Sort by created_at desc when available (older tests like Oct 5 will appear too)
      try {
        mapped.sort((a, b) => {
          const da = a.created_at ? new Date(a.created_at).getTime() : 0;
          const db = b.created_at ? new Date(b.created_at).getTime() : 0;
          return db - da;
        });
      } catch {}
      setItems(mapped);
      log("parsed tests count:", mapped.length);
      if (mapped.length === 0) setError(null); // пусто — это не ошибка
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || "Не удалось загрузить список";
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTests();
  }, []);

  useEffect(() => {
    const onCreated = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const { slug, title, type } = detail as { slug?: string; title?: string; type?: TestType };
      if (!slug || !title) return;
      setItems((prev) => {
        if (prev.find((t) => t.slug === slug)) return prev;
        return [{ id: slug, title, slug, type: type ?? "single" }, ...prev];
      });
    };
    const onFocusOrHash = () => { fetchTests(); };
    window.addEventListener("test_created", onCreated as EventListener);
    window.addEventListener("focus", onFocusOrHash);
    window.addEventListener("hashchange", onFocusOrHash);
    return () => {
      window.removeEventListener("test_created", onCreated as EventListener);
      window.removeEventListener("focus", onFocusOrHash);
      window.removeEventListener("hashchange", onFocusOrHash);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCopy = async (slug: string) => {
    // Предпочитаем Mini App deep-link (startapp). Fallback — прямой веб‑линк.
    const link = BOT_USERNAME
      ? `https://t.me/${BOT_USERNAME}?start=run_${slug}`
      : (WEBAPP_ORIGIN ? `${WEBAPP_ORIGIN}/#/run?slug=${slug}` : `#/run?slug=${slug}`);
    try {
      await navigator.clipboard.writeText(link);
      WebApp.HapticFeedback?.notificationOccurred?.("success");
      WebApp.showPopup({ title: "Скопировано", message: link, buttons: [{ type: "ok" }] });
    } catch {
      WebApp.showPopup({ title: "Ссылка", message: link, buttons: [{ type: "ok" }] });
    }
  };

  const onDelete = async (id: string) => {
    const ok = confirm("Удалить тест?");
    if (!ok) return;
    try {
      await api.delete(`/tests/${id}`, { headers: { "X-Telegram-Init-Data": WebApp.initData ?? "" } });
      await fetchTests();
    } catch (e: any) {
      WebApp.showPopup({ title: "Ошибка", message: e?.message || "Не удалось удалить", buttons: [{ type: "ok" }] });
    }
  };

  log("render Home items=", items.length);

  // Route: run test in WebApp
  if (path === '/run') {
    const slug = params.get('slug') || '';
    log("route /run detected with slug=", slug);
    if (slug) {
      return <TestPage api={api} slug={slug} />;
    }
  }

  const openEditor = (type: TestType, slug: string) => {
    const next = `#/editor?type=${type}&slug=${slug}`;
    try {
      window.location.hash = next;
    } catch {
      try { window.location.assign(next); } catch {}
    }
  };

  return (
    <>
      <section className="card form-card">
        <h2 className="selector-title">
          Мои тесты
          <span className={`loading-inline ${loading ? 'is-active' : ''}`} aria-hidden>⏳</span>
        </h2>
        {error && <p className="error">{error}</p>}
        <div className="list">
          {items.map((t) => (
            <div
              key={t.slug}
              className="list-row list-row--interactive"
              role="button"
              tabIndex={0}
              onClick={() => openEditor(t.type, t.slug)}
              onKeyDown={(evt) => {
                if (evt.key === "Enter" || evt.key === " ") {
                  evt.preventDefault();
                  openEditor(t.type, t.slug);
                }
              }}
            >
              <span className="list-link">{t.title}</span>
              <div className="list-actions">
                <button
                  type="button"
                  className="icon"
                  title="Копировать ссылку"
                  onClick={(evt) => {
                    evt.stopPropagation();
                    onCopy(t.slug);
                  }}
                >
                  <img src={copyIcon} alt="copy" width={18} height={18} />
                </button>
                {/* 
                  {false && (
                    <button type="button" className="icon" title="Скопировать t.me ссылку" onClick={() => navigator.clipboard.writeText(`https://t.me/${BOT_USERNAME}?startapp=run_${t.slug}`)}>
                      <img src={copyIcon} alt="copy t.me" width={18} height={18} />
                    </button>
                  )}
                  */}
                <button
                  type="button"
                  className="icon danger"
                  title="Удалить"
                  onClick={(evt) => {
                    evt.stopPropagation();
                    onDelete(t.id);
                  }}
                >
                  <img src={cancelIcon} alt="delete" width={18} height={18} />
                </button>
              </div>
            </div>
          ))}
          {!loading && items.length === 0 && <p className="muted">Пока нет тестов</p>}
        </div>
        <div className="actions bottom">
          <button className="btn-wide" type="button" onClick={onCreate}>Создать</button>
        </div>
      </section>
    </>
  );
}
