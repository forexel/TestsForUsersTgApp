Project Architecture

Overview

- Purpose: Create, edit, list, run, and log tests via a Telegram WebApp with a FastAPI backend and a Telegram Bot helper.
- Components:
  - API (FastAPI + SQLAlchemy): persists tests, exposes CRUD, validates Telegram WebApp init data.
  - WebApp (Vite + React): UI to create tests and to run public tests by slug.
  - Bot (python-telegram-bot): deep-link entry, replies with a WebApp button to open a test.
  - Deploy (docker-compose + Nginx): static hosting for the WebApp and API services.

Services and Folders

- api/
  - app/main.py: FastAPI app factory. Registers CORS and routers under `Settings.api_v1_prefix` (default `/api/v1`).
  - app/api/api_v1/api.py: APIRouter aggregator; currently includes tests router.
  - app/api/api_v1/routers/tests.py: Tests CRUD and public endpoints plus run-log endpoint.
    - GET `/tests/mine`: current user's tests (via `X-Telegram-Init-Data`).
    - GET `/tests/all`: admin-only list (via `get_current_admin`).
    - GET `/tests/public`: list of public tests only.
    - POST `/tests`: create test, server-side slug normalization + uniqueness.
    - GET `/tests/slug/{slug}`: admin-only fetch by slug.
    - GET `/tests/slug/{slug}/public`: public fetch by slug (requires `is_public=True`).
  - app/core/config.py: Pydantic `Settings` with env parsing; `admin_ids`, `bot_token`, DB URL, etc.
  - app/core/telegram.py: Verification of `X-Telegram-Init-Data` (HMAC with bot token), parsing Telegram user and auth date.
  - app/dependencies/auth.py: FastAPI dependencies for init data and admin check.
  - app/db/session.py, app/db/base.py: SQLAlchemy Session and Base configuration.
  - app/models/test_models.py: SQLAlchemy models: `Test`, `Question`, `Answer`, `Result`, `UserSession`, `TestRunLog`, and enum `TestType`.
  - app/crud/tests.py: DB operations to create/list/update/delete tests with nested relations.
  - app/schemas/tests.py: Pydantic DTOs for requests and responses.

- webapp/
  - src/App.tsx: Minimal hash-router. Reads `WebApp.initDataUnsafe.start_param` and routes:
    - `run_<slug>` → `#/run?slug=<slug>`
    - `create` → `#/select`
    - Default → `#/home`
  - src/components/Home.tsx:
    - Fetch order: `/tests/mine` (with `X-Telegram-Init-Data`) → `/tests/all` → `/tests/public` → `/tests`.
    - Каждая строка списка открывает редактор `#/editor?type=...&slug=...` в рамках WebApp (без перехода на внешние ссылки).
    - Share link формат: если `VITE_BOT_USERNAME` → `https://t.me/<bot>?start=run_<slug>`; иначе `/#/run?slug=<slug>`.
    - On delete: DELETE `/tests/{id}` с заголовком init data.
  - src/components/editors/SingleEditor.tsx: Single-question editor (2 шага). POST `/tests`.
  - src/components/editors/MultiQuestionEditor.tsx: Multi-question editor (3 шага, majority/points, выравнивание ответов, отдельные поля «заголовок + описание» для каждого результата).
  - src/components/editors/CardsEditor.tsx: Cards editor (2 шага). Каждая карта: image (S3 upload), title, description. 2–6 карт.
  - src/components/TestPage/Index.tsx: Public test runner (single/multi/cards) via GET `/tests/slug/{slug}/public`. Логирует прохождения через POST `/tests/slug/{slug}/logs`.
  - src/components/TestPage/result.tsx: Displays per-answer explanation/result for single.
  - src/styles.css: Base styling + вспомогательные классы (`list-link-button`, `.label`, т.д.). Nginx serves `index.html` for SPA routing.

- bot/
  - main.py: Bot bootstrap with `python-telegram-bot` v20+. Registers `/start` and `/admin`, plus callbacks.
  - handlers/tests.py:
    - `/start run_<slug>`: replies with WebApp button `?tgWebAppStartParam=run_<slug>`.
    - Message handler сканирует групповые сообщения и автоматически добавляет кнопку «Открыть тест», если видит `run_<slug>` или `slug=<...>` (работает и для ссылок в превью).
    - Inline button callbacks для classic chat-run flow (не обязателен в WebApp сценариях).
  - services/api_client.py, services/session_store.py: helpers for bot-side sessions (used by inline flow).
  - config.py: Bot settings (token, admin IDs, `webapp_url`).

- deploy/
  - docker-compose.yml: API, bot, webapp, DB, and Nginx setup.
  - nginx/webapp.conf: Static hosting for WebApp, SPA fallback to `/index.html`.
  - .env(.example): consolidated service envs.

Key Data Flows

