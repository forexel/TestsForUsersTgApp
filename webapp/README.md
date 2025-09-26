# Telegram WebApp Admin UI

Vite + React интерфейс для конструктора тестов внутри Telegram WebApp.

## Локальный запуск

```bash
cd webapp
cp .env.example .env
npm install
npm run dev
```

По умолчанию WebApp доступен на `http://localhost:5173` и ходит в API по адресу `VITE_API_BASE_URL`.

## Сборка

```bash
npm run build
```

Результат появится в `dist/` и используется Docker-образом из `deploy/docker-compose.yml`.
