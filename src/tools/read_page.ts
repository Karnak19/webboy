import { openInGroup, sleep, waitForTabLoad } from "../background/tabs";
import { extractPageInPage } from "../lib/extract";
import type { Activity } from "../lib/types";

type OnActivity = (a: Omit<Activity, "id" | "at">) => void;

const MAX_CHARS = 15000;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export async function toolReadPage(
  url: string,
  camera: boolean,
  onActivity: OnActivity,
): Promise<string> {
  onActivity({ kind: "read", label: `lit ${hostOf(url)}`, url });
  const tab = await openInGroup(url, { active: camera });
  await waitForTabLoad(tab.id!);
  await sleep(1500); // laisse le JS de la page finir de rendre

  let extracted: Awaited<ReturnType<typeof extractPageInPage>> | undefined;
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      func: extractPageInPage,
    });
    extracted = res?.result;
  } catch (e) {
    return `ERREUR : impossible d'injecter l'extraction dans cette page (${String(e)}). Essaie une autre source.`;
  }

  if (!extracted || extracted.error || !extracted.text.trim()) {
    return "ERREUR : page vide, bloquée (anti-bot ou connexion) ou illisible. N'insiste pas : change de source.";
  }

  const text = extracted.text;
  const truncated =
    text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + "\n\n[… page tronquée]" : text;
  const header = `PAGE : ${extracted.title}\nURL : ${extracted.url}`;
  const desc = extracted.description ? `Résumé officiel : ${extracted.description}\n` : "";
  return `${header}\n${desc}\n${truncated}`;
}
