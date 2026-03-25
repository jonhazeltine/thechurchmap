import { supabaseServer } from '../../lib/supabaseServer';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);
const THUMB_CACHE_DIR = '/tmp/video-thumbs';

function prewarmVideoThumbnail(videoUrl: string) {
  try {
    if (!fs.existsSync(THUMB_CACHE_DIR)) {
      fs.mkdirSync(THUMB_CACHE_DIR, { recursive: true });
    }
    const hash = createHash('md5').update(videoUrl).digest('hex');
    const cachePath = path.join(THUMB_CACHE_DIR, `${hash}.jpg`);
    if (fs.existsSync(cachePath)) return;

    execFileAsync('ffmpeg', [
      '-i', videoUrl,
      '-ss', '1',
      '-vframes', '1',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-q:v', '2',
      '-'
    ], { encoding: 'buffer' as any, maxBuffer: 10 * 1024 * 1024, timeout: 30000 } as any)
      .then(({ stdout }) => {
        fs.writeFileSync(cachePath, stdout as unknown as Buffer);
        console.log('Pre-warmed video thumbnail:', videoUrl.slice(-40));
      })
      .catch(() => {});
  } catch {}
}

interface OGMetaTags {
  title: string;
  description: string;
  image: string;
  imageType?: string;
  url: string;
  type: 'website' | 'article' | 'profile';
  siteName?: string;
  video?: string;
  videoType?: string;
}

function generateMetaTagsHTML(tags: OGMetaTags): string {
  const siteName = tags.siteName || 'The Church Map';
  
  return `
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="${tags.type}" />
    <meta property="og:url" content="${tags.url}" />
    <meta property="og:title" content="${tags.title}" />
    <meta property="og:description" content="${tags.description}" />
    <meta property="og:image" content="${tags.image}" />
    <meta property="og:image:url" content="${tags.image}" />
    <meta property="og:image:secure_url" content="${tags.image}" />
    <meta property="og:image:type" content="${tags.imageType || 'image/png'}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${tags.title}" />
    <meta property="og:site_name" content="${siteName}" />
    ${tags.video ? `
    <meta property="og:video" content="${tags.video}" />
    <meta property="og:video:url" content="${tags.video}" />
    <meta property="og:video:secure_url" content="${tags.video}" />
    <meta property="og:video:type" content="${tags.videoType || 'video/mp4'}" />
    <meta property="og:video:width" content="1280" />
    <meta property="og:video:height" content="720" />
    ` : ''}
    <!-- Twitter -->
    <meta name="twitter:card" content="${tags.video ? 'player' : 'summary_large_image'}" />
    <meta name="twitter:url" content="${tags.url}" />
    <meta name="twitter:title" content="${tags.title}" />
    <meta name="twitter:description" content="${tags.description}" />
    <meta name="twitter:image" content="${tags.image}" />
    <meta name="twitter:image:alt" content="${tags.title}" />
    ${tags.video ? `
    <meta name="twitter:player" content="${tags.video}" />
    <meta name="twitter:player:width" content="1280" />
    <meta name="twitter:player:height" content="720" />
    ` : ''}
  `;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getBaseUrl(host: string | undefined): string {
  if (!host) return 'https://thechurchmap.com';
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    return `http://${host}`;
  }
  if (host.includes('replit.app') || host.includes('replit.dev')) {
    return `https://${host}`;
  }
  return `https://${host}`;
}

// Reserved path prefixes that should NOT be treated as platform slugs
// Must match the reservedPrefixes in usePlatformNavigation.ts
const RESERVED_PREFIXES = new Set([
  'admin', 'about', 'methodology', 'facility-sharing', 'prayers',
  'signatures', 'agent-program', 'login', 'signup', 'auth',
  'onboarding', 'profile', 'apply-for-platform', 'platforms',
  'platform', 'explore', 'api', 'church', 'churches', 'community',
  'map', 'ministry-area', 'posts', 'journey'
]);

