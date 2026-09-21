import { Fragment, type SVGProps } from 'react';
import { Link } from 'react-router-dom';
import {
  CasesIcon,
  ClockIcon,
  FileDocIcon,
  ManufacturersIcon,
  ProductsIcon,
  ReportsIcon,
  UsersIcon,
} from '@/components/common/icons';
import '@/styles/landing.css';

/**
 * `/` dla niezalogowanego odwiedzającego (patrz `ProtectedRoute.tsx`) —
 * publiczny landing, zaakceptowany projekt graficzny. Wyłącznie statyczna
 * treść marketingowa: żadnych zapytań API, żadnych danych z backendu, więc
 * zero ryzyka dla reszty aplikacji poza samym routingiem `/`.
 *
 * Mockup dashboardu w hero jest CELOWO zbudowany jako osobna, dekoracyjna
 * struktura (nowe klasy `landing-mockup-*` w `landing.css`), nie dosłowne
 * powtórzenie `.sidebar`/`.app-shell` z `AppLayout` — te klasy zakładają
 * `position: sticky`/`height: 100vh` (prawdziwy layout aplikacji), co w
 * małym, dekoracyjnym kontenerze łamałoby stronę. Zamiast tego mockup używa
 * DOKŁADNIE tych samych tokenów kolorów (`var(--text)` jako ciemny pasek,
 * `var(--primary)` jako akcent, `var(--surface)`/`var(--border)` jako karty)
 * — wizualnie tożsame, strukturalnie bezpieczne. `aria-hidden` — czysto
 * dekoracyjny, nie niesie żadnej informacji nieobecnej w tekście obok.
 */
export function LandingPage() {
  return (
    <div className="landing-page">
      <LandingHeader />
      <LandingHero />
      <CategoriesSection />
      <ProcessSection />
      <FeaturesSection />
      <ForBusinessSection />
      <PricingSection />
      <FinalCtaAndFooter />
    </div>
  );
}

/**
 * `.sidebar-brand-mark`/`.sidebar-brand-text` (design-system.css) — bez
 * jawnego `color`, celowo: `--sidebar-text` istnieje tylko w zakresie
 * `.sidebar`, więc poza nim `color: var(--sidebar-text)` jest nieprawidłowe i
 * dziedziczy kolor rodzica — dokładnie to, czego tu trzeba (ciemny tekst w
 * jasnym headerze, jasny w ciemnej stopce/`.landing-dark`), bez dwóch
 * wariantów tego komponentu.
 */
function BrandMark() {
  return (
    <>
      <div className="sidebar-brand-mark">R</div>
      <div className="sidebar-brand-text">
        Smart<span>RMA</span>
      </div>
    </>
  );
}

function LandingHeader() {
  return (
    <header className="landing-header">
      <div className="landing-header-inner">
        <Link to="/" className="landing-logo" aria-label="SmartRMA — strona główna">
          <BrandMark />
        </Link>
        <nav className="landing-nav" aria-label="Sekcje strony">
          <a className="landing-nav-link" href="#funkcje">
            Funkcje
          </a>
          <a className="landing-nav-link" href="#dla-kogo">
            Dla kogo
          </a>
          <a className="landing-nav-link" href="#cennik">
            Cennik
          </a>
          <a className="landing-nav-link" href="#kontakt">
            Kontakt
          </a>
        </nav>
        <div className="landing-header-actions">
          <Link to="/login" className="btn btn-secondary btn-sm">
            Zaloguj się
          </Link>
          <Link to="/signup" className="btn btn-primary btn-sm">
            Załóż konto
          </Link>
        </div>
      </div>
    </header>
  );
}

