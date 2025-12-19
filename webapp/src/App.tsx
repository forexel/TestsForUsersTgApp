import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import WebApp from "@twa-dev/sdk";

import { TestType } from "./types";
import type { TelegramInitData, TelegramUser } from "./types/telegram";
import MultiQuestionEditor from "./components/editors/MultiQuestionEditor";
import CardsEditor from "./components/editors/CardsEditor";
import SingleEditor from "./components/editors/SingleEditor";
import { SelectType } from "./components/SelectType";
import { Home } from "./components/Home";
import Testsuccess from "./components/Testsuccess";
import TestPage from "./components/TestPage/Index";
import ResultPage from "./components/TestPage/result";
import Statistic from "./components/Statistic";

const api = axios.create({ baseURL: (import.meta as any).env?.VITE_API_BASE_URL });

type Route =
  | { name: "home" }
  | { name: "select" }
  | { name: "editor"; testType: TestType; slug?: string }
  | { name: "success"; slug?: string }
  | { name: "run"; slug: string }
  | { name: "result"; slug: string; answerId: string }
  | { name: "statistic" };

function parseHash(): Route {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  if (pathname.replace(/\/+$/, "") === "/statistic") {
    return { name: "statistic" };
  }
  const raw = (typeof window !== "undefined" ? window.location.hash : "") || ""; // like #/home
  const path = raw.replace(/^#\/?/, "");
  const [p, qs] = path.split("?", 2);
  const params = new URLSearchParams(qs || "");
  switch (p) {
    case "home":
    case "":
      return { name: "home" };
    case "selecttype":
    case "select":
      return { name: "select" };
    case "editor": {
      const t = (params.get("type") || "single") as TestType;
      const slug = params.get("slug") || undefined;
      return { name: "editor", testType: t, slug };
    }
    case "testsuccess": {
      const slug = params.get("slug") || undefined;
      return { name: "success", slug };
    }
    case "run": {
      const slug = params.get("slug") || "";
      return { name: "run", slug };
    }
    case "result": {
      const slug = params.get("slug") || "";
      const answerId = params.get("answerId") || "";
      return { name: "result", slug, answerId };
    }
    case "statistic":
      return { name: "statistic" };
    default:
      return { name: "home" };
  }
}

function pushHash(h: string) {
  try { window.location.assign(h); } catch { window.location.hash = h; }
}

export default function App() {
  const [initDataUnsafe, setInitDataUnsafe] = useState<TelegramInitData | null>(null);
  const [route, setRoute] = useState<Route>(() => parseHash());

  useEffect(() => {
    WebApp.ready();
    WebApp.expand();

    // Save init data for /tests/mine and user info
    setInitDataUnsafe(WebApp.initDataUnsafe ?? null);

    // Read Telegram start_param (when opened via t.me/... ?startapp=...)
    const startParam =
      WebApp.initDataUnsafe?.start_param ||
      new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("tgWebAppStartParam");

    // Decide initial route based on start_param; otherwise keep current hash; fallback to home
    const ensureInitialRoute = () => {
      const pathname = typeof window !== "undefined" ? window.location.pathname : "";
      if (pathname.replace(/\/+$/, "") === "/statistic") return;
      const currentHash = typeof window !== "undefined" ? window.location.hash : "";
      if (currentHash && currentHash !== "#/" && currentHash !== "#") return; // keep existing hash

      if (startParam) {
        if (startParam.startsWith("run_")) {
          const slug = startParam.slice(4);
          try { window.location.assign(`#/run?slug=${encodeURIComponent(slug)}`); }
          catch { window.location.hash = `#/run?slug=${encodeURIComponent(slug)}`; }
          return;
        }
        if (startParam === "create" || startParam.startsWith("create_")) {
          try { window.location.assign("#/select"); } catch { window.location.hash = "#/select"; }
          return;
        }
      }
      // default route
      try { window.location.assign("#/home"); } catch { window.location.hash = "#/home"; }
    };

    ensureInitialRoute();

    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const user = useMemo<TelegramUser | null>(() => initDataUnsafe?.user ?? null, [initDataUnsafe]);

  return (
    <main className="screen" style={{ minHeight: "100vh" }}>
      {route.name === "home" && (
        <Home onCreate={() => pushHash("#/select")} />
      )}
      {route.name === "select" && (
        <SelectType onBack={() => pushHash("#/home")} onNext={(type) => pushHash(`#/editor?type=${type}`)} />
      )}
      {route.name === "editor" && route.testType === "single" && (
        <SingleEditor
          api={api}
          {...(user ? { user } : {})}
          editSlug={route.slug}
          onClose={() => pushHash("#/home")}
          onCreated={(t) => pushHash(`#/testsuccess?slug=${t.slug}`)}
        />
      )}
      {route.name === "editor" && route.testType === "multi" && (
        <MultiQuestionEditor api={api} onClose={() => pushHash("#/home")} editSlug={route.slug} />
      )}
      {route.name === "editor" && route.testType === "cards" && (
        <CardsEditor api={api} onClose={() => pushHash("#/home")} editSlug={route.slug} />
      )}
      {route.name === "success" && (
        <Testsuccess slug={route.slug} onClose={() => pushHash("#/home")} />
      )}
      {route.name === "run" && (
        <TestPage api={api} slug={route.slug} />
      )}
      {route.name === "result" && (
        <ResultPage api={api} slug={route.slug} answerId={route.answerId} />
      )}
      {route.name === "statistic" && (
        <Statistic api={api} />
      )}
    </main>
  );
}
