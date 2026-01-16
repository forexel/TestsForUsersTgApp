import { useState } from "react";
import type { AxiosInstance } from "axios";
import WebApp from "@twa-dev/sdk";

export type LeadConfig = {
  lead_enabled?: boolean;
  lead_collect_name?: boolean;
  lead_collect_phone?: boolean;
  lead_collect_email?: boolean;
  lead_collect_site?: boolean;
  lead_site_url?: string | null;
};

export default function LeadCapture({
  api,
  slug,
  config,
  responseId,
  onEvent,
}: {
  api: AxiosInstance;
  slug: string;
  config: LeadConfig;
  responseId: string | null;
  onEvent?: (eventType: string) => void;
}) {
  const enabled = Boolean(config.lead_enabled);
  const fields = {
    name: Boolean(config.lead_collect_name),
    phone: Boolean(config.lead_collect_phone),
    email: Boolean(config.lead_collect_email),
    site: Boolean(config.lead_collect_site),
  };
  const hasFields = fields.name || fields.phone || fields.email || fields.site;
  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadSite, setLeadSite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (!enabled || !hasFields) return null;

  const validate = () => {
    if (fields.name) {
      if (!leadName.trim()) return "Введите имя";
      if (leadName.trim().length > 10) return "Имя слишком длинное";
    }
    if (fields.phone) {
      if (!/^\+7\d{10}$/.test(leadPhone.trim())) return "Телефон должен быть в формате +7XXXXXXXXXX";
    }
    if (fields.email) {
      const email = leadEmail.trim();
      if (!email) return "Введите почту";
      if (email.length > 15) return "Почта слишком длинная";
      if (!/[^@\s]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/.test(email)) return "Неверный формат почты";
    }
    if (fields.site) {
      if (!leadSite.trim()) return "Введите адрес сайта";
    }
    return null;
  };

  const submit = async () => {
    if (!responseId) {
      setError("Не удалось сохранить ответы");
      return;
    }
    const nextError = validate();
    if (nextError) {
      setError(nextError);
      return;
    }
    setError(null);
    try {
      await api.patch(
        `/tests/responses/${encodeURIComponent(responseId)}`,
        {
          lead_name: fields.name ? leadName.trim() : undefined,
          lead_phone: fields.phone ? leadPhone.trim() : undefined,
          lead_email: fields.email ? leadEmail.trim() : undefined,
          lead_site: fields.site ? leadSite.trim() : undefined,
          lead_form_submitted: true,
        },
        { headers: { "X-Telegram-Init-Data": WebApp.initData ?? "" } }
      );
      setSubmitted(true);
      onEvent?.("lead_form_submit");
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? err?.message ?? "Не удалось отправить данные");
    }
  };

  const onSiteClick = async () => {
    if (responseId) {
      try {
        await api.patch(
          `/tests/responses/${encodeURIComponent(responseId)}`,
          { lead_site_clicked: true },
          { headers: { "X-Telegram-Init-Data": WebApp.initData ?? "" } }
        );
      } catch {}
    }
    onEvent?.("site_click");
    if (config.lead_site_url) {
      try { window.open(config.lead_site_url, "_blank"); } catch {}
    }
  };

  return (
    <div className="tp-lead">
      <div className="tp-lead__title">Оставьте контакты</div>
      <div className="tp-lead__grid">
        {fields.name && (
          <label className="tp-lead__field">
            <span>Имя</span>
            <input
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              maxLength={10}
              placeholder="Имя"
              disabled={submitted}
            />
          </label>
        )}
        {fields.phone && (
          <label className="tp-lead__field">
            <span>Телефон</span>
            <input
              value={leadPhone}
              onChange={(e) => setLeadPhone(e.target.value)}
              placeholder="+7XXXXXXXXXX"
              disabled={submitted}
            />
          </label>
        )}
        {fields.email && (
          <label className="tp-lead__field">
            <span>Почта</span>
            <input
              value={leadEmail}
              onChange={(e) => setLeadEmail(e.target.value)}
              maxLength={15}
              placeholder="name@site.ru"
              disabled={submitted}
            />
          </label>
        )}
        {fields.site && (
          <label className="tp-lead__field">
            <span>Адрес сайта</span>
            <input
              value={leadSite}
              onChange={(e) => setLeadSite(e.target.value)}
              placeholder="example.com"
              disabled={submitted}
            />
          </label>
        )}
      </div>
      {error && <div className="error" style={{ marginTop: 6 }}>{error}</div>}
      <div className="tp-lead__actions">
        {fields.site && config.lead_site_url && (
          <button type="button" className="tp-btn tp-btn--ghost" onClick={onSiteClick}>
            Перейти на сайт
          </button>
        )}
        <button type="button" className="tp-btn" onClick={submit} disabled={submitted}>
          {submitted ? "Отправлено" : "Отправить"}
        </button>
      </div>
    </div>
  );
}
