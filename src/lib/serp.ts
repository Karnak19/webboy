export interface SerpItem {
  title: string;
  url: string;
  snippet: string;
}

/** Décode les liens de redirection DuckDuckGo (//duckduckgo.com/l/?uddg=…). */
export function decodeDdgRedirect(href: string, base = "https://duckduckgo.com"): string {
  try {
    const u = new URL(href, base);
    if (u.hostname.endsWith("duckduckgo.com") && u.pathname === "/l/") {
      const real = u.searchParams.get("uddg");
      if (real) return decodeURIComponent(real);
    }
    return u.href;
  } catch {
    return href;
  }
}

const JUNK_HOSTS = [
  "duckduckgo.com",
  "google.com",
  "google.fr",
  "support.google.com",
  "policies.google.com",
  "accounts.google.com",
  "youtube.com",
];

/** Déduplique, filtre le bruit et limite aux 10 premiers résultats. */
export function cleanSerp(items: SerpItem[]): SerpItem[] {
  const seen = new Set<string>();
  const out: SerpItem[] = [];
  for (const item of items) {
    if (!item.url.startsWith("http")) continue;
    let host: string;
    try {
      host = new URL(item.url).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    if (JUNK_HOSTS.some((j) => host === j || host.endsWith("." + j))) continue;
    const key = host + new URL(item.url).pathname.replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= 10) break;
  }
  return out;
}

/**
 * Injectée dans la page du moteur de recherche. Doit rester 100 % autonome :
 * chrome.scripting.executeScript sérialise le corps de la fonction, tout
 * référence au scope externe serait perdue.
 */
export function collectSerpInPage(): {
  host: string;
  results: { title: string; url: string; snippet: string }[];
  error?: string;
} {
  try {
    const host = location.hostname;
    const out: { title: string; url: string; snippet: string }[] = [];
    const decode = (href: string | null): string => {
      if (!href) return "";
      try {
        const u = new URL(href, location.origin);
        if (
          u.hostname.endsWith("duckduckgo.com") &&
          u.pathname === "/l/"
        ) {
          const real = u.searchParams.get("uddg");
          if (real) return decodeURIComponent(real);
        }
        return u.href;
      } catch {
        return href;
      }
    };
    const push = (a: Element | null, snippetEl: Element | null) => {
      if (!a) return;
      const url = decode(a.getAttribute("href"));
      const title = (a.textContent ?? "").trim();
      if (!url.startsWith("http") || !title) return;
      out.push({
        title,
        url,
        snippet: snippetEl ? (snippetEl.textContent ?? "").trim() : "",
      });
    };

    if (host.endsWith("duckduckgo.com")) {
      // html.duckduckgo.com et lite.duckduckgo.com (sans JS)
      document.querySelectorAll("div.result, div.web-result").forEach((r) => {
        push(r.querySelector("a.result__a"), r.querySelector(".result__snippet"));
      });
      document.querySelectorAll("a.result-link").forEach((a) => {
        const row = a.closest("tr");
        push(a, row?.nextElementSibling?.querySelector(".result-snippet") ?? null);
      });
      // duckduckgo.com moderne (SPA)
      if (!out.length) {
        document
          .querySelectorAll("article[data-testid='result'], article[data-nrn='result']")
          .forEach((r) => {
            push(
              r.querySelector("a[data-testid='result-title-a'], h2 a"),
              r.querySelector("[data-result='snippet'], .result__snippet"),
            );
          });
      }
    } else if (host.includes("google.")) {
      const seen = new Set<Element>();
      document.querySelectorAll("#search a h3, #rso a h3").forEach((h3) => {
        const a = h3.closest("a");
        if (!a || seen.has(a)) return;
        seen.add(a);
        const container =
          a.closest("div.g, div[data-sokoban-container], div.MjjYud") ??
          a.parentElement;
        push(a, container?.querySelector(".VwiC3b, .IsZvec") ?? null);
      });
    }
    return { host, results: out };
  } catch (e) {
    return { host: location.hostname, results: [], error: String(e) };
  }
}
