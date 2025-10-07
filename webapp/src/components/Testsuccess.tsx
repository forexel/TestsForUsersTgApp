const BOT_USERNAME = (import.meta as any).env?.VITE_BOT_USERNAME as string | undefined;
import WebApp from "@twa-dev/sdk";

const WEBAPP_ORIGIN = (typeof window !== 'undefined' ? window.location.origin : '') || (import.meta as any).env?.VITE_WEBAPP_ORIGIN || '';

export default function Testsuccess({ slug: slugProp, onClose }: { slug?: string; onClose?: () => void }) {
  // Try to extract slug from query if not provided as prop
  let slug = slugProp;
  if (!slug && typeof window !== "undefined") {
    try {
      const hash = window.location.hash || ""; // like #/testsuccess?slug=abc
      const idx = hash.indexOf("?");
      if (idx !== -1) {
        const qs = new URLSearchParams(hash.slice(idx + 1));
        slug = qs.get("slug") || undefined;
      }
    } catch {}
  }

  const link = slug
    ? (BOT_USERNAME
        ? `https://t.me/${BOT_USERNAME}?start=run_${slug}`
        : `${WEBAPP_ORIGIN}/#/run?slug=${slug}`)
    : undefined;

  const goHome = () => {
    if (typeof window !== "undefined") {
      try { window.location.assign("#/home"); } catch { window.location.hash = "#/home"; }
    }
    onClose?.();
  };

  return (
    <section className="card form-card">
      <h2 className="form-title">Тест успешно создан</h2>
      {link ? (
        <>
          <p className="success-text">Вот ссылка на тест. Передай её пользователю или размести в канале с комментарием</p>
          <p>
            <a className="success-link" href={link} target="_blank" rel="noreferrer">{link}</a>
          </p>
          <div className="actions bottom">
            <button
              className="btn-wide"
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link!);
                  WebApp.HapticFeedback?.notificationOccurred?.("success");
                  WebApp.showPopup({ title: "Скопировано", message: link!, buttons: [{ type: "ok" }] });
                } catch {
                  WebApp.showPopup({ title: "Ссылка", message: link!, buttons: [{ type: "ok" }] });
                }
              }}
            >
              Скопировать ссылку
            </button>
            <button className="secondary" type="button" onClick={goHome} style={{ marginLeft: 8 }}>На главную</button>
          </div>
        </>
      ) : (
        <>
          <p>Ссылка недоступна. Вернуться на главную?</p>
          <div className="actions bottom">
            <button className="btn-wide" type="button" onClick={goHome}>На главную</button>
          </div>
        </>
      )}
    </section>
  );
}