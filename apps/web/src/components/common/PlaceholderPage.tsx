interface PlaceholderPageProps {
  title: string;
  prototypeRef: string;
}

/** Zawartość biznesowa świadomie poza zakresem tego kroku ("Bez implementacji ekranów biznesowych") — `prototypeRef` wskazuje odpowiednik 1:1 w `prototype/`, do przeniesienia w kolejnym kroku (DECISIONS.md: "Klikalny prototyp UX"). */
export function PlaceholderPage({ title, prototypeRef }: PlaceholderPageProps) {
  return (
    <div>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-gray-500">
        Ekran do zaimplementowania — odpowiednik <code className="rounded bg-gray-100 px-1">{prototypeRef}</code> w
        prototypie.
      </p>
    </div>
  );
}
