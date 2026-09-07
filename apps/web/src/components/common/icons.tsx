import type { SVGProps } from 'react';

/**
 * Port ikon z prototypu (`prototype/js/app.js`, obiekt `ICONS`) — te same
 * `viewBox`/`stroke-width`, żeby sidebar/topbar wyglądały identycznie jak
 * HTML. Trzy dodatkowe ikony (`settings`/`auditLog`/`reports`) nie istniały
 * w tym zrzucie prototypu (`NAV_ITEMS` miało tam tylko 4 pozycje) — dodane
 * w tym samym stylu wizualnym (18×18, stroke-width 1.8) dla modułów, które
 * realny backend już ma (`settings.view`/`auditlog.view`/`reports.view`).
 */
type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function DashboardIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

export function CasesIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z" />
    </svg>
  );
}

export function ManufacturersIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 21V10l6 4v-4l6 4V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v15" />
      <path d="M3 21h18" />
    </svg>
  );
}

/** Etap 4 (Produkty i konfiguracja formularza) — sekcja "Produkty" w panelu, brak odpowiednika w prototypie (nowy moduł). */
export function ProductsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3Z" />
      <path d="M3 7.5 12 12l9-4.5" />
      <path d="M12 12v9" />
    </svg>
  );
}

/** Etap 5 (Partnerzy B2B) — sekcja "Partnerzy" w panelu, brak odpowiednika w prototypie (nowy moduł). Dwa połączone ogniwa — relacja Sklep ↔ Dystrybutor/Producent, nie pojedyncza firma (stąd nie reużyto `ManufacturersIcon`). */
export function PartnersIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="7" width="8" height="8" rx="2" />
      <rect x="13.5" y="9" width="8" height="8" rx="2" />
      <path d="M10.5 11h3" />
    </svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M16.5 4.6a3.2 3.2 0 0 1 0 6.2" />
      <path d="M20 20c0-2.9-1.7-5-4-5.7" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

export function AuditLogIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 2h6a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}

export function ReportsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 21h18" />
      <rect x="5" y="13" width="3.2" height="5" rx="0.7" />
      <rect x="10.4" y="8" width="3.2" height="10" rx="0.7" />
      <rect x="15.8" y="4" width="3.2" height="14" rx="0.7" />
    </svg>
  );
}

/** `ICONS.clock` z prototypu — używana w pustych stanach Dashboardu. */
export function ClockIcon(props: IconProps) {
  return (
    <svg {...base} width={14} height={14} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...base} width={14} height={14} strokeWidth={2} {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function XIcon(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2} {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/** Audyt responsywności (K1) — przełącznik mobilnego menu w `AppLayout`. */
export function MenuIcon(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2} {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a16.9 16.9 0 0 1-3.6 4.6M6.5 6.6C3.8 8.3 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 4.6-1.1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2} {...props}>
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <svg {...base} width={15} height={15} {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 16V4M12 4 7 9M12 4l5 5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

/**
 * Ikony typów plików — port `DOC_TYPE_ICON` z prototypu (`js/app.js`).
 * Prototyp pokazywał kształt pliku/obrazka/wideo, nie tekst „PDF"/„JPG",
 * więc `.doc-icon` w liście dokumentów renderuje SVG, nie skrót formatu.
 */
export function FileDocIcon(props: IconProps) {
  return (
    <svg {...base} width={17} height={17} {...props}>
      <path d="M14 3v5a1 1 0 0 0 1 1h5" />
      <path d="M6 3h8l6 6v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

export function FileImageIcon(props: IconProps) {
  return (
    <svg {...base} width={17} height={17} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

export function FileVideoIcon(props: IconProps) {
  return (
    <svg {...base} width={17} height={17} {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m10 9 5 3-5 3Z" />
    </svg>
  );
}
