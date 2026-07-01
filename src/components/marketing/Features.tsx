import type { ReactNode } from "react";

function Icon({ path }: { path: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      {path}
    </svg>
  );
}

const features = [
  {
    title: "Настоящий код, а не чёрный ящик",
    body: "Вы видите каждый файл и владеете исходниками. Никакого vendor lock-in.",
    icon: <Icon path={<><path d="m8 6-6 6 6 6" /><path d="m16 6 6 6-6 6" /></>} />,
  },
  {
    title: "Telegram и Discord",
    body: "Одно описание — бот под нужную платформу с идиоматичным кодом.",
    icon: <Icon path={<><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>} />,
  },
  {
    title: "Авто-исправление ошибок",
    body: "Бот упал? ИИ читает логи, находит причину и присылает исправленный код.",
    icon: <Icon path={<><path d="M12 3v3" /><path d="M18.4 6.6 16 9" /><circle cx="12" cy="14" r="6" /><path d="M12 11v3l2 1" /></>} />,
  },
  {
    title: "Запуск в песочнице",
    body: "Проверяйте поведение бота прямо в браузере, не настраивая сервер.",
    icon: <Icon path={<><path d="m5 3 14 9-14 9V3Z" /></>} />,
  },
  {
    title: "Скачать исходники",
    body: "Заберите готовый проект в ZIP и разверните на любом хостинге.",
    icon: <Icon path={<><path d="M12 3v12" /><path d="m7 12 5 5 5-5" /><path d="M5 21h14" /></>} />,
  },
  {
    title: "Логи и аналитика",
    body: "Живые логи выполнения и метрики использования — на отдельных вкладках.",
    icon: <Icon path={<><path d="M3 3v18h18" /><path d="m7 15 3-4 3 3 4-6" /></>} />,
  },
];

export function Features() {
  return (
    <section id="features" className="py-24">
      <div className="container-x">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-widest text-accent">Возможности</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Лаборатория, а не генератор-однодневка
          </h2>
          <p className="mt-4 text-muted-foreground">
            Всё, что нужно, чтобы довести бота от идеи до продакшена — в одном окне.
          </p>
        </div>

        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="bg-background p-6 transition-colors hover:bg-muted/50">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
                {f.icon}
              </div>
              <h3 className="mt-4 font-medium">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
