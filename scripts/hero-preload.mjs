// The LCP image on a page is the one marked fetchpriority="high". Preloading
// it from the head with the same srcset and sizes the <img> carries lets the
// browser start the fetch before it has parsed down to the hero; deriving the
// link from the rewritten tag keeps the two from drifting apart.
export function heroPreload(html) {
  if (/<link rel="preload" as="image"/.test(html)) return html;
  const img = html.match(/<img\b[^>]*fetchpriority="high"[^>]*>/i);
  if (!img) return html;
  const attr = (n) => (img[0].match(new RegExp(`\\b${n}="([^"]*)"`)) || [])[1];
  const src = attr('src'); if (!src) return html;
  const href = src.startsWith('/') ? src : '/' + src;
  const srcset = attr('srcset'), sizes = attr('sizes');
  const link = `<link rel="preload" as="image" href="${href}"` +
    (srcset ? ` imagesrcset="${srcset}" imagesizes="${sizes || '100vw'}"` : '') + '>';
  return html.replace('</head>', `${link}\n</head>`);
}
