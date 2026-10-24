import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type {
  Activity,
  ActivityKind,
  Boot,
  ChatMessage,
  ResultCard,
  RpcRequest,
  RpcResponse,
  Settings,
  TaskState,
  PushEvent,
} from "../lib/types";
import { mdToHtml } from "./md";
import { SettingsView } from "./Settings";

const KIND_EMOJI: Record<ActivityKind, string> = {
  search: "🔍",
  read: "📖",
  open: "🔗",
  finish: "✅",
  eye: "👁",
  stop: "⏹",
  error: "⚠️",
};

const STATUS_LABEL: Record<TaskState["status"], string> = {
  idle: "prêt",
  running: "en mission",
  waiting: "te demande",
  done: "mission accomplie",
  error: "erreur",
};

const mkid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

export function App() {
  const [conn, setConn] = useState<"connecting" | "online" | "offline">("connecting");
  const [view, setView] = useState<"chat" | "settings">("chat");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [state, setState] = useState<TaskState>({ status: "idle", camera: false, model: "" });
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [stream, setStream] = useState("");
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState("");

  const portRef = useRef<chrome.runtime.Port | null>(null);
  const pending = useRef(new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>());
  const chatRef = useRef<HTMLElement | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);

  const rpc = useCallback((req: RpcRequest): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      pending.current.set(req.id, { resolve, reject });
      portRef.current?.postMessage(req);
    });
  }, []);

  const toast = useCallback((msg: string) => {
    setNotice(msg);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 5000);
  }, []);

  const handleEvent = useCallback((ev: PushEvent) => {
    switch (ev.type) {
      case "delta":
        setStream((s) => s + ev.text);
        break;
      case "message":
        setChat((c) => [...c, ev.message]);
        setStream("");
        break;
      case "activity":
        setActivities((a) => [...a, ev.activity]);
        break;
      case "state":
        setState(ev.state);
        break;
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    const connect = () => {
      if (stopped) return;
      const port = chrome.runtime.connect({ name: "webboy-panel" });
      portRef.current = port;
      port.onMessage.addListener((msg: RpcResponse | PushEvent) => {
        if ("id" in msg && "ok" in msg) {
          const p = pending.current.get(msg.id);
          if (p) {
            pending.current.delete(msg.id);
            if (msg.ok) p.resolve(msg.data);
            else p.reject(new Error(msg.error));
          }
          return;
        }
        handleEvent(msg as PushEvent);
      });
      port.onDisconnect.addListener(() => {
        if (stopped) return;
        setConn("offline");
        portRef.current = null;
        window.setTimeout(connect, 1000);
      });
      setConn("online");
      void rpc({ id: mkid(), type: "getBoot" })
        .then((boot) => {
          const b = boot as Boot;
          setSettings(b.settings);
          setState(b.state);
          setChat(b.chat);
          setActivities(b.activities);
        })
        .catch(() => {});
    };
    connect();
    return () => {
      stopped = true;
      portRef.current?.disconnect();
    };
  }, [rpc, handleEvent]);

  // scroll auto quand la conversation bouge
  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length, stream, activities.length, state.status]);

  const running = state.status === "running";

  const send = async () => {
    const text = input.trim();
    if (!text || running || conn !== "online") return;
    setInput("");
    // un seul type de message : le service worker décide s'il continue la
    // conversation (contexte gardé) ou lance une première mission
    const req: RpcRequest = { id: mkid(), type: "send", text };
    try {
      await rpc(req);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  };

  const stop = () => void rpc({ id: mkid(), type: "stop" }).catch(() => {});
  const reset = async () => {
    await rpc({ id: mkid(), type: "reset" }).catch(() => {});
    setChat([]);
    setActivities([]);
    setStream("");
  };

  return (
    <div class="app">
      <header>
        <div class="brand">
          <span class="logo">🧢</span>
          <span class="name">Webboy</span>
          <span
            class={`chip ${running ? (state.camera ? "chip-cam" : "chip-vitrine") : ""}`}
            title={
              running && state.camera
                ? "Mode caméra : l'onglet lu s'affiche devant toi"
                : running
                  ? "Mode vitrine : il travaille sans voler le focus"
                  : "En attente"
            }
          >
            {running ? (state.camera ? "🎥 caméra" : "👁 vitrine") : STATUS_LABEL[state.status]}
          </span>
        </div>
        <div class="hbtns">
          <button
            class="icon-btn"
            title="Nouvelle mission (nettoie le chat et les onglets de travail)"
            disabled={running}
            onClick={() => void reset()}
          >
            🧹
          </button>
          <button
            class="icon-btn"
            title="Réglages"
            onClick={() => setView((v) => (v === "settings" ? "chat" : "settings"))}
          >
            {view === "settings" ? "💬" : "⚙️"}
          </button>
        </div>
      </header>

      {view === "settings" && settings ? (
        <SettingsView
          settings={settings}
          rpc={rpc}
          onSaved={(s) => setSettings(s)}
          onClose={() => setView("chat")}
        />
      ) : (
        <>
          <main class="chat" ref={chatRef as never}>
            {chat.length === 0 && !stream && (
              <div class="empty">
                <div class="empty-emoji">🧢</div>
                <p>
                  Donne une mission à ton bon boy.
                  <br />
                  <span class="muted">
                    Ex : « trouve-moi un bureau assis-debout électrique, max 500 €,
                    silencieux »
                  </span>
                </p>
              </div>
            )}
            {chat.map((m) =>
              m.kind === "card" && m.card ? (
                <CardView key={m.id} card={m.card} />
              ) : (
                <div key={m.id} class={`bubble ${m.role}`}>
                  <div
                    class="bubble-content"
                    dangerouslySetInnerHTML={{ __html: mdToHtml(m.content ?? "") }}
                  />
                </div>
              ),
            )}
            {stream && (
              <div class="bubble assistant">
                <div
                  class="bubble-content streaming"
                  dangerouslySetInnerHTML={{ __html: mdToHtml(stream) }}
                />
              </div>
            )}
            {state.status === "waiting" && <div class="waiting">Il attend ta réponse 👇</div>}
            {state.status === "error" && state.error && (
              <div class="errbox">⚠️ {state.error}</div>
            )}
          </main>

          {running && activities.length > 0 && (
            <div class="feed">
              {activities.slice(-4).map((a, idx, arr) => (
                <div class={`feed-item ${idx === arr.length - 1 ? "live" : ""}`} key={a.id}>
                  <span>{KIND_EMOJI[a.kind]}</span>
                  <span class="feed-label">{a.label}</span>
                </div>
              ))}
            </div>
          )}

          <footer class="composer">
            {running ? (
              <button class="stop-btn" onClick={stop}>
                ⏹ Arrêter le webboy
              </button>
            ) : (
              <>
                <textarea
                  rows={2}
                  placeholder={
                    state.status === "waiting"
                      ? "Réponds au webboy…"
                      : "Donne une mission à ton webboy…"
                  }
                  value={input}
                  onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <button class="send-btn" title="Envoyer" onClick={() => void send()}>
                  ➤
                </button>
              </>
            )}
          </footer>
        </>
      )}

      {conn !== "online" && (
        <div class="connbar">
          {conn === "connecting" ? "connexion au webboy…" : "webboy hors ligne — reconnexion…"}
        </div>
      )}
      {notice && <div class="notice">{notice}</div>}
    </div>
  );
}

function CardView({ card }: { card: ResultCard }) {
  return (
    <div class="card">
      <div class="card-badge">🏁 Rapport de mission</div>
      <div
        class="card-report"
        dangerouslySetInnerHTML={{ __html: mdToHtml(card.reportMd) }}
      />
      {card.links.length > 0 && (
        <div class="card-links">
          {card.links.map((l, i) => (
            <a class="clink" href={l.url} target="_blank" rel="noreferrer" key={l.url}>
              <span class="clink-rank">{i === 0 ? "🏆" : i + 1}</span>
              <span class="clink-body">
                <span class="clink-label">{l.label}</span>
                <span class="clink-why">{l.why}</span>
              </span>
              <span class="clink-go">↗</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
