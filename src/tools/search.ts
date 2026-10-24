import { openInGroup, sleep, waitForTabLoad } from "../background/tabs";
import { cleanSerp, collectSerpInPage, type SerpItem } from "../lib/serp";
import type { Activity } from "../lib/types";

type OnActivity = (a: Omit<Activity, "id" | "at">) => void;

export async function toolSearch(
  query: string,
  camera: boolean,
  onActivity: OnActivity,
): Promise<string> {
  const engines = [
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=fr`,
  ];
  let items: SerpItem[] = [];

  for (const url of engines) {
    onActivity({ kind: "search", label: `recherche : « ${query} »`, url });
    const tab = await openInGroup(url, { active: camera });
    await waitForTabLoad(tab.id!);
    await sleep(1200);
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: collectSerpInPage,
      });
      items = cleanSerp(res?.result?.results ?? []);
      if (items.length >= 3) break;
    } catch {
      /* moteur suivant */
    }
  }

  if (!items.length) {
    return "ERREUR : aucun résultat exploitable n'a pu être extrait du moteur de recherche. Reformule ta requête ou lis directement une URL connue avec read_page.";
  }
  return items
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
    .join("\n");
}