// Valid sub-paths under a platform slug that have explicit OG handling
const VALID_PLATFORM_SUBPATHS = new Set(['map', 'community']);

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function getPostOGMeta(
  supabase: ReturnType<typeof supabaseServer>,
  postId: string,
  platform: { id: string; name: string; slug: string; description: string | null },
  baseUrl: string,
  ogImageBase: string
): Promise<OGMetaTags | null> {
  try {
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, title, body, body_format, cover_image_url, media_urls, media_type, author_id, post_type')
      .eq('id', postId)
      .single();

    if (postError || !post) return null;

    const { data: author } = await supabase
      .from('profiles')
      .select('full_name, first_name, last_name, avatar_url')
      .eq('id', post.author_id)
      .single();

    const authorName = author?.full_name
      || [author?.first_name, author?.last_name].filter(Boolean).join(' ')
      || 'A community member';

    let postTitle = post.title;
    if (!postTitle || postTitle.trim() === '') {
      if (post.post_type === 'prayer') {
        postTitle = `Prayer Request from ${authorName}`;
      } else {
        postTitle = `Post by ${authorName}`;
      }
    }

    let postDescription = '';
    if (post.body) {
      const rawText = post.body_format === 'html' ? stripHtml(post.body) : post.body;
      postDescription = rawText.slice(0, 200) + (rawText.length > 200 ? '...' : '');
    }
    if (!postDescription) {
      postDescription = `Shared in the ${platform.name} community on The Church Map.`;
    }

    let ogImage = '';
    let ogImageType: string | undefined;
    let ogVideo: string | undefined;
    let ogVideoType: string | undefined;

    if (post.cover_image_url) {
      ogImage = post.cover_image_url;
    } else if (post.media_urls && post.media_urls.length > 0) {
      const firstMedia = post.media_urls[0];
      if (post.media_type !== 'video') {
        ogImage = firstMedia;
      } else {
        ogVideo = firstMedia;
        ogVideoType = 'video/mp4';
        ogImage = `${ogImageBase}?type=video-thumb&videoUrl=${encodeURIComponent(firstMedia)}`;
        ogImageType = 'image/jpeg';
        prewarmVideoThumbnail(firstMedia);
      }
    } else {
      ogImage = `${ogImageBase}?type=post&id=${post.id}`;
    }

    return {
      title: `${escapeHtml(postTitle)} | ${escapeHtml(platform.name)} Community`,
      description: escapeHtml(postDescription),
      image: ogImage,
      imageType: ogImageType,
      url: `${baseUrl}/${platform.slug}/community/${post.id}`,
      type: 'article',
      video: ogVideo,
      videoType: ogVideoType,
    };
  } catch (err) {
    console.error('Error fetching post for OG meta:', err);
    return null;
  }
}

