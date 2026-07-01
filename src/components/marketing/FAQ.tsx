const faqs = [
  {
    q: "Мне нужно уметь программировать?",
    a: "Нет. Вы описываете бота обычными словами, а ИИ пишет код. Но если вы разработчик — код открыт, его можно править прямо в редакторе.",
  },
  {
    q: "Код действительно мой?",
    a: "Да. Botforge генерирует стандартный проект (Python/Node) без скрытых зависимостей. Скачивайте ZIP и разворачивайте где угодно.",
  },
  {
    q: "Какие платформы поддерживаются?",
    a: "Telegram и Discord на старте. Архитектура рассчитана на добавление новых платформ без переписывания проектов.",
  },
  {
    q: "Что если бот сломается?",
    a: "Встроенное авто-исправление читает логи, находит причину и предлагает исправленный код. Обычно — в один клик.",
  },
  {
    q: "Можно отменить подписку?",
    a: "В любой момент из личного кабинета. Доступ сохраняется до конца оплаченного периода.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="py-24">
      <div className="container-x grid gap-12 md:grid-cols-[1fr_1.4fr]">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-accent">Вопросы</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Частые вопросы</h2>
          <p className="mt-4 text-sm text-muted-foreground">
            Не нашли ответ? Напишите нам — ответим в течение дня.
          </p>
        </div>

        <div className="divide-y divide-border border-t border-border">
          {faqs.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
                {f.q}
                <span className="ml-4 text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
