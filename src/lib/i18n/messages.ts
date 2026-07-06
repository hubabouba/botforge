/**
 * i18n dictionaries. The site auto-detects the browser language and falls back
 * to English for anything missing. Built in slices — start with the navbar +
 * hero; more sections get keys over time.
 *
 * NOTE: en/ru/pl are human-quality; es/de/fr are a solid first pass to review.
 */

export type Locale = "en" | "ru" | "pl" | "es" | "de" | "fr";

export const LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "ru", label: "Русский", flag: "🇷🇺" },
  { code: "pl", label: "Polski", flag: "🇵🇱" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
];

type Dict = Record<string, string>;

const en: Dict = {
  "nav.features": "Features",
  "nav.how": "How it works",
  "nav.pricing": "Pricing",
  "nav.faq": "FAQ",
  "nav.login": "Log in",
  "nav.getStarted": "Get started",
  "nav.dashboard": "Dashboard",
  "nav.goToDashboard": "Go to dashboard",
  "hero.badge": "From idea to a working bot in minutes",
  "hero.titleBefore": "Bots written by",
  "hero.titleAI": "AI",
  "hero.title2": "Code that belongs to you.",
  "hero.subtitle":
    "Describe a bot in plain words — Botforge writes real code for Telegram and Discord. Edit it in your browser, run it in one click, and download the source.",
  "hero.ctaBuild": "Build a bot for free",
  "hero.ctaOpenDashboard": "Open your dashboard",
  "hero.ctaHow": "See how it works",
  "hero.freeNote": "No credit card · 3 projects free",
  "hero.welcomeBack": "Welcome back — pick up where you left off",
};

const ru: Dict = {
  "nav.features": "Возможности",
  "nav.how": "Как это работает",
  "nav.pricing": "Цены",
  "nav.faq": "Вопросы",
  "nav.login": "Войти",
  "nav.getStarted": "Начать",
  "nav.dashboard": "Кабинет",
  "nav.goToDashboard": "В кабинет",
  "hero.badge": "От идеи до рабочего бота за минуты",
  "hero.titleBefore": "Ботов пишет",
  "hero.titleAI": "ИИ",
  "hero.title2": "Код принадлежит тебе.",
  "hero.subtitle":
    "Опиши бота обычными словами — Botforge напишет настоящий код для Telegram и Discord. Редактируй в браузере, запускай в один клик и скачивай исходники.",
  "hero.ctaBuild": "Создать бота бесплатно",
  "hero.ctaOpenDashboard": "Открыть кабинет",
  "hero.ctaHow": "Как это работает",
  "hero.freeNote": "Без карты · 3 проекта бесплатно",
  "hero.welcomeBack": "С возвращением — продолжай с того же места",
};

const pl: Dict = {
  "nav.features": "Funkcje",
  "nav.how": "Jak to działa",
  "nav.pricing": "Cennik",
  "nav.faq": "FAQ",
  "nav.login": "Zaloguj się",
  "nav.getStarted": "Zacznij",
  "nav.dashboard": "Panel",
  "nav.goToDashboard": "Przejdź do panelu",
  "hero.badge": "Od pomysłu do działającego bota w kilka minut",
  "hero.titleBefore": "Boty pisane przez",
  "hero.titleAI": "AI",
  "hero.title2": "Kod należy do Ciebie.",
  "hero.subtitle":
    "Opisz bota zwykłymi słowami — Botforge napisze prawdziwy kod dla Telegrama i Discorda. Edytuj w przeglądarce, uruchom jednym kliknięciem i pobierz źródło.",
  "hero.ctaBuild": "Zbuduj bota za darmo",
  "hero.ctaOpenDashboard": "Otwórz panel",
  "hero.ctaHow": "Zobacz, jak to działa",
  "hero.freeNote": "Bez karty · 3 projekty za darmo",
  "hero.welcomeBack": "Witaj z powrotem — kontynuuj tam, gdzie skończyłeś",
};

const es: Dict = {
  "nav.features": "Funciones",
  "nav.how": "Cómo funciona",
  "nav.pricing": "Precios",
  "nav.faq": "FAQ",
  "nav.login": "Iniciar sesión",
  "nav.getStarted": "Empezar",
  "nav.dashboard": "Panel",
  "nav.goToDashboard": "Ir al panel",
  "hero.badge": "De la idea a un bot funcional en minutos",
  "hero.titleBefore": "Bots escritos por",
  "hero.titleAI": "IA",
  "hero.title2": "Código que te pertenece.",
  "hero.subtitle":
    "Describe un bot con palabras normales: Botforge escribe código real para Telegram y Discord. Edítalo en tu navegador, ejecútalo con un clic y descarga el código.",
  "hero.ctaBuild": "Crea un bot gratis",
  "hero.ctaOpenDashboard": "Abrir tu panel",
  "hero.ctaHow": "Ver cómo funciona",
  "hero.freeNote": "Sin tarjeta · 3 proyectos gratis",
  "hero.welcomeBack": "Bienvenido de nuevo: continúa donde lo dejaste",
};

const de: Dict = {
  "nav.features": "Funktionen",
  "nav.how": "So funktioniert's",
  "nav.pricing": "Preise",
  "nav.faq": "FAQ",
  "nav.login": "Anmelden",
  "nav.getStarted": "Loslegen",
  "nav.dashboard": "Dashboard",
  "nav.goToDashboard": "Zum Dashboard",
  "hero.badge": "Von der Idee zum fertigen Bot in Minuten",
  "hero.titleBefore": "Bots geschrieben von",
  "hero.titleAI": "KI",
  "hero.title2": "Code, der dir gehört.",
  "hero.subtitle":
    "Beschreibe einen Bot in einfachen Worten — Botforge schreibt echten Code für Telegram und Discord. Bearbeite ihn im Browser, starte ihn mit einem Klick und lade den Quellcode herunter.",
  "hero.ctaBuild": "Kostenlos einen Bot bauen",
  "hero.ctaOpenDashboard": "Dashboard öffnen",
  "hero.ctaHow": "So funktioniert's",
  "hero.freeNote": "Keine Kreditkarte · 3 Projekte gratis",
  "hero.welcomeBack": "Willkommen zurück — mach weiter, wo du aufgehört hast",
};

const fr: Dict = {
  "nav.features": "Fonctionnalités",
  "nav.how": "Comment ça marche",
  "nav.pricing": "Tarifs",
  "nav.faq": "FAQ",
  "nav.login": "Se connecter",
  "nav.getStarted": "Commencer",
  "nav.dashboard": "Tableau de bord",
  "nav.goToDashboard": "Aller au tableau de bord",
  "hero.badge": "De l'idée à un bot fonctionnel en quelques minutes",
  "hero.titleBefore": "Des bots écrits par",
  "hero.titleAI": "l'IA",
  "hero.title2": "Un code qui vous appartient.",
  "hero.subtitle":
    "Décrivez un bot en mots simples — Botforge écrit du vrai code pour Telegram et Discord. Modifiez-le dans votre navigateur, lancez-le en un clic et téléchargez le source.",
  "hero.ctaBuild": "Créer un bot gratuitement",
  "hero.ctaOpenDashboard": "Ouvrir le tableau de bord",
  "hero.ctaHow": "Voir comment ça marche",
  "hero.freeNote": "Sans carte · 3 projets gratuits",
  "hero.welcomeBack": "Bon retour — reprenez où vous en étiez",
};

export const messages: Record<Locale, Dict> = { en, ru, pl, es, de, fr };
