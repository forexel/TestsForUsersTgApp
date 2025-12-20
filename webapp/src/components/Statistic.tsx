import { useEffect, useState } from "react";
import type { AxiosInstance } from "axios";

type Stats = {
  tests_created: number;
  tests_completed: number;
  tests_opened: number;
  daily_created_users: number;
  daily_opened_users: number;
  daily_completed_users: number;
  monthly_created_users: number;
  monthly_opened_users: number;
  monthly_completed_users: number;
};

export default function Statistic({ api }: { api: AxiosInstance }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState<string>(() => {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  });
  const [month, setMonth] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  });

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (day) params.set("day", day);
    if (month) {
      const [y, m] = month.split("-");
      if (y && m) {
        params.set("year", y);
        params.set("month", String(Number(m)));
      }
    }
    const url = params.toString() ? `/stats?${params.toString()}` : "/stats";
    api
      .get(url)
      .then((res) => {
        if (!mounted) return;
        setStats(res.data as Stats);
      })
      .catch((err: any) => {
        if (!mounted) return;
        const message = err?.response?.data?.detail ?? err?.message ?? "Не удалось загрузить статистику";
        setError(String(message));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [api, day, month]);

  if (loading) {
    return (
      <section className="card form-card">
        <p>Загрузка…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="card form-card">
        <p className="error">{error}</p>
      </section>
    );
  }

  return (
    <section className="card form-card">
      <h2 className="form-title">Статистика</h2>
      <div className="stats-grid">
        <div className="stats-card">
          <div className="stats-label">Тестов создано</div>
          <div className="stats-value">{stats?.tests_created ?? 0}</div>
        </div>
        <div className="stats-card">
          <div className="stats-label">Тестов пройдено</div>
          <div className="stats-value">{stats?.tests_completed ?? 0}</div>
        </div>
        <div className="stats-card">
          <div className="stats-label">Тестов открыто</div>
          <div className="stats-value">{stats?.tests_opened ?? 0}</div>
        </div>
      </div>
      <div className="stats-block">
        <div className="stats-block__title">Уникальные пользователи за день</div>
        <label className="stats-control">
          <span>День</span>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <div className="stats-grid">
          <div className="stats-card">
            <div className="stats-label">Создали тесты</div>
            <div className="stats-value">{stats?.daily_created_users ?? 0}</div>
          </div>
          <div className="stats-card">
            <div className="stats-label">Открыли тесты</div>
            <div className="stats-value">{stats?.daily_opened_users ?? 0}</div>
          </div>
          <div className="stats-card">
            <div className="stats-label">Прошли тесты</div>
            <div className="stats-value">{stats?.daily_completed_users ?? 0}</div>
          </div>
        </div>
      </div>
      <div className="stats-block">
        <div className="stats-block__title">Уникальные пользователи за месяц</div>
        <label className="stats-control">
          <span>Месяц</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <div className="stats-grid">
          <div className="stats-card">
            <div className="stats-label">Создали тесты</div>
            <div className="stats-value">{stats?.monthly_created_users ?? 0}</div>
          </div>
          <div className="stats-card">
            <div className="stats-label">Открыли тесты</div>
            <div className="stats-value">{stats?.monthly_opened_users ?? 0}</div>
          </div>
          <div className="stats-card">
            <div className="stats-label">Прошли тесты</div>
            <div className="stats-value">{stats?.monthly_completed_users ?? 0}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
