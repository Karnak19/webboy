/**
 * Injectée dans la page visitée pour en extraire le texte propre.
 * Doit rester 100 % autonome (sérialisée par chrome.scripting.executeScript).
 */
export function extractPageInPage(): {
  title: string;
  url: string;
  description: string;
  text: string;
  error?: string;
} {
  try {
    const title = document.title ?? "";
    const metaDesc = document.querySelector('meta[name="description"]');
    const description = metaDesc?.getAttribute("content") ?? "";

    const root =
      document.querySelector("article") ??
      document.querySelector("main") ??
      document.querySelector("[role='main']") ??
      document.getElementById("content") ??
      document.body;
    const clone = root.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll(
        "script,style,noscript,svg,iframe,form,button,input,select,textarea,canvas,template,nav,header,footer,aside,link,meta",
      )
      .forEach((el) => el.remove());

    const BLOCK = new Set([
      "ADDRESS","ARTICLE","ASIDE","BLOCKQUOTE","DD","DIV","DL","DT","FIELDSET",
      "FIGCAPTION","FIGURE","H1","H2","H3","H4","H5","H6","HR","LI","MAIN","OL",
      "P","PRE","SECTION","TABLE","TBODY","THEAD","TFOOT","UL",
    ]);

    const txt = (node: Node): string => {
      // 3 = TEXT_NODE, 1 = ELEMENT_NODE
      if (node.nodeType === 3) return (node.textContent ?? "").replace(/[ \t\r\n]+/g, " ");
      if (node.nodeType !== 1) return "";
      const el = node as HTMLElement;
      const tag = el.tagName;
      if (tag === "BR") return "\n";
      const kids = () => Array.from(el.childNodes).map(txt).join("");
      if (tag === "LI") return "\n- " + kids().trim();
      if (tag === "TR")
        return "\n| " + Array.from(el.children).map((c) => txt(c).trim()).join(" | ") + " |";
      const inner = kids();
      return BLOCK.has(tag) ? "\n" + inner : inner;
    };

    let text = txt(clone)
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();

    return { title, url: location.href, description, text };
  } catch (e) {
    return {
      title: document.title ?? "",
      url: location.href,
      description: "",
      text: "",
      error: String(e),
    };
  }
}
