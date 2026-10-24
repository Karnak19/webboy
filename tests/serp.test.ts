import { describe, expect, test } from "bun:test";
import { cleanSerp, decodeDdgRedirect } from "../src/lib/serp";

describe("decodeDdgRedirect", () => {
  test("décode uddg", () => {
    expect(
      decodeDdgRedirect("//duckduckgo.com/l/?uddg=https%3A%2F%2Fflexispot.fr%2Fe7&rut=abc"),
    ).toBe("https://flexispot.fr/e7");
  });

  test("laisse passer les URL normales", () => {
    expect(decodeDdgRedirect("https://exemple.fr/page")).toBe("https://exemple.fr/page");
  });
});

describe("cleanSerp", () => {
  test("déduplique et filtre le bruit", () => {
    const out = cleanSerp([
      { title: "A", url: "https://site.fr/produit", snippet: "" },
      { title: "A bis", url: "https://www.site.fr/produit/", snippet: "" },
      { title: "Google", url: "https://google.com/search", snippet: "" },
      { title: "B", url: "https://autre.fr/", snippet: "" },
      { title: "pas http", url: "ftp://x", snippet: "" },
    ]);
    expect(out.map((r) => r.title)).toEqual(["A", "B"]);
  });

  test("limite à 10", () => {
    const items = Array.from({ length: 15 }, (_, i) => ({
      title: `r${i}`,
      url: `https://site${i}.fr/x`,
      snippet: "",
    }));
    expect(cleanSerp(items)).toHaveLength(10);
  });
});
