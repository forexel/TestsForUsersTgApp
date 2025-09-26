import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import WebApp from "@twa-dev/sdk";

import { TestType } from "./types";
import type { TelegramInitData, TelegramUser } from "./types/telegram";
import { TestEditor } from "./components/TestEditor";

const api = axios.create({
  baseURL: __API_BASE_URL__
});

export default function App() {
  const [initDataUnsafe, setInitDataUnsafe] = useState<TelegramInitData | null>(null);
  const [mode, setMode] = useState<TestType | null>(null);

  useEffect(() => {
    WebApp.ready();
    WebApp.expand();
    setInitDataUnsafe(WebApp.initDataUnsafe ?? null);
  }, []);

  const user = useMemo<TelegramUser | null>(() => initDataUnsafe?.user ?? null, [initDataUnsafe]);

  if (!user) {
    return (
      <main className="screen">
        <section className="card">
          <h1>Конструктор тестов</h1>
          <p>Откройте WebApp через кнопку бота, чтобы загрузить данные авторизации.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="screen">
      <header className="card header">
        <div>
          <h1>Конструктор тестов</h1>
          <p className="muted">{user.username ? `@${user.username}` : `${user.first_name ?? "Админ"}`}</p>
        </div>
        {mode && (
          <button className="secondary" onClick={() => setMode(null)}>
            Назад
          </button>
        )}
      </header>

      {!mode ? (
        <section className="card">
          <h2>Выберите тип теста</h2>
          <div className="grid">
            <button onClick={() => setMode("single")}>
              <strong>Один вопрос</strong>
              <span>Вариант с одним вопросом и несколькими ответами.</span>
            </button>
            <button onClick={() => setMode("cards")}>
              <strong>Выбор карты</strong>
              <span>Покажите карты и свяжите их с результатами.</span>
            </button>
            <button onClick={() => setMode("multi")}>
              <strong>Несколько вопросов</strong>
              <span>Последовательность вопросов с суммой баллов.</span>
            </button>
          </div>
        </section>
      ) : (
        <TestEditor api={api} type={mode} user={user} onClose={() => setMode(null)} />
      )}
    </main>
  );
}
