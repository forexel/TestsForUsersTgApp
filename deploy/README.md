# Docker Compose окружение

## Подготовка

1. Скопируйте `.env` рядом с compose:
   ```bash
   cp deploy/.env.example deploy/.env
   ```
2. Заполните переменные (токен бота, username и т.д.).

## Старт

```bash
docker compose -f deploy/docker-compose.yml up --build
```

Перед стартом бота выполните миграции:

```bash
docker compose -f deploy/docker-compose.yml run --rm migrator
```

Сервисы:
- API: http://localhost:8000
- WebApp: http://localhost:8080
- PostgreSQL: localhost:5432
