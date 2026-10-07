const FALLBACK_OG = 'https://vsalon.web.app/og-image.png';
const ORIGIN = 'https://vsalon.web.app';

function cleanCode(v) {
  return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function parseLogoDataUrl(logo) {
  const m = /^data:(image\/(?:png|jpeg|jpg|webp|gif|svg\+xml));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(logo || ''));
  if (!m) return null;
  let type = m[1].toLowerCase();
  if (type === 'image/jpg') type = 'image/jpeg';
  if (type === 'image/svg+xml') return null;
  const buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
  if (!buf.length || buf.length > 4 * 1024 * 1024) return null;
  return { type, buf };
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function replaceOnce(html, re, fn) {
  return html.replace(re, (m, ...g) => fn(m, ...g));
}

function patchShareHtml(html, opts) {
  const title = String(opts.title || '').trim().slice(0, 40);
  const tagline = String(opts.tagline || '').trim().slice(0, 60);
  const logoUrl = String(opts.logoUrl || '').trim();
  const shareUrl = String(opts.shareUrl || '').trim();

  if (shareUrl) {
    html = replaceOnce(html, /<meta property="og:url" content="[^"]*">/,
      () => `<meta property="og:url" content="${esc(shareUrl)}">`);
  }

  if (title) {
    const full = esc(title + ' · Agendamento online');
    html = replaceOnce(html, /<meta property="og:title" content="[^"]*">/,
      () => `<meta property="og:title" content="${full}">`);
    html = replaceOnce(html, /<meta name="twitter:title" content="[^"]*">/,
      () => `<meta name="twitter:title" content="${full}">`);
    html = replaceOnce(html, /<title>[^<]*<\/title>/,
      () => `<title>${full}</title>`);
    if (tagline) {
      html = replaceOnce(html, /<meta property="og:description" content="[^"]*">/,
        () => `<meta property="og:description" content="${esc(tagline)}">`);
    }
  }

  if (logoUrl) {
    const alt = esc(title ? 'Logo ' + title : 'Logo do salão');
    html = replaceOnce(html, /<meta property="og:image" content="[^"]*">/,
      () => `<meta property="og:image" content="${esc(logoUrl)}">`);
    html = replaceOnce(html, /<meta name="twitter:image" content="[^"]*">/,
      () => `<meta name="twitter:image" content="${esc(logoUrl)}">`);
    html = replaceOnce(html, /<meta property="og:image:alt" content="[^"]*">/,
      () => `<meta property="og:image:alt" content="${alt}">`);
    html = replaceOnce(html, /<meta name="twitter:image:alt" content="[^"]*">/,
      () => `<meta name="twitter:image:alt" content="${alt}">`);
    html = html.replace(/\n<meta property="og:image:(?:width|height)" content="[^"]*">/g, '');
  }

  return html;
}

module.exports = { ORIGIN, FALLBACK_OG, cleanCode, parseLogoDataUrl, esc, patchShareHtml };
