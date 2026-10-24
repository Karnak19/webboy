import type { ToolDef } from "../lib/types";

export const TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "search",
      description:
        "Recherche sur le web (DuckDuckGo puis Google en secours). Retourne une liste de résultats (titre, URL, extrait). Utilise des requêtes en français.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "La requête de recherche." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_page",
      description:
        "Ouvre une page web dans un onglet du navigateur du patron et retourne son contenu texte propre (tronqué). Sert à lire une fiche produit, un comparatif, un test…",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL http(s) complète de la page." },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finish",
      description:
        "Termine la mission : ouvre les liens finaux dans le navigateur du patron (le gagnant devant) et publie le rapport. À appeler OBLIGATOIREMENT pour livrer, jamais en texte seul.",
      parameters: {
        type: "object",
        properties: {
          report_md: {
            type: "string",
            description:
              "Le rapport final en markdown : comparatif concis (tableau bienvenue) puis recommandation argumentée.",
          },
          links: {
            type: "array",
            description: "Liens classés, du gagnant aux derniers recours (1 à 5).",
            items: {
              type: "object",
              properties: {
                url: { type: "string", description: "URL http(s) complète." },
                label: { type: "string", description: "Nom court du lien (produit + site)." },
                why: { type: "string", description: "Pourquoi ce lien, en une phrase." },
              },
              required: ["url", "label", "why"],
            },
          },
        },
        required: ["report_md", "links"],
      },
    },
  },
];
