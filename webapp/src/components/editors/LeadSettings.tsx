import React from "react";

export type LeadSettingsValue = {
  leadEnabled: boolean;
  leadCollectName: boolean;
  leadCollectPhone: boolean;
  leadCollectEmail: boolean;
  leadCollectSite: boolean;
  leadSiteUrl: string;
};

export function LeadSettings({
  value,
  onChange,
}: {
  value: LeadSettingsValue;
  onChange: (next: LeadSettingsValue) => void;
}) {
  const update = (patch: Partial<LeadSettingsValue>) => onChange({ ...value, ...patch });
  const disabled = !value.leadEnabled;
  return (
    <section className="form">
      <h2 className="form-title">Сбор лидов</h2>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={value.leadEnabled}
          onChange={(e) => update({ leadEnabled: e.target.checked })}
        />
        Включить сбор лидов
      </label>
      <div className="muted" style={{ margin: "8px 0 6px" }}>Какие поля показывать на результате?</div>
      <label className={`checkbox${disabled ? " muted" : ""}`}>
        <input
          type="checkbox"
          checked={value.leadCollectName}
          onChange={(e) => update({ leadCollectName: e.target.checked })}
          disabled={disabled}
        />
        Имя (до 10 символов)
      </label>
      <label className={`checkbox${disabled ? " muted" : ""}`}>
        <input
          type="checkbox"
          checked={value.leadCollectPhone}
          onChange={(e) => update({ leadCollectPhone: e.target.checked })}
          disabled={disabled}
        />
        Телефон (+7 и 10 цифр)
      </label>
      <label className={`checkbox${disabled ? " muted" : ""}`}>
        <input
          type="checkbox"
          checked={value.leadCollectEmail}
          onChange={(e) => update({ leadCollectEmail: e.target.checked })}
          disabled={disabled}
        />
        Почта (до 15 символов, с @ и доменом)
      </label>
      <label className={`checkbox${disabled ? " muted" : ""}`}>
        <input
          type="checkbox"
          checked={value.leadCollectSite}
          onChange={(e) => update({ leadCollectSite: e.target.checked })}
          disabled={disabled}
        />
        Адрес сайта
      </label>
      {value.leadCollectSite && value.leadEnabled && (
        <label className="label-inline" style={{ marginTop: 8 }}>
          <span className="label-text">Ссылка на сайт</span>
          <input
            value={value.leadSiteUrl}
            onChange={(e) => update({ leadSiteUrl: e.target.value })}
            placeholder="https://example.com"
          />
        </label>
      )}
    </section>
  );
}