function LandingHero() {
  return (
    <section className="landing-hero">
      <div className="landing-hero-inner">
        <div>
          <span className="landing-badge">Proste procesy. Lepsza obsługa.</span>
          <h1>Reklamacje pod kontrolą.</h1>
          <p className="landing-hero-text">
            SmartRMA porządkuje obsługę reklamacji, zwrotów i zgłoszeń serwisowych w jednym miejscu.
            Oszczędzaj czas, redukuj koszty i zapewnij lepszą obsługę swoim klientom.
          </p>
          <div className="landing-hero-actions">
            <Link to="/signup" className="btn btn-primary">
              Załóż konto
              <ArrowRightIcon />
            </Link>
            <Link to="/login" className="btn btn-secondary">
              Zaloguj się
            </Link>
          </div>
          <div className="landing-hero-benefits">
            <span className="landing-benefit-item">
              <CheckIcon className="landing-check" />
              Szybkie wdrożenie
            </span>
            <span className="landing-benefit-item">
              <CheckIcon className="landing-check" />
              Bez zobowiązań
            </span>
            <span className="landing-benefit-item">
              <CheckIcon className="landing-check" />
              Dla firm każdej wielkości
            </span>
          </div>
        </div>
        <DashboardMockup />
      </div>
    </section>
  );
}

const MOCKUP_NAV_ITEMS = [
  'Dashboard',
  'Reklamacje',
  'Producenci',
  'Produkty',
  'Partnerzy B2B',
  'Użytkownicy',
  'Ustawienia',
  'Raporty',
];

const MOCKUP_STATS = [
  { label: 'Sprawy otwarte', value: 0 },
  { label: 'Przeterminowane', value: 0 },
  { label: 'Zadania na dziś', value: 0 },
  { label: 'Gotowe do odbioru', value: 0 },
];

