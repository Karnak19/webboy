import { describe, expect, test } from "bun:test";
import { mdToHtml } from "../src/panel/md";

describe("mdToHtml", () => {
  test("échappe le HTML", () => {
    expect(mdToHtml("<script>alert(1)</script>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
  });

  test("gras et titres", () => {
    expect(mdToHtml("## Le gagnant **est là**")).toBe(
      "<h3>Le gagnant <strong>est là</strong></h3>",
    );
  });

  test("tableau markdown", () => {
    const html = mdToHtml("| Modèle | Prix |\n|---|---|\n| E7 | 399 € |");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Modèle</th>");
    expect(html).toContain("<td>399 €</td>");
  });

  test("liens http uniquement", () => {
    expect(mdToHtml("[ok](https://a.fr)")).toContain('href="https://a.fr"');
    expect(mdToHtml("[bad](javascript:alert(1))")).not.toContain('href="javascript');
  });

  test("liste à puces", () => {
    expect(mdToHtml("- un\n- deux")).toBe("<ul><li>un</li><li>deux</li></ul>");
  });
});
