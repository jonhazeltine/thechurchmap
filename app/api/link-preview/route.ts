import type { Request, Response } from "express";

interface LinkMetadata {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  favicon: string | null;
}

function extractMetaContent(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${property}["']`, 'i'),
    new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${property}["']`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}

function extractFavicon(html: string, baseUrl: string): string | null {
  const patterns = [
    /<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i,
    /<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      let favicon = match[1];
      if (favicon.startsWith('//')) {
        favicon = 'https:' + favicon;
      } else if (favicon.startsWith('/')) {
        try {
          const url = new URL(baseUrl);
          favicon = url.origin + favicon;
        } catch {
          return null;
        }
      } else if (!favicon.startsWith('http')) {
        try {
          const url = new URL(baseUrl);
          favicon = url.origin + '/' + favicon;
        } catch {
          return null;
        }
      }
      return favicon;
    }
  }

  try {
    const url = new URL(baseUrl);
    return `${url.origin}/favicon.ico`;
  } catch {
    return null;
  }
}

function resolveUrl(url: string, baseUrl: string): string {
  if (!url) return url;
  if (url.startsWith('//')) {
    return 'https:' + url;
  }
  if (url.startsWith('/')) {
    try {
      const base = new URL(baseUrl);
      return base.origin + url;
    } catch {
      return url;
    }
  }
  if (!url.startsWith('http')) {
    try {
      const base = new URL(baseUrl);
      return base.origin + '/' + url;
    } catch {
      return url;
    }
  }
  return url;
}

export async function GET(req: Request, res: Response) {
  try {
    const url = req.query.url as string;

    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    let normalizedUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      normalizedUrl = 'https://' + url;
    }

    try {
      new URL(normalizedUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(normalizedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LinkPreviewBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return res.status(502).json({ error: 'Failed to fetch URL' });
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        const metadata: LinkMetadata = {
          url: normalizedUrl,
          title: null,
          description: null,
          image: contentType.startsWith('image/') ? normalizedUrl : null,
          siteName: null,
          favicon: null,
        };
        return res.json(metadata);
      }

      const html = await response.text();

      const ogTitle = extractMetaContent(html, 'og:title');
      const ogDescription = extractMetaContent(html, 'og:description');
      const ogImage = extractMetaContent(html, 'og:image');
      const ogSiteName = extractMetaContent(html, 'og:site_name');
      const twitterTitle = extractMetaContent(html, 'twitter:title');
      const twitterDescription = extractMetaContent(html, 'twitter:description');
      const twitterImage = extractMetaContent(html, 'twitter:image');
      const metaDescription = extractMetaContent(html, 'description');
      const htmlTitle = extractTitle(html);
      const favicon = extractFavicon(html, normalizedUrl);

      const metadata: LinkMetadata = {
        url: normalizedUrl,
        title: ogTitle || twitterTitle || htmlTitle || null,
        description: ogDescription || twitterDescription || metaDescription || null,
        image: resolveUrl(ogImage || twitterImage || '', normalizedUrl) || null,
        siteName: ogSiteName || null,
        favicon,
      };

      res.json(metadata);
    } catch (fetchError: any) {
      clearTimeout(timeout);
      if (fetchError.name === 'AbortError') {
        return res.status(504).json({ error: 'Request timeout' });
      }
      throw fetchError;
    }
  } catch (error: any) {
    console.error('GET /api/link-preview error:', error);
    res.status(500).json({ error: error.message });
  }
}
