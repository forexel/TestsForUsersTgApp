# TestsForUsers Telegram Platform

Монорепозиторий для Telegram-бота, FastAPI backend, React WebApp-конструктора и docker-compose оркестровки.

## Состав репозитория

- `api/` — FastAPI + SQLAlchemy 2.0 + Alembic.
- `bot/` — python-telegram-bot v21, Telegram WebApp кнопка для админов и прохождение single-тестов.
- `webapp/` — Vite + React интерфейс конструктора тестов с валидацией initData.
- `migrations/` — Alembic миграции (стартовая схема в `0001_initial.py`).
- `deploy/` — docker-compose, примеры переменных окружения и конфиги nginx.

## Требования

- Docker / Docker Compose (для быстрого старта).
- Python 3.11, Node.js 18+ (если запускать сервисы отдельно).
- Токен Telegram-бота и список admin_id (Telegram user id).

### Как получить токен и admin_id
1. Вписываемся в @BotFather → `/newbot` → получаем токен `1234:ABC`.
2. Включаем «Allow WebApp inline keyboard» в настройках бота (BotFather → `/setdomain`, `/setmenubutton`).
3. Определяем свой Telegram user id (например, через @userinfobot) и добавляем в список админов.

## Быстрый старт через Docker

1. Скопируйте пример окружения и заполните значения:
   ```bash
   cp deploy/.env.example deploy/.env
   ```
   Минимально нужны:
   - `BOT_BOT_TOKEN` — токен бота.
   - `BOT_ADMIN_IDS` — список id через запятую, например `123456789,987654321`.
   - `BOT_WEBAPP_URL` — публичная ссылка на WebApp (для локального запуска можно оставить `http://localhost:8080`).
   - `WEBAPP_API_BASE_URL` — адрес API, который WebApp дергает (по умолчанию `http://localhost:8000/api/v1`).

2. Примените миграции БД:
   ```bash
   docker compose -f deploy/docker-compose.yml run --rm migrator
   ```

3. Запустите окружение:
   ```bash
   docker compose -f deploy/docker-compose.yml up --build
   ```

После старта:
- API доступно: `http://localhost:8000` (Swagger: `/docs`).
- WebApp: `http://localhost:8080`.
- PostgreSQL: `localhost:5432` (`postgres/postgres`).
- Бот работает в режиме polling и готов к deep-link `t.me/<bot>?start=run_<slug>`.

### Локальный S3 (MinIO)

В compose уже включены службы `minio` и `minio-setup`:

- Консоль MinIO: `http://localhost:9001` (логин/пароль из `.env`: `S3_ACCESS_KEY`/`S3_SECRET_KEY`).
- S3 endpoint: `http://localhost:9000`.
- Бакет создаётся автоматически: `S3_BUCKET` (по умолчанию `test-media`), на нём включён анонимный download.

Переменные окружения для API:

```
S3_ENDPOINT=http://minio:9000         # внутри docker сети
S3_BUCKET=test-media
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_REGION=us-east-1
S3_USE_PATH_STYLE=true
S3_PUBLIC_BASE_URL=http://localhost:9000/test-media
```

Команды запуска c MinIO:

```bash
cd deploy
docker compose up -d --build

# проверить логи и создание бакета
docker compose logs -f minio minio-setup

# остановить окружение
docker compose down

# очистить данные minio/postgres
docker volume ls | grep TestsForUsersTgApp | awk '{print $2}' | xargs -I{} docker volume rm {}
```

Проверка загрузки через API:

```bash
curl -F "file=@/path/to/image.jpg" \
     -H "X-Telegram-Init-Data: <init-data-from-telegram>" \
     http://localhost:8000/api/v1/media/upload
```

В ответ придёт JSON `{ "url": "http://localhost:9000/test-media/....", "key": "..." }`.

## Создание и прохождение теста
1. Откройте в Telegram бота → `/admin` → кнопку «Открыть конструктор» (WebApp).
2. В конструкторе выберите тип теста и заполните шаги:
   - Один вопрос — 2 шага (название → вопрос/ответы).
   - Несколько вопросов — 2 шага (название + метод подсчёта → вопросы/ответы/результаты).
   - Выбор карты — 2 шага (название + вопрос + режим open/closed → карты). Каждая карта: загрузка изображения (в S3), заголовок и описание; 2–6 карт.
3. Скопируйте ссылку `t.me/<bot>?start=run_<slug>` из уведомления.
4. Отправьте ссылку себе или пользователям. Бот загрузит тест и предложит варианты ответов. Для `single`-теста результат выводится после выбора ответа.

## Запуск сервисов без Docker

### Backend API
```bash
cd api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL="postgresql+psycopg://postgres:postgres@localhost:5432/tests_for_users"
uvicorn app.main:app --reload --port 8000
```

### Alembic миграции
```bash
cd api
source .venv/bin/activate
alembic -c ../alembic.ini upgrade head
```

### Telegram-бот
```bash
cd bot
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export BOT_BOT_TOKEN=123456:ABC
export BOT_API_BASE_URL=http://localhost:8000/api/v1
export BOT_WEBAPP_URL=http://localhost:5173
export BOT_ADMIN_IDS="123456789"
python -m bot.main
```

### WebApp (разработка)
```bash
cd webapp
npm install
cp .env.example .env   # при необходимости правим переменные
npm run dev -- --host --port 5173
```

## Дополнительно
- `deploy/docker-compose.yml` можно расширить Nginx-прокси/SSL для продакшена.
- WebApp Dockerfile принимает аргументы `VITE_API_BASE_URL` и `VITE_BOT_USERNAME` для сборки.
- Результаты тестов и сессии сейчас хранятся в памяти бота; перед продом имеет смысл перенести в БД и добавить метрики.
- Для карточек WebApp поддерживает загрузку изображений прямо в S3 (через `/media/upload`).

## Обновление: редактирование тестов и логирование прохождений
- WebApp теперь открывает существующие тесты в режиме редактирования из списка «Мои тесты» и подтягивает все ранее сохранённые данные.
- На странице прохождения выполняется логирование каждого завершённого теста вместе со ссылкой, пользователем и источником перехода.
- API сохраняет username автора теста, чтобы в логах было видно кто создал тест.
- Бот больше не ограничивает команду `/admin` списком админов, так что открыть конструктор теперь может любой пользователь.

### Миграция БД
Новые поля и таблицы добавлены миграцией `0002_add_owner_username_and_logs`. Чтобы применить её:

1. **Через Alembic локально**
   ```bash
   cd api
   source .venv/bin/activate          # если используется виртуальное окружение
   alembic upgrade head               # либо alembic upgrade 0002_add_owner_username_and_logs
   ```
   После применения перезапустите API (`uvicorn`/docker-compose), чтобы он увидел свежую схему.

2. **Через docker-compose**
   ```bash
   cd deploy
   docker compose run --rm migrator
   ```
   Контейнер `migrator` применит все недостающие миграции и завершится.

3. **Проверка**
   - Убедитесь, что в таблице `tests` появилось поле `created_by_username`, а также создана таблица `test_run_logs`.
   - В логах API должна появляться запись при POST `/api/v1/tests/slug/<slug>/logs`.

После миграции перезапустите API и бота, чтобы они подхватили новые переменные окружения (`BOT_USERNAME`), и перепройдите любой тест, чтобы убедиться в появлении записей в `test_run_logs`.
