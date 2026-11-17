// Turns the single-file Vite build into an Artifact page body (no doctype/html/head/body of its own).
import { readFileSync, writeFileSync } from "node:fs";
const html = readFileSync("dist-artifact/index.html", "utf8");
const headStart = html.indexOf("<head>") + 6;
const headEnd = html.indexOf("</head>");
const head = html.slice(headStart, headEnd);
const bodyInner = html.slice(html.indexOf("<body>") + 6, html.lastIndexOf("</body>"));
const take = (re) => [...head.matchAll(re)].map((m) => m[0]).join("\n");
const title = take(/<title>[\s\S]*?<\/title>/g);
const metas = take(/<meta name="claude:[^>]*>/g);
const links = take(/<link [^>]*>/g);
// The module script and style blocks are large; slice them by their tags.
const sStart = head.indexOf("<script");
const sEnd = head.indexOf("</script>", sStart) + 9;
const script = head.slice(sStart, sEnd);
const rest = head.slice(0, sStart) + head.slice(sEnd);
const styles = [...rest.matchAll(/<style[\s\S]*?<\/style>/g)].map((m) => m[0]).join("\n");
const out = [title, metas, links, styles, bodyInner.trim(), script].join("\n");
writeFileSync("dist-artifact/artifact.html", out);
console.log("artifact.html", (out.length / 1024).toFixed(0) + " KB");
