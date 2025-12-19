import { useEffect, useState } from "react";
import type { AxiosInstance } from "axios";

type Stats = {
  tests_created: number;
  tests_completed: number;
  tests_opened: number;
};

export default function Statistic({ api }: { api: AxiosInstance }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    api
      .get("/stats")
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
  }, [api]);

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
    </section>
  );
}
