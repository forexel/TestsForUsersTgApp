import { useEffect, useMemo, useState } from "react";
import type { AxiosInstance } from "axios";
import WebApp from "@twa-dev/sdk";

declare const __BOT_USERNAME__: string | undefined;

export type TestItem = {
  slug: string;
  title: string;
  type: string;
};

export function TestList({ api, lastCreated, onCreate }: { api: AxiosInstance; lastCreated?: TestItem | null; onCreate?: () => void }) {
  const [items, setItems] = useState<TestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const botLink = useMemo(() => (slug: string) => (__BOT_USERNAME__ ? `t.me/${__BOT_USERNAME__}?start=run_${slug}` : `t.me/?start=run_${slug}`), []);

  const fetchList = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get("/tests", { headers: { "X-Telegram-Init-Data": WebApp.initData ?? "" } });
      const data = Array.isArray(res.data) ? res.data : res.data?.items ?? [];
      setItems(data);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось загрузить список тестов");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Мгновенно добавляем только что созданный тест сверху списка (не дожидаясь запроса)
  useEffect(() => {
    if (lastCreated && lastCreated.slug && !items.find((t) => t.slug === lastCreated.slug)) {
      setItems((prev) => [lastCreated, ...prev]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastCreated?.slug]);

  return (
    <section className="card">
      <div className="list-header">
        <h2 className="selector-title">Мои тесты</h2>
        <button className="tertiary" type="button" onClick={fetchList} disabled={loading}>
          {loading ? "Обновление…" : "Обновить"}
        </button>
        <button className="primary" type="button" onClick={onCreate} style={{ marginLeft: 8 }}>
          Создать
        </button>
      </div>
      {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}
      {items.length === 0 && !loading && <p>Не было создано ни одного теста</p>}
      <ul className="link-list">
        {items.map((t) => (
          <li key={t.slug} className="link-item">
            <a href={`https://${botLink(t.slug)}`} target="_blank" rel="noreferrer">
              {t.title}
            </a>
            <span className="badge">{modeToLabel(t.type)}</span>
            <code className="slug">{t.slug}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}

function modeToLabel(mode: string): string {
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