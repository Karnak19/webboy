import type { PushEvent, RpcRequest, RpcResponse } from "../lib/types";

type RpcHandler = (req: RpcRequest) => Promise<unknown>;

const ports = new Set<chrome.runtime.Port>();
let rpcHandler: RpcHandler | null = null;

export function initBus(handler: RpcHandler): void {
  rpcHandler = handler;
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "webboy-panel") return;
    ports.add(port);
    port.onDisconnect.addListener(() => ports.delete(port));
    port.onMessage.addListener((req: RpcRequest) => {
      void handleRpc(req, port);
    });
  });
}

async function handleRpc(req: RpcRequest, port: chrome.runtime.Port): Promise<void> {
  try {
    const data = await rpcHandler?.(req);
    const res: RpcResponse = { id: req.id, ok: true, data: data ?? null };
    port.postMessage(res);
  } catch (e) {
    const res: RpcResponse = {
      id: req.id,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
    try {
      port.postMessage(res);
    } catch {
      /* port fermé */
    }
  }
}

export function emit(ev: PushEvent): void {
  for (const port of ports) {
    try {
      port.postMessage(ev);
    } catch {
      ports.delete(port);
    }
  }
}
