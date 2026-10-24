export const GROUP_TITLE = "🧢 webboy";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function findGroup(): Promise<chrome.tabGroups.TabGroup | null> {
  const groups = await chrome.tabGroups.query({ title: GROUP_TITLE });
  return groups[0] ?? null;
}

async function findOrCreateGroup(): Promise<number> {
  const existing = await findGroup();
  if (existing) return existing.id;
  const tab = await chrome.tabs.create({ url: "about:blank", active: false });
  const groupId = await chrome.tabs.group({ tabIds: [tab.id!] });
  await chrome.tabGroups.update(groupId, { title: GROUP_TITLE, color: "orange" });
  return groupId;
}

export async function openInGroup(
  url: string,
  opts: { active: boolean },
): Promise<chrome.tabs.Tab> {
  const groupId = await findOrCreateGroup();
  const tab = await chrome.tabs.create({ url, active: opts.active });
  await chrome.tabs.group({ tabIds: [tab.id!], groupId });
  if (opts.active) await chrome.tabs.update(tab.id!, { active: true });
  return tab;
}

/** Ferme les onglets du groupe webboy sauf ceux qu'on veut garder (liens finaux). */
export async function closeGroupTabs(keep: number[]): Promise<void> {
  const group = await findGroup();
  if (!group) return;
  const tabs = await chrome.tabs.query({ groupId: group.id });
  const doomed = tabs
    .filter((t) => t.id !== undefined && !keep.includes(t.id))
    .map((t) => t.id!);
  if (doomed.length) await chrome.tabs.remove(doomed).catch(() => {});
}

export async function tabInGroup(tabId: number): Promise<boolean> {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.groupId === -1) return false;
    const group = await findGroup();
    return !!group && tab.groupId === group.id;
  } catch {
    return false;
  }
}

/**
 * Attend le chargement complet d'un onglet (timeout ~15 s), puis on parse quand
 * même : mieux vaut un contenu partiel qu'un échec.
 */
export function waitForTabLoad(tabId: number, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    const listener = (
      id: number,
      changeInfo: chrome.tabs.TabChangeInfo,
    ) => {
      if (id === tabId && changeInfo.status === "complete") done();
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs
      .get(tabId)
      .then((t) => {
        if (t?.status === "complete") done();
      })
      .catch(() => done());
  });
}
