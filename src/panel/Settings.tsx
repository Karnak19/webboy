import { useState } from "preact/hooks";
import { OPENAI_COMPATIBLE_MODELS } from "../lib/opencode";
import type { HistoryEntry, RpcRequest, Settings } from "../lib/types";

const mkid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

interface Props {
  settings: Settings;
  rpc: (req: RpcRequest) => Promise<unknown>;
  onSaved: (s: Settings) => void;
  onClose: () => void;
}

export function SettingsView({ settings, rpc, onSaved }: Props) {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model);
  const [cameraDefault, setCameraDefault] = useState(settings.cameraDefault);
  const [notifyOnDone, setNotifyOnDone] = useState(settings.notifyOnDone);
  const [models, setModels] = useState<string[]>(OPENAI_COMPATIBLE_MODELS);
  const [test, setTest] = useState<{ state: "idle" | "testing" | "ok" | "err"; msg: string }>({
    state: "idle",
    msg: "",
  });
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);

  const testConnection = async () => {
    setTest({ state: "testing", msg: "…" });
    try {
      const list = (await rpc({ id: mkid(), type: "listModels", apiKey })) as string[];
      setModels(list);
      setTest({ state: "ok", msg: `✓ ${list.length} modèles disponibles` });
    } catch (e) {
      setTest({ state: "err", msg: `✗ ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const save = async () => {
    const next: Settings = { apiKey: apiKey.trim(), model: model.trim(), cameraDefault, notifyOnDone };
    try {
      await rpc({ id: mkid(), type: "saveSettings", settings: next });
      onSaved(next);
      setTest({ state: "ok", msg: "✓ sauvegardé" });
    } catch (e) {
      setTest({ state: "err", msg: `✗ ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const loadHistory = async () => {
    if (history) return setHistory(null);
    const h = (await rpc({ id: mkid(), type: "getHistory" })) as HistoryEntry[];
    setHistory(h);
  };

  return (
    <main class="settings">
      <section>
        <h2>🧠 Cerveau</h2>
        <label class="field">
          <span>Clé API OpenCode Go</span>
          <input
            type="password"
            value={apiKey}
            placeholder="colle ta clé depuis la Console OpenCode"
            onInput={(e) => setApiKey((e.target as HTMLInputElement).value)}
          />
          <a
            class="hint"
            href="https://opencode.ai/v2/docs/console/go"
            target="_blank"
            rel="noreferrer"
          >
            Console OpenCode → Go → copier la clé ↗
          </a>
        </label>
        <div class="row">
          <button class="btn" onClick={() => void testConnection()}>
            Tester la connexion
          </button>
          <span
            class={`test ${test.state === "ok" ? "ok" : test.state === "err" ? "err" : ""}`}
          >
            {test.msg}
          </span>
        </div>
        <label class="field">
          <span>Modèle</span>
          <input
            list="webboy-models"
            value={model}
            onInput={(e) => setModel((e.target as HTMLInputElement).value)}
          />
          <datalist id="webboy-models">
            {models.map((m) => (
              <option value={m} key={m} />
            ))}
          </datalist>
          <span class="hint">
            glm-5.3-flash = grosse limite · glm-5.3 / kimi-k3 = plus malin
          </span>
        </label>
      </section>

      <section>
        <h2>🎥 Comportement</h2>
        <label class="check">
          <input
            type="checkbox"
            checked={cameraDefault}
            onChange={(e) => setCameraDefault((e.target as HTMLInputElement).checked)}
          />
          <span>
            Mode caméra au démarrage
            <small>L'onglet lu passe devant toi ; il te rend la main si tu changes d'onglet.</small>
          </span>
        </label>
        <label class="check">
          <input
            type="checkbox"
            checked={notifyOnDone}
            onChange={(e) => setNotifyOnDone((e.target as HTMLInputElement).checked)}
          />
          <span>
            Notification de fin de mission
            <small>Une notif macOS quand le rapport est prêt (clic = ouvre le gagnant).</small>
          </span>
        </label>
      </section>

      <section>
        <h2>📋 Missions</h2>
        <button class="btn" onClick={() => void loadHistory()}>
          {history ? "Masquer l'historique" : "Voir l'historique"}
        </button>
        {history && history.length === 0 && <p class="hint">Aucune mission terminée.</p>}
        {history?.map((h) => (
          <details class="hist" key={h.taskId}>
            <summary>
              {new Date(h.at).toLocaleString("fr-FR")} — {h.task.slice(0, 60)}
            </summary>
            <div class="hist-links">
              {h.result.links.map((l, i) => (
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
          </details>
        ))}
      </section>

      <div class="savebar">
        <button class="btn primary" onClick={() => void save()}>
          Sauvegarder
        </button>
      </div>
    </main>
  );
}