export async function getOGMetaTagsForRoute(
  pathname: string,
  host: string | undefined,
  queryString?: string
): Promise<OGMetaTags | null> {
  const baseUrl = getBaseUrl(host);
  const ogImageBase = `${baseUrl}/api/og`;
  
  // Parse query params
  const queryParams = new URLSearchParams(queryString || '');

  // Parse path segments for all route matching
  const pathSegments = pathname.split('/').filter(Boolean);

  // Check for prayer journey routes
  // /journey/:shareToken — public journey viewer
  const journeyShareMatch = pathname.match(/^\/journey\/([a-zA-Z0-9_-]+)$/i);
  if (journeyShareMatch) {
    const shareToken = journeyShareMatch[1];
    try {
      const supabase = supabaseServer();
      const { data: journey, error } = await supabase
        .from('prayer_journeys')
        .select('id, title, city_platform_id')
        .eq('share_token', shareToken)
        .single();

      if (!error && journey) {
        let platformName = 'The Church Map';
        if (journey.city_platform_id) {
          const { data: platform } = await supabase
            .from('city_platforms')
            .select('name')
            .eq('id', journey.city_platform_id)
            .single();
          if (platform) platformName = platform.name;
        }

        const { count } = await supabase
          .from('prayer_journey_steps')
          .select('id', { count: 'exact', head: true })
          .eq('journey_id', journey.id);

        const stepCount = count || 0;

        return {
          title: `${escapeHtml(journey.title || 'Prayer Journey')} — Prayer Journey`,
          description: `${stepCount} prayer stop${stepCount !== 1 ? 's' : ''} in ${escapeHtml(platformName)}`,
          image: `${ogImageBase}?type=journey&id=${journey.id}`,
          url: `${baseUrl}/journey/${shareToken}`,
          type: 'article',
        };
      }
    } catch (err) {
      console.error('Error fetching journey for OG meta:', err);
    }
  }

  // /:platform/journey/:id/builder — journey builder
  if (pathSegments.length >= 3 && pathSegments[1] === 'journey' && pathSegments[3] === 'builder') {
    const platformSlug = pathSegments[0];
    const journeyId = pathSegments[2];
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(journeyId);
    if (isUUID) {
      try {
        const supabase = supabaseServer();
        const { data: journey, error } = await supabase
          .from('prayer_journeys')
          .select('id, title, city_platform_id')
          .eq('id', journeyId)
          .single();

        if (!error && journey) {
          let platformName = 'The Church Map';
          if (journey.city_platform_id) {
            const { data: platform } = await supabase
              .from('city_platforms')
              .select('name')
              .eq('id', journey.city_platform_id)
              .single();
            if (platform) platformName = platform.name;
          }

          const { count } = await supabase
            .from('prayer_journey_steps')
            .select('id', { count: 'exact', head: true })
            .eq('journey_id', journey.id);

          const stepCount = count || 0;

          return {
            title: `${escapeHtml(journey.title || 'Prayer Journey')} — Prayer Journey`,
            description: `${stepCount} prayer stop${stepCount !== 1 ? 's' : ''} in ${escapeHtml(platformName)}`,
            image: `${ogImageBase}?type=journey&id=${journey.id}`,
            url: `${baseUrl}/${platformSlug}/journey/${journeyId}/builder`,
            type: 'article',
          };
        }
      } catch (err) {
        console.error('Error fetching journey builder for OG meta:', err);
      }
    }
  }

  // Check for path-based platform URLs (e.g., /grandrapids, /grandrapids/community, /grandrapids/map)
  if (pathSegments.length >= 1) {
    const potentialSlug = pathSegments[0].toLowerCase();
    const subPath = pathSegments[1]?.toLowerCase();
    
    // Only process if:
    // 1. First segment is not a reserved prefix
    // 2. Either no subpath OR subpath is a valid platform subpath (including deeper paths like community/{postId})
    const isReserved = RESERVED_PREFIXES.has(potentialSlug);
    const hasValidSubpath = !subPath || VALID_PLATFORM_SUBPATHS.has(subPath);
    
    if (!isReserved && hasValidSubpath) {
      try {
        const supabase = supabaseServer();
        const { data: platform, error } = await supabase
          .from('city_platforms')
          .select('id, name, slug, description')
          .eq('slug', potentialSlug)
          .single();

        if (!error && platform) {
          // Handle /{slug}/map - Platform map view
          if (subPath === 'map') {
            const description = platform.description
              ? escapeHtml(platform.description.slice(0, 155)) + (platform.description.length > 155 ? '...' : '')
              : `Explore the interactive map of ${escapeHtml(platform.name)}. Discover churches, ministry areas, and community impact across the region.`;

            return {
              title: `${escapeHtml(platform.name)} Map | The Church Map`,
              description,
              image: `${ogImageBase}?type=platform&slug=${platform.slug}`,
              url: `${baseUrl}/${platform.slug}/map`,
              type: 'website',
            };
          }
          
          // Handle /{slug}/community/{postId} - Individual community post
          const postId = pathSegments[2];
          if (subPath === 'community' && postId) {
            const postOgTags = await getPostOGMeta(supabase, postId, platform, baseUrl, ogImageBase);
            if (postOgTags) return postOgTags;
          }

          // Handle /{slug}/community - explicit community page
          if (subPath === 'community') {
            const description = `Join the ${escapeHtml(platform.name)} community on The Church Map. Connect with local churches, share prayer requests, and collaborate on ministry initiatives.`;

            return {
              title: `${escapeHtml(platform.name)} Community | The Church Map`,
              description,
              image: `${ogImageBase}?type=community&slug=${platform.slug}`,
              url: `${baseUrl}/${platform.slug}/community`,
              type: 'website',
            };
          }
          
          // Handle /{slug} - Platform landing (community) page
          const description = `Join the ${escapeHtml(platform.name)} community on The Church Map. Connect with local churches, share prayer requests, and collaborate on ministry initiatives.`;

          return {
            title: `${escapeHtml(platform.name)} Community | The Church Map`,
            description,
            image: `${ogImageBase}?type=community&slug=${platform.slug}`,
            url: `${baseUrl}/${platform.slug}`,
            type: 'website',
          };
        }
      } catch (err) {
        console.error('Error fetching platform for path-based OG meta:', err);
      }
    }
  }

  // Check for platform query param on home page (e.g., /?platform=slug or /?platform=uuid)
  const platformQueryParam = queryParams.get('platform');
  if (pathname === '/' && platformQueryParam) {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(platformQueryParam);
    try {
      const supabase = supabaseServer();
      // Support both UUID and slug lookups
      const { data: platform, error } = await supabase
        .from('city_platforms')
        .select('id, name, slug, description')
        .eq(isUUID ? 'id' : 'slug', platformQueryParam)
        .single();

      if (!error && platform) {
        const description = platform.description
          ? escapeHtml(platform.description.slice(0, 155)) + (platform.description.length > 155 ? '...' : '')
          : `Discover churches and ministry opportunities in ${escapeHtml(platform.name)}. Join our community of faith-based organizations working together for community impact.`;

        return {
          title: `${escapeHtml(platform.name)} | The Church Map`,
          description,
          image: `${ogImageBase}?type=platform&slug=${platform.slug}`,
          url: `${baseUrl}/?platform=${platform.slug}`,
          type: 'website',
        };
      }
    } catch (err) {
      console.error('Error fetching platform for OG meta (query param):', err);
    }
  }

  if (pathname === '/') {
    return {
      title: 'The Church Map - Discover Churches in Your Area',
      description: 'Connect with faith communities, explore ministry callings, and strengthen community impact through geospatial discovery. Find churches near you and explore their ministry areas.',
      image: `${ogImageBase}?type=home`,
      url: `${baseUrl}/`,
      type: 'website',
    };
  }

  if (pathname === '/explore') {
    const showLds = queryParams.get('showLds');
    const showChurches = queryParams.get('showChurches');
    const isLdsExcluded = showLds === 'false';
    const isChurchesShown = showChurches === 'true';
    
    let title = 'The Church Map - Explore City Platforms';
    let description = 'Explore faith community networks across America. Discover city platforms and connect with churches working together for community impact.';
    
    if (isChurchesShown && isLdsExcluded) {
      title = 'The Church Map - All Churches (Non-LDS)';
      description = 'Explore 240,000+ churches across America, excluding LDS/Mormon congregations. Interactive map view.';
    } else if (isChurchesShown) {
      title = 'The Church Map - All 240K+ US Churches';
      description = 'Explore over 240,000 churches across America on an interactive map. Discover faith communities near you.';
    } else if (isLdsExcluded) {
      title = 'The Church Map - Explore Platforms (Non-LDS)';
      description = 'Explore faith community networks across America, excluding LDS/Mormon congregations.';
    }
    
    const imageParams = new URLSearchParams();
    imageParams.set('type', 'explore');
    if (isChurchesShown) imageParams.set('showChurches', 'true');
    if (isLdsExcluded) imageParams.set('showLds', 'false');
    
    const pageParams = new URLSearchParams();
    if (isChurchesShown) pageParams.set('showChurches', 'true');
    if (isLdsExcluded) pageParams.set('showLds', 'false');
    
    const pageUrl = pageParams.toString() 
      ? `${baseUrl}/explore?${pageParams.toString()}`
      : `${baseUrl}/explore`;
    
    return {
      title,
      description,
      image: `${ogImageBase}?${imageParams.toString()}`,
      url: pageUrl,
      type: 'website',
    };
  }

  if (pathname === '/about') {
    return {
      title: 'About The Church Map - Connecting Churches for Community Impact',
      description: 'A geospatial platform helping churches discover collaboration opportunities, share resources, and strengthen their collective ministry impact across cities.',
      image: `${ogImageBase}?type=about`,
      url: `${baseUrl}/about`,
      type: 'website',
    };
  }

  // Community page with platform context
  if (pathname === '/community') {
    const platformParam = queryParams.get('platform');
    if (platformParam) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(platformParam);
      try {
        const supabase = supabaseServer();
        const { data: platform, error } = await supabase
          .from('city_platforms')
          .select('id, name, slug, description')
          .eq(isUUID ? 'id' : 'slug', platformParam)
          .single();

        if (!error && platform) {
          const description = `Join the ${escapeHtml(platform.name)} community on The Church Map. Connect with local churches, share prayer requests, and collaborate on ministry initiatives.`;

          return {
            title: `${escapeHtml(platform.name)} Community | The Church Map`,
            description,
            image: `${ogImageBase}?type=community&slug=${platform.slug}`,
            url: `${baseUrl}/community?platform=${platform.slug}`,
            type: 'website',
          };
        }
      } catch (err) {
        console.error('Error fetching platform for community OG meta:', err);
      }
    }
    
    // National community (no platform context)
    return {
      title: 'Community Threads | The Church Map',
      description: 'Join the national church community. Share updates, prayer requests, and connect with faith communities across America.',
      image: `${ogImageBase}?type=explore`,
      url: `${baseUrl}/community`,
      type: 'website',
    };
  }

  // Mission Funding page (active partner page) - /churches/:id/mission-funding
  const missionFundingMatch = pathname.match(/^\/churches\/([a-f0-9-]+)\/mission-funding$/i);
  if (missionFundingMatch) {
    const churchId = missionFundingMatch[1];
    try {
      const supabase = supabaseServer();
      const { data: church, error } = await supabase
        .from('churches')
        .select('id, name, city, state')
        .eq('id', churchId)
        .single();

      if (error || !church) {
        return null;
      }

      const location = [church.city, church.state].filter(Boolean).join(', ');

      return {
        title: `Buy or Sell a Home. Support ${escapeHtml(church.name)}'s Mission | The Church Map`,
        description: `Support ${escapeHtml(church.name)}${location ? ` in ${location}` : ''} through real estate. A portion of the commission funds their ministry—at no extra cost to you.`,
        image: `${ogImageBase}?type=mission-funding&id=${churchId}`,
        url: `${baseUrl}/churches/${churchId}/mission-funding`,
        type: 'website',
      };
    } catch (err) {
      console.error('Error fetching church for Mission Funding OG meta:', err);
      return null;
    }
  }

  // Fund the Mission page - must check before generic church match
  const fundMissionMatch = pathname.match(/^\/church\/([a-f0-9-]+)\/fund-the-mission$/i);
  if (fundMissionMatch) {
    const churchId = fundMissionMatch[1];
    try {
      const supabase = supabaseServer();
      const { data: church, error } = await supabase
        .from('churches')
        .select('id, name, city, state')
        .eq('id', churchId)
        .single();

      if (error || !church) {
        return null;
      }

      const location = [church.city, church.state].filter(Boolean).join(', ');

      return {
        title: `Unlock Mission Funding for ${escapeHtml(church.name)} | The Church Map`,
        description: `Support ${escapeHtml(church.name)}${location ? ` in ${location}` : ''} through real estate referrals. Every home sale contributes up to 30% commission to their ministry impact.`,
        image: `${ogImageBase}?type=fund-mission&id=${churchId}`,
        url: `${baseUrl}/church/${churchId}/fund-the-mission`,
        type: 'website',
      };
    } catch (err) {
      console.error('Error fetching church for Fund Mission OG meta:', err);
      return null;
    }
  }

  const churchMatch = pathname.match(/^\/church\/([a-f0-9-]+)/i);
  if (churchMatch) {
    const churchId = churchMatch[1];
    try {
      const supabase = supabaseServer();
      const { data: church, error } = await supabase
        .from('churches')
        .select('id, name, city, state, denomination, description')
        .eq('id', churchId)
        .single();

      if (error || !church) {
        return null;
      }

      const location = [church.city, church.state].filter(Boolean).join(', ');
      const description = church.description
        ? escapeHtml(church.description.slice(0, 155)) + (church.description.length > 155 ? '...' : '')
        : `Discover ${escapeHtml(church.name)} on The Church Map. ${location ? `Located in ${location}. ` : ''}Explore their ministry callings and connect with their community.`;

      return {
        title: `${escapeHtml(church.name)}${location ? ` - ${location}` : ''} | The Church Map`,
        description,
        image: `${ogImageBase}?type=church&id=${churchId}`,
        url: `${baseUrl}/church/${churchId}`,
        type: 'profile',
      };
    } catch (err) {
      console.error('Error fetching church for OG meta:', err);
      return null;
    }
  }

  const platformMatch = pathname.match(/^\/platform\/([a-zA-Z0-9_-]+)/i);
  if (platformMatch) {
    const platformIdentifier = platformMatch[1];
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(platformIdentifier);
    
    try {
      const supabase = supabaseServer();
      const { data: platform, error } = await supabase
        .from('city_platforms')
        .select('id, name, slug, description')
        .eq(isUUID ? 'id' : 'slug', platformIdentifier)
        .single();

      if (error || !platform) {
        return null;
      }

      const description = platform.description
        ? escapeHtml(platform.description.slice(0, 155)) + (platform.description.length > 155 ? '...' : '')
        : `Discover churches and ministry opportunities in ${escapeHtml(platform.name)}. Join our community of faith-based organizations working together for community impact.`;

      return {
        title: `${escapeHtml(platform.name)} | The Church Map`,
        description,
        image: `${ogImageBase}?type=platform&slug=${platform.slug}`,
        url: `${baseUrl}/platform/${platform.slug}`,
        type: 'website',
      };
    } catch (err) {
      console.error('Error fetching platform for OG meta:', err);
      return null;
    }
  }

  return null;
}

export function injectOGMetaTags(html: string, tags: OGMetaTags): string {
  const metaHTML = generateMetaTagsHTML(tags);
  
  const updatedTitle = `<title>${tags.title}</title>`;
  const updatedDescription = `<meta name="description" content="${tags.description}" />`;
  
  let result = html;
  
  result = result.replace(/<title>.*?<\/title>/, updatedTitle);
  
  result = result.replace(
    /<meta name="description"[^>]*>/,
    updatedDescription
  );
  
  const headEndIndex = result.indexOf('</head>');
  if (headEndIndex !== -1) {
    result = result.slice(0, headEndIndex) + metaHTML + result.slice(headEndIndex);
  }
  
  return result;
}
