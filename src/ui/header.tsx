import { useMatches } from "@tanstack/react-router";

interface RouteContext {
  headerTitle?: string;
  headerDescription?: string;
}

export function Header() {
  const matches = useMatches();

  // Get the context from the last match that has header info
  const routeContext = matches
    .map((match) => match.context as RouteContext)
    .filter((ctx) => ctx?.headerTitle)
    .pop();

  if (!routeContext?.headerTitle) {
    return null;
  }

  return (
    <header className="z-10 flex w-full flex-col border-b border-border bg-card px-6">
      <div className="mx-auto flex w-full max-w-screen-xl items-center justify-between py-12">
        <div className="flex flex-col items-start gap-2">
          <h1 className="text-3xl font-medium text-primary/80">
            {routeContext?.headerTitle}
          </h1>
          <p className="text-base font-normal text-primary/60">
            {routeContext?.headerDescription}
          </p>
        </div>
      </div>
    </header>
  );
}
