# 🧢 Webboy

Extension Helium (Chromium MV3) : ton **bon boy** qui fait la recherche web pour
toi, propulsé par ton abonnement **OpenCode Go**.

Tu lui donnes une mission (« trouve-moi un bureau assis-debout électrique, max
500 €, silencieux »), il travaille **sous tes yeux** : ses onglets s'ouvrent
dans un groupe « 🧢 webboy », la page qu'il lit passe devant toi (**mode
caméra**) — et il te rend la main dès que tu changes d'onglet. À la fin, il
publie un rapport comparatif dans le panneau et **ouvre les liens finaux**, le
gagnant en premier.

## Prérequis

- [Helium](https://github.com/imputnet/helium) (ou n'importe quel Chromium récent)
- [Bun](https://bun.sh)
- Un abonnement [OpenCode Go](https://opencode.ai/go) et sa clé API
  ([Console OpenCode](https://opencode.ai/v2/docs/console/go) → Go → copier la clé)

## Build & installation

```sh
bun install
bun run build     # → dist/
```

Dans Helium :

1. Ouvre `chrome://extensions`
2. Active le **mode développeur** (en haut à droite)
3. **Charger l'extension non empaquetée** → sélectionne le dossier `dist/`
4. Clique sur l'icône 🧢 Webboy dans la barre d'outils → le panneau s'ouvre

## Configuration

Dans le panneau → ⚙️ :

1. Colle ta **clé API OpenCode Go**
2. **Tester la connexion** (doit lister les modèles)
3. Choisis un modèle — `glm-5.3-flash` (grosse limite) par défaut,
   `glm-5.3` ou `kimi-k3` pour les missions délicates
4. Sauvegarde

## Utilisation

- Écris ta mission dans le panneau, Entrée pour envoyer
- S'il manque un critère (budget…), il pose max 2 questions puis attend ta
  réponse
- Regarde-le travailler : groupe d'onglets + feed d'activité dans le panneau
- ⏹ pour l'arrêter, 🧹 pour repartir sur une nouvelle mission

## Développement

```sh
bun run check    # typecheck
bun test         # tests unitaires (markdown, parsing SERP)
bun run build    # build complet (icônes + dist/)
```

Après chaque modification : `bun run build` puis recharger l'extension dans
`chrome://extensions`.

### Architecture

```
src/
  background/          service worker MV3
    main.ts            point d'entrée : side panel, RPC, mode caméra
    agent.ts           le loop agent (state machine persistée en session)
    tabs.ts            groupe d'onglets « webboy », attente de chargement
    keepalive.ts       heartbeat (le SW MV3 meurt après ~30 s d'inactivité)
    bus.ts             communication push vers le panneau
  tools/               les mains du webboy (exécutées dans le navigateur)
    search.ts          onglet DuckDuckGo parsé (Google en secours)
    read_page.ts       extraction DOM → texte propre (tronqué à 15k)
    index.ts           définitions JSON des outils pour le modèle
  lib/
    opencode.ts        client API OpenCode Go (OpenAI-compatible, streaming)
    serp.ts / extract.ts  fonctions injectées dans les pages
    prompt.ts          le system prompt FR de la persona
    storage.ts         settings / chat / historique / état
  panel/               side panel (Preact) : chat, feed live, settings, carte
```

### Limites connues (v1)

- Une seule mission à la fois (pas de file d'attente)
- Le client ne parle que l'endpoint **OpenAI-compatible** de Go (les modèles
  Claude/Qwen/Grok passent par d'autres protocoles, non gérés)
- Le parsing des pages de résultats est best-effort : si le markup de
  DuckDuckGo/Google change, il bascule sur l'autre moteur
- Sites derrière Cloudflare : `read_page` rend une erreur explicite, le webboy
  change de source
