

import { useState } from "react";
import { TestType } from "../types";

export function SelectType({ onBack, onNext }: { onBack: () => void; onNext: (type: TestType) => void }) {
  const [selected, setSelected] = useState<TestType | null>(null);

  return (
    <section className="card selector" style={{ marginTop: 0 }}>
      <h2 className="selector-title">Выберите вид теста</h2>
      <div className="radio-list">
        <label className="radio-item">
          <input
            type="radio"
            name="type"
            checked={selected === "cards"}
            onChange={() => setSelected("cards")}
          />
          <span>Выбери одну карту</span>
        </label>
        <label className="radio-item">
          <input
            type="radio"
            name="type"
            checked={selected === "single"}
            onChange={() => setSelected("single")}
          />
          <span>Один вопрос</span>
        </label>
        <label className="radio-item">
          <input
            type="radio"
            name="type"
            checked={selected === "multi"}
            onChange={() => setSelected("multi")}
          />
          <span>Несколько вопросов</span>
        </label>
      </div>
      <div className="actions bottom">
        <button className="secondary" type="button" onClick={onBack}>Назад</button>
        <button
          type="button"
          disabled={!selected}
          onClick={() => {
            if (selected) {
              try { window.location.assign(`#/editor?type=${selected}`); } catch { window.location.hash = `#/editor?type=${selected}`; }
              onNext(selected);
            }
          }}
        >
          Далее
        </button>
      </div>
    </section>
  );
}