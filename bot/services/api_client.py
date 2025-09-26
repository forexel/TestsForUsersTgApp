from __future__ import annotations

from typing import Any

import httpx

from bot.config import get_settings


class ApiClient:
    def __init__(self, base_url: str | None = None) -> None:
        settings = get_settings()
        self.base_url = base_url or str(settings.api_base_url)
        self._client = httpx.AsyncClient(base_url=self.base_url, timeout=10.0)

    async def get_public_test(self, slug: str) -> dict[str, Any] | None:
        response = await self._client.get(f"/tests/slug/{slug}/public")
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json()

    async def get_test(self, slug: str) -> dict[str, Any] | None:
        response = await self._client.get(f"/tests/slug/{slug}")
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json()

    async def aclose(self) -> None:
        await self._client.aclose()


async def get_api_client() -> ApiClient:
    return ApiClient()