1) Create Test (in WebApp)
   - User opens WebApp (inside Telegram). `WebApp.initData` is available.
   - WebApp calls POST `/api/v1/tests` with `X-Telegram-Init-Data` header.
   - Backend validates signature, uses `init_data.user.id` as `created_by`, normalizes/assigns unique `slug`, persists nested entities.
   - WebApp navigates to `#/testsuccess?slug=<slug>` и диспатчит `test_created`, чтобы Home обновил список.

2) List My Tests (Home)
   - Home tries `/tests/mine` with `X-Telegram-Init-Data`; если пусто/ошибка — fallback к `/tests/all`, `/tests/public`, `/tests`.
   - Клик на строке ведёт на `#/editor?type=...&slug=...`, редактирование происходит в этой же WebApp с вытягиванием данных из `/tests/slug/{slug}` (под владельца).
   - Share link: `https://t.me/<bot>?start=run_<slug>` (если `VITE_BOT_USERNAME` определён), иначе `/#/run?...`.

3) Open Test by Link / Bot auto button
   - From WebApp: `/#/run?slug=<slug>` directly loads WebApp runner.
   - From Telegram deep link: `https://t.me/<bot>?startapp=run_<slug>` opens WebApp inside Telegram.
   - Bot `/start run_<slug>` replies with WebApp button.
   - Если судьба теста публикуется в группе, обработчик `detect_test_links` автоматически отвечает кнопкой, даже если ссылка прикреплена предпросмотром.

Important Behaviors and Constraints

- `X-Telegram-Init-Data` must be valid/fresh (≤24h), signed – API rejects invalid or expired data.
- Public runner uses `/tests/slug/{slug}/public`. Test must be `is_public=True`.
- Slugs normalized/deduplicated server-side.
- Multi-question results support both `title` и `description`; фронт делит ввод на два поля.
- Test run logging: `/tests/slug/{slug}/logs` сохраняет ссылку, user/username, source chat id/type, author username.

Known Gaps / Observations

- Home list not updating: if `/tests/mine` fails (e.g., invalid init data), Home may fall back to an empty public list. Ensure Telegram init data is present in the WebApp (must be opened inside Telegram or provide mock header in dev).
- Public link error: If the test is created with `is_public=False` (default in Single flow), the run page uses `/public` endpoint and returns 404. Consider setting `is_public` default to true for shared use-cases or guide the creator to enable it.
- Bot `/start` expects `run_...` argument. For immediate WebApp open, prefer `?startapp=run_<slug>` links (already used by Home via `VITE_BOT_USERNAME`).

Recommendations

- WebApp UX
  - When creating a test intended for sharing, default `isPublic` to true or prompt to publish on the final step (especially for Single flow).
  - On success screen, render both variants: WebApp direct link and Bot deep link, with copy buttons.
  - In Home, surface the publish status and a toggle to publish/unpublish (PATCH `/tests/{id}`).

Media / S3

- Upload flow:
  - WebApp (CardsEditor) posts `multipart/form-data` to `POST /api/v1/media/upload` with `X-Telegram-Init-Data` header.
  - API validates admin header, stores object to S3 (MinIO in local), returns `{ url, key }`.
  - WebApp stores returned URL in the card `image_url`.
- Settings:
  - `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_USE_PATH_STYLE`, `S3_PUBLIC_BASE_URL`.
- Local deployment:
  - `deploy/docker-compose.yml` includes `minio` + `minio-setup` to create bucket and set anonymous read.
  - Public URLs default to `S3_PUBLIC_BASE_URL/key` for convenience.

Cards mode (open/closed)

- Выбор способа выбора карт задаётся на 1‑м шаге CardsEditor (open/closed).
- Режим кодируется префиксом в `Test.description`: `[open]` или `[closed]` и парсится в CardsRunner.

- API
  - Add `PATCH /tests/{id}` field `is_public` from WebApp controls (already supported by schema and CRUD).
  - Add GET `/tests/slug/{slug}` non-admin variant that hides private fields but respects ownership via `init_data`.
  - Consider a read-only public projection DTO for `/public` endpoints.

- Bot
  - Ensure `BOT_WEBAPP_URL`/`webapp_url` is configured to the deployed WebApp origin to generate correct `web_app` button links.
  - Optionally, if a slug comes in via `/start run_<slug>`, also include a plain link fallback.

- Deploy
  - Confirm Nginx static SPA config has `try_files ... /index.html;` (present in `deploy/nginx/webapp.conf`).
  - Ensure CORS origin is limited appropriately in production.

File Cleanup Notes

- Removed `api/app/models/test.py` (empty, unused).
- Removed root `main` (empty, unused).

Environment Variables

- API
  - `DATABASE_URL`
  - `BOT_TOKEN` (for init data signature validation)
  - `ADMIN_IDS` (JSON array or comma-separated)
- WebApp
  - `VITE_API_BASE_URL` (e.g., `http://localhost:8000/api/v1`)
  - `VITE_BOT_USERNAME` (to generate Telegram deep links)
- Bot
  - `BOT_BOT_TOKEN`
  - `BOT_WEBAPP_URL` or `webapp_url` in config (e.g., `https://<domain>`)
