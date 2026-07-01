"use client";

import { NODE_CATALOG, type BotNode, type ButtonDef } from "@/lib/schema/types";

interface Props {
  node: BotNode | null;
  allNodes: BotNode[];
  onChange: (node: BotNode) => void;
  onDelete: (id: string) => void;
}

const inputCls =
  "w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm outline-none focus:border-brand";
const labelCls = "mb-1 block text-xs font-medium text-neutral-400";

export default function PropertiesPanel({ node, allNodes, onChange, onDelete }: Props) {
  if (!node) {
    return (
      <aside className="w-72 shrink-0 border-l border-neutral-800 p-4 text-sm text-neutral-500">
        Выберите блок на холсте, чтобы настроить его.
      </aside>
    );
  }

  const meta = NODE_CATALOG[node.type];
  // Other nodes usable as branch/button targets.
  const targets = allNodes.filter((n) => n.id !== node.id);

  const set = (patch: Partial<BotNode>) => onChange({ ...node, ...patch } as BotNode);

  return (
    <aside className="w-72 shrink-0 space-y-3 overflow-y-auto border-l border-neutral-800 p-4">
      <div className="flex items-center justify-between">
        <span className="font-semibold" style={{ color: meta.color }}>
          {meta.label}
        </span>
        <button
          onClick={() => onDelete(node.id)}
          className="text-xs text-red-400 hover:underline"
        >
          Удалить
        </button>
      </div>
      <p className="text-xs text-neutral-500">{meta.description}</p>

      {node.type === "trigger" && (
        <>
          <div>
            <label className={labelCls}>Тип триггера</label>
            <select className={inputCls} value={node.trigger} onChange={(e) => set({ trigger: e.target.value as typeof node.trigger })}>
              <option value="command">Команда</option>
              <option value="keyword">Ключевое слово</option>
              <option value="message">Любое сообщение</option>
            </select>
          </div>
          {node.trigger !== "message" && (
            <div>
              <label className={labelCls}>{node.trigger === "command" ? "Команда (без /)" : "Ключевое слово"}</label>
              <input className={inputCls} value={node.value} onChange={(e) => set({ value: e.target.value })} />
            </div>
          )}
        </>
      )}

      {node.type === "message" && (
        <div>
          <label className={labelCls}>Текст (плейсхолдеры: {"{user.name}"}, {"{vars.x}"})</label>
          <textarea className={inputCls} rows={4} value={node.text} onChange={(e) => set({ text: e.target.value })} />
        </div>
      )}

      {node.type === "buttons" && (
        <ButtonsEditor node={node} targets={targets} onChange={set} />
      )}

      {node.type === "condition" && (
        <>
          <div>
            <label className={labelCls}>Источник</label>
            <select className={inputCls} value={node.source} onChange={(e) => set({ source: e.target.value as typeof node.source })}>
              <option value="message">Текст сообщения</option>
              <option value="variable">Переменная</option>
            </select>
          </div>
          {node.source === "variable" && (
            <div>
              <label className={labelCls}>Имя переменной</label>
              <input className={inputCls} value={node.variable ?? ""} onChange={(e) => set({ variable: e.target.value })} />
            </div>
          )}
          <div>
            <label className={labelCls}>Оператор</label>
            <select className={inputCls} value={node.operator} onChange={(e) => set({ operator: e.target.value as typeof node.operator })}>
              <option value="contains">содержит</option>
              <option value="equals">равно</option>
              <option value="startsWith">начинается с</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Значение</label>
            <input className={inputCls} value={node.value} onChange={(e) => set({ value: e.target.value })} />
          </div>
          <TargetSelect label="Если ДА → блок" value={node.onTrue} targets={targets} onChange={(v) => set({ onTrue: v })} />
          <TargetSelect label="Если НЕТ → блок" value={node.onFalse} targets={targets} onChange={(v) => set({ onFalse: v })} />
        </>
      )}

      {node.type === "ai_reply" && (
        <div>
          <label className={labelCls}>Системный промпт для ИИ</label>
          <textarea className={inputCls} rows={5} value={node.systemPrompt} onChange={(e) => set({ systemPrompt: e.target.value })} />
        </div>
      )}

      {node.type === "set_variable" && (
        <>
          <div>
            <label className={labelCls}>Имя переменной</label>
            <input className={inputCls} value={node.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Значение</label>
            <input className={inputCls} value={node.value} onChange={(e) => set({ value: e.target.value })} />
          </div>
        </>
      )}
    </aside>
  );
}

function TargetSelect({
  label,
  value,
  targets,
  onChange,
}: {
  label: string;
  value?: string;
  targets: BotNode[];
  onChange: (v: string | undefined) => void;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <select className={inputCls} value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">— не задано —</option>
        {targets.map((t) => (
          <option key={t.id} value={t.id}>
            {NODE_CATALOG[t.type].label} · {t.id.slice(-4)}
          </option>
        ))}
      </select>
    </div>
  );
}

function ButtonsEditor({
  node,
  targets,
  onChange,
}: {
  node: Extract<BotNode, { type: "buttons" }>;
  targets: BotNode[];
  onChange: (patch: Partial<BotNode>) => void;
}) {
  const update = (i: number, patch: Partial<ButtonDef>) => {
    const buttons = node.buttons.map((b, idx) => (idx === i ? { ...b, ...patch } : b));
    onChange({ buttons });
  };
  return (
    <>
      <div>
        <label className={labelCls}>Текст над кнопками</label>
        <input className={inputCls} value={node.text} onChange={(e) => onChange({ text: e.target.value })} />
      </div>
      <label className={labelCls}>Кнопки</label>
      <div className="space-y-2">
        {node.buttons.map((b, i) => (
          <div key={i} className="space-y-1 rounded-md border border-neutral-800 p-2">
            <input
              className={inputCls}
              placeholder="Текст кнопки"
              value={b.label}
              onChange={(e) => update(i, { label: e.target.value })}
            />
            <select className={inputCls} value={b.next ?? ""} onChange={(e) => update(i, { next: e.target.value || undefined })}>
              <option value="">→ блок не выбран</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {NODE_CATALOG[t.type].label} · {t.id.slice(-4)}
                </option>
              ))}
            </select>
            <button
              className="text-xs text-red-400 hover:underline"
              onClick={() => onChange({ buttons: node.buttons.filter((_, idx) => idx !== i) })}
            >
              Убрать кнопку
            </button>
          </div>
        ))}
      </div>
      <button
        className="w-full rounded-md border border-neutral-700 py-1.5 text-xs hover:bg-neutral-800"
        onClick={() => onChange({ buttons: [...node.buttons, { label: "Кнопка" }] })}
      >
        + Добавить кнопку
      </button>
    </>
  );
}
