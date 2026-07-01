const steps = [
  {
    n: "01",
    title: "Опишите бота словами",
    body: "«Бот, который присылает цену BTC каждое утро и по команде /price». Никаких блок-схем и документации.",
  },
  {
    n: "02",
    title: "ИИ пишет код и правит ошибки",
    body: "Botforge генерирует полноценный проект по файлам, объясняет решения и сам чинит сбои по логам.",
  },
  {
    n: "03",
    title: "Запустите или скачайте",
    body: "Проверьте бота в песочнице прямо в браузере или заберите исходники в ZIP и разверните где угодно.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="border-t border-border bg-muted/40 py-24">
      <div className="container-x">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-widest text-accent">Как это работает</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Три шага от идеи до живого бота
          </h2>
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="relative">
              <div className="font-mono text-sm text-muted-foreground">{s.n}</div>
              <div className="mt-3 h-px w-full bg-border" />
              <h3 className="mt-5 text-lg font-medium">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