function DashboardMockup() {
  return (
    <div className="landing-mockup" aria-hidden="true">
      <div className="landing-mockup-sidebar">
        <div className="landing-mockup-brand">
          <div className="landing-mockup-brand-mark" />
          <div className="landing-mockup-brand-text">
            Smart<span style={{ color: '#14A093' }}>RMA</span>
          </div>
        </div>
        {MOCKUP_NAV_ITEMS.map((item, i) => (
          <div key={item} className={`landing-mockup-nav-item ${i === 0 ? 'active' : ''}`}>
            {item}
          </div>
        ))}
      </div>
      <div className="landing-mockup-main">
        <div className="landing-mockup-topbar">
          <div className="landing-mockup-search" />
          <div className="landing-mockup-user">
            <div className="landing-mockup-user-text">
              <div className="landing-mockup-user-name">Anna Kowalska</div>
              <div className="landing-mockup-user-role">Administrator</div>
            </div>
            <div className="landing-mockup-avatar">A</div>
          </div>
        </div>
        <div className="landing-mockup-heading">Witaj!</div>
        <div className="landing-mockup-subheading">
          Masz 0 otwartych spraw, w tym 0 przeterminowanych.
        </div>
        <div className="landing-mockup-stats">
          {MOCKUP_STATS.map((stat) => (
            <div key={stat.label} className="landing-mockup-stat">
              <div className="landing-mockup-stat-label">{stat.label}</div>
              <div className="landing-mockup-stat-value">{stat.value}</div>
            </div>
          ))}
        </div>
        <div className="landing-mockup-panels">
          <div className="landing-mockup-panel">
            <div className="landing-mockup-panel-title">Sprawy wymagające uwagi</div>
            <div className="landing-mockup-panel-empty">Świetna robota! Nic tu nie ma.</div>
          </div>
          <div className="landing-mockup-panel">
            <div className="landing-mockup-panel-title">Zadania na dziś</div>
            <div className="landing-mockup-panel-empty">Na dziś nie masz żadnych zadań.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const CATEGORIES = [
  { icon: CasesIcon, title: 'Reklamacje', text: 'Pełna obsługa procesu' },
  { icon: ProductsIcon, title: 'Zwroty', text: 'Szybka realizacja' },
  { icon: ReportsIcon, title: 'Serwis', text: 'Zgłoszenia serwisowe' },
  { icon: UsersIcon, title: 'Producenci', text: 'Współpraca i komunikacja' },
  { icon: FileDocIcon, title: 'Dokumentacja', text: 'Wszystko w jednym miejscu' },
];

function CategoriesSection() {
  return (
    <section className="landing-section">
      <div className="landing-container">
        <div className="landing-categories">
          {CATEGORIES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="landing-category-card">
              <div className="landing-icon-badge">
                <Icon />
              </div>
              <h4>{title}</h4>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const PROCESS_STEPS = [
  { icon: FileDocIcon, title: 'Zgłoszenie', text: 'Szybkie dodanie reklamacji' },
  { icon: SearchProcessIcon, title: 'Weryfikacja', text: 'Sprawdzenie danych i dokumentacji' },
  { icon: ManufacturersIcon, title: 'Producent', text: 'Kontakt i obsługa z producentem' },
  { icon: CheckCircleIcon, title: 'Decyzja', text: 'Akceptacja, naprawa lub wymiana' },
  { icon: TruckIcon, title: 'Realizacja', text: 'Wysyłka i zwrot do klienta' },
  { icon: FlagIcon, title: 'Zamknięcie', text: 'Pełna historia sprawy' },
];

function ProcessSection() {
  return (
    <section className="landing-section landing-section-alt">
      <div className="landing-container">
        <div className="landing-eyebrow">Cały proces w jednym miejscu</div>
        <h2 className="landing-section-title">Od zgłoszenia do zamknięcia</h2>
        <p className="landing-section-text">
          SmartRMA prowadzi Cię przez każdy etap obsługi reklamacji.
        </p>
        <div className="landing-process-row">
          {PROCESS_STEPS.map(({ icon: Icon, title, text }, i) => (
            <Fragment key={title}>
              <div className="landing-process-step">
                <div className="landing-icon-badge">
                  <Icon />
                </div>
                <h4>{title}</h4>
                <p>{text}</p>
              </div>
              {i < PROCESS_STEPS.length - 1 && (
                <div className="landing-process-arrow">
                  <ArrowRightIcon />
                </div>
              )}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: FileDocIcon,
    title: 'Obsługa reklamacji',
    text: 'Pełna kontrola nad każdym zgłoszeniem od początku do końca.',
  },
  {
    icon: ZapIcon,
    title: 'Automatyczne statusy',
    text: 'Mniej ręcznej pracy, więcej czasu na to, co ważne.',
  },
  { icon: ClockIcon, title: 'Terminy i przypomnienia', text: 'Zawsze wiesz, co wymaga reakcji.' },
  {
    icon: CasesIcon,
    title: 'Dokumentacja spraw',
    text: 'Wszystkie pliki, maile i notatki w jednym miejscu.',
  },
  {
    icon: UsersIcon,
    title: 'Współpraca z producentami',
    text: 'Łatwy kontakt, jasne procedury, szybsze decyzje.',
  },
  {
    icon: ReportsIcon,
    title: 'Statystyki i raporty',
    text: 'Pełny wgląd w proces i wyniki Twojej firmy.',
  },
];

function FeaturesSection() {
  return (
    <section className="landing-section" id="funkcje">
      <div className="landing-container">
        <div className="landing-eyebrow">Funkcje, które ułatwiają pracę</div>
        <h2 className="landing-section-title" style={{ marginBottom: 32 }}>
          Więcej niż tylko reklamacje
        </h2>
        <div className="landing-features-grid">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="landing-feature-card">
              <div className="landing-icon-badge">
                <Icon />
              </div>
              <h4>{title}</h4>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ForBusinessSection() {
  return (
    <section className="landing-section landing-section-alt" id="dla-kogo">
      <div className="landing-container">
        <div className="landing-split">
          <div className="landing-split-text">
            <div className="landing-eyebrow">Dla sklepów, dystrybutorów i producentów</div>
            <h2 className="landing-section-title">
              Jedna reklamacja. Pełna historia. Zero szukania w mailach.
            </h2>
            <p className="landing-section-text">
              SmartRMA to narzędzie stworzone z myślą o firmach, które chcą profesjonalnie i
              efektywnie obsługiwać reklamacje, zwroty i zgłoszenia serwisowe.
            </p>
            <Link to="/signup" className="btn btn-primary">
              Załóż konto
              <ArrowRightIcon />
            </Link>
          </div>
          <div className="landing-benefit-card">
            <span className="landing-benefit-item">
              <CheckIcon className="landing-check" />
              Lepsza obsługa klientów
            </span>
            <span className="landing-benefit-item">
              <CheckIcon className="landing-check" />
              Niższe koszty operacyjne
            </span>
            <span className="landing-benefit-item">
              <CheckIcon className="landing-check" />
              Większa kontrola nad procesem
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section className="landing-section" id="cennik">
      <div className="landing-container">
        <div className="landing-pricing-card">
          <h3>Cennik — wkrótce</h3>
          <p>Pracujemy nad ofertą cenową dopasowaną do firm każdej wielkości. Wróć tu niedługo.</p>
        </div>
      </div>
    </section>
  );
}

function FinalCtaAndFooter() {
  return (
    <div className="landing-dark">
      <div className="landing-container landing-final-cta">
        <div>
          <h3>Gotowy uporządkować obsługę reklamacji w swojej firmie?</h3>
          <p>Dołącz do firm, które już korzystają ze SmartRMA i pracują efektywniej.</p>
        </div>
        <div className="landing-final-cta-actions">
          <Link to="/signup" className="btn btn-primary">
            Rozpocznij za darmo
            <ArrowRightIcon />
          </Link>
          <span className="landing-final-cta-hint">Bez zobowiązań. Szybka rejestracja.</span>
        </div>
      </div>

      <footer className="landing-container landing-footer" id="kontakt">
        <div className="landing-footer-brand">
          <BrandMark />
        </div>
        <nav className="landing-footer-links" aria-label="Stopka">
          <a className="landing-footer-link" href="#funkcje">
            Funkcje
          </a>
          <a className="landing-footer-link" href="#dla-kogo">
            Dla kogo
          </a>
          <a className="landing-footer-link" href="#cennik">
            Cennik
          </a>
          <a className="landing-footer-link" href="#kontakt">
            Kontakt
          </a>
          {/* Brak jeszcze dedykowanych stron — świadomie nieklikalne, żeby nie
              obiecywać treści, której SmartRMA jeszcze nie ma (patrz raport). */}
          <span className="landing-footer-link-disabled">Polityka prywatności</span>
          <span className="landing-footer-link-disabled">Regulamin</span>
        </nav>
        <span className="landing-final-cta-hint">© 2026 SmartRMA. Wszelkie prawa zastrzeżone.</span>
      </footer>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Ikony lokalne dla landing page — świadomie NIE dopisane do
   `components/common/icons.tsx` (współdzielony plik używany przez cały
   panel), żeby zmiana tej strony nigdy nie mogła wpłynąć na inne ekrany.
   Ten sam styl (18×18, stroke 1.8, currentColor) co reszta ikon aplikacji.
   ------------------------------------------------------------------------ */

type IconProps = SVGProps<SVGSVGElement>;

const iconBase = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...iconBase} width={15} height={15} strokeWidth={2} {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function CheckIcon(props: IconProps) {
  return (
    <svg {...iconBase} width={15} height={15} strokeWidth={2.2} {...props}>
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

function ZapIcon(props: IconProps) {
  return (
    <svg {...iconBase} {...props}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </svg>
  );
}

function SearchProcessIcon(props: IconProps) {
  return (
    <svg {...iconBase} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function CheckCircleIcon(props: IconProps) {
  return (
    <svg {...iconBase} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </svg>
  );
}

function TruckIcon(props: IconProps) {
  return (
    <svg {...iconBase} {...props}>
      <path d="M3 7h11v9H3z" />
      <path d="M14 11h4l3 3v2h-7z" />
      <circle cx="7" cy="18" r="1.6" />
      <circle cx="17.5" cy="18" r="1.6" />
    </svg>
  );
}

function FlagIcon(props: IconProps) {
  return (
    <svg {...iconBase} {...props}>
      <path d="M5 3v18" />
      <path d="M5 4h11l-2.5 4L16 12H5" />
    </svg>
  );
}
