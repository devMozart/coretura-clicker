// Test-only helper: mounts the real page markup so tests run against what ships.
// index.html is the single source of truth for the ~20 element ids UI resolves,
// so renaming one there fails the suite instead of silently blanking the page.
import indexHtml from '../index.html?raw';

const BODY = /<body[^>]*>([\s\S]*)<\/body>/;
const SCRIPTS = /<script\b[^>]*>[\s\S]*?<\/script>/gi;

const body = indexHtml.match(BODY)?.[1];
if (!body) throw new Error('could not find <body> in index.html');

/** The page's body, minus the module script — happy-dom must not fetch main.ts. */
const markup = body.replace(SCRIPTS, '');

export function mountPage(): void {
  document.body.innerHTML = markup;
  // The sheet's open state is a class on <body>, which innerHTML does not clear.
  document.body.className = '';
}
