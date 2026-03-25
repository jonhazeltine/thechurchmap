import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { supabaseServer } from '../../lib/supabaseServer';
import {
  getExploreMapUrl,
  getPlatformMapUrl,
  getChurchMapUrl,
  getJourneyMapUrl,
  getStaticMapUrl
} from './mapbox-static';

const OG_WIDTH = 1200;

// Cache for fetched map images (base64 data URLs)
const mapImageCache = new Map<string, string>();

/**
 * Fetch an image URL and convert to base64 data URL for Satori
 * Satori cannot load external URLs directly - needs base64 data
 */
async function fetchImageAsBase64(url: string): Promise<string | null> {
  if (!url) return null;
  
  // Check cache first
  if (mapImageCache.has(url)) {
    return mapImageCache.get(url)!;
  }
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error('Failed to fetch image:', response.status, url.slice(0, 100));
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const contentType = response.headers.get('content-type') || 'image/png';
    const dataUrl = `data:${contentType};base64,${base64}`;
    
    // Cache the result (limit cache size)
    if (mapImageCache.size > 100) {
      const firstKey = mapImageCache.keys().next().value;
      if (firstKey) mapImageCache.delete(firstKey);
    }
    mapImageCache.set(url, dataUrl);
    
    return dataUrl;
  } catch (error) {
    console.error('Error fetching image as base64:', error);
    return null;
  }
}
const OG_HEIGHT = 630;

const BRAND_COLORS = {
  primary: '#4F46E5',
  primaryDark: '#3730A3',
  background: '#F8FAFC',
  backgroundDark: '#0F172A',
  text: '#1E293B',
  textLight: '#64748B',
  accent: '#8B5CF6',
  gold: '#F59E0B',
};

let interFontData: ArrayBuffer | null = null;
let interBoldFontData: ArrayBuffer | null = null;

async function loadFonts(): Promise<{ regular: ArrayBuffer; bold: ArrayBuffer }> {
  if (interFontData && interBoldFontData) {
    return { regular: interFontData, bold: interBoldFontData };
  }
  
  const regularResponse = await fetch(
    'https://fonts.cdnfonts.com/s/19795/Inter-Regular.woff'
  );
  
  const boldResponse = await fetch(
    'https://fonts.cdnfonts.com/s/19795/Inter-Bold.woff'
  );
  
  if (!regularResponse.ok || !boldResponse.ok) {
    const fallbackRegular = await fetch(
      'https://og-playground.vercel.app/inter-latin-ext-400-normal.woff'
    );
    const fallbackBold = await fetch(
      'https://og-playground.vercel.app/inter-latin-ext-700-normal.woff'
    );
    interFontData = await fallbackRegular.arrayBuffer();
    interBoldFontData = await fallbackBold.arrayBuffer();
  } else {
    interFontData = await regularResponse.arrayBuffer();
    interBoldFontData = await boldResponse.arrayBuffer();
  }
  
  return { regular: interFontData!, bold: interBoldFontData! };
}

async function renderToImage(element: any): Promise<Buffer> {
  const fonts = await loadFonts();
  
  const svg = await satori(element, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: [
      {
        name: 'Inter',
        data: fonts.regular,
        weight: 400,
        style: 'normal',
      },
      {
        name: 'Inter',
        data: fonts.bold,
        weight: 600,
        style: 'normal',
      },
      {
        name: 'Inter',
        data: fonts.bold,
        weight: 700,
        style: 'normal',
      },
    ],
  });

  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: OG_WIDTH,
    },
  });
  
  return resvg.render().asPng();
}

function createGradientBackground() {
  return {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '100%',
    height: '100%',
    background: `linear-gradient(135deg, ${BRAND_COLORS.primaryDark} 0%, ${BRAND_COLORS.primary} 50%, ${BRAND_COLORS.accent} 100%)`,
  };
}

function createLogoSection() {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  };
}

export async function generateHomeOGImage(): Promise<Buffer> {
  // Fetch US map with church pins as background
  const mapUrl = getExploreMapUrl(true); // Show churches on map
  const mapImageBase64 = await fetchImageAsBase64(mapUrl);

  const element = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        width: OG_WIDTH,
        height: OG_HEIGHT,
        position: 'relative',
      },
      children: [
        // Map background image (if available)
        mapImageBase64 ? {
          type: 'img',
          props: {
            src: mapImageBase64,
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            },
          },
        } : null,
        // Gradient overlay for text readability
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: mapImageBase64
                ? 'linear-gradient(135deg, rgba(30, 64, 175, 0.35) 0%, rgba(59, 130, 246, 0.25) 50%, rgba(30, 64, 175, 0.35) 100%)'
                : `linear-gradient(135deg, ${BRAND_COLORS.primaryDark} 0%, ${BRAND_COLORS.primary} 50%, ${BRAND_COLORS.accent} 100%)`,
            },
          },
        },
        // Content overlay
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              padding: '60px',
              justifyContent: 'space-between',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: createLogoSection(),
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          width: '64px',
                          height: '64px',
                          backgroundColor: 'white',
                          borderRadius: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '32px',
                        },
                        children: '🗺️',
                      },
                    },
                    {
                      type: 'span',
                      props: {
                        style: {
                          color: 'white',
                          fontSize: '28px',
                          fontWeight: 600,
                        },
                        children: 'The Church Map',
                      },
                    },
                  ],
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '24px',
                  },
                  children: [
                    {
                      type: 'h1',
                      props: {
                        style: {
                          color: 'white',
                          fontSize: '64px',
                          fontWeight: 700,
                          lineHeight: 1.1,
                          margin: 0,
                        },
                        children: 'Discover Churches',
                      },
                    },
                    {
                      type: 'h1',
                      props: {
                        style: {
                          color: 'rgba(255,255,255,0.9)',
                          fontSize: '64px',
                          fontWeight: 700,
                          lineHeight: 1.1,
                          margin: 0,
                        },
                        children: 'In Your Area',
                      },
                    },
                    {
                      type: 'p',
                      props: {
                        style: {
                          color: 'rgba(255,255,255,0.8)',
                          fontSize: '24px',
                          margin: 0,
                          maxWidth: '700px',
                        },
                        children: 'Connect with faith communities, explore ministry callings, and strengthen community impact through geospatial discovery.',
                      },
                    },
                  ],
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '32px',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          color: 'rgba(255,255,255,0.9)',
                          fontSize: '18px',
                        },
                        children: [
                          { type: 'span', props: { children: '📍' } },
                          { type: 'span', props: { children: 'Interactive Map' } },
                        ],
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          color: 'rgba(255,255,255,0.9)',
                          fontSize: '18px',
                        },
                        children: [
                          { type: 'span', props: { children: '🤝' } },
                          { type: 'span', props: { children: 'Find Collaborators' } },
                        ],
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          color: 'rgba(255,255,255,0.9)',
                          fontSize: '18px',
                        },
                        children: [
                          { type: 'span', props: { children: '🙏' } },
                          { type: 'span', props: { children: 'Prayer Network' } },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  };

  return renderToImage(element);
}

export async function generateExploreOGImage(options?: { showChurches?: boolean; showLds?: boolean }): Promise<Buffer> {
  const showChurches = options?.showChurches ?? false;
  const showLds = options?.showLds ?? true;
  
  let subtitle = 'Explore City Platforms';
  if (showChurches && !showLds) {
    subtitle = 'All Churches (Non-LDS)';
  } else if (showChurches) {
    subtitle = 'All 240K+ US Churches';
  } else if (!showLds) {
    subtitle = 'Platforms (Non-LDS)';
  }

  // Get static map URL and fetch as base64 for Satori
  const mapUrl = getExploreMapUrl(showChurches);
  const mapImageBase64 = await fetchImageAsBase64(mapUrl);

  const element = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        width: OG_WIDTH,
        height: OG_HEIGHT,
        position: 'relative',
      },
      children: [
        // Map background image (only if we successfully fetched it)
        mapImageBase64 ? {
          type: 'img',
          props: {
            src: mapImageBase64,
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            },
          },
        } : null,
        // Dark overlay/gradient for text readability
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: mapImageBase64 
                ? 'linear-gradient(135deg, rgba(30, 64, 175, 0.35) 0%, rgba(59, 130, 246, 0.25) 50%, rgba(30, 64, 175, 0.35) 100%)'
                : `linear-gradient(135deg, ${BRAND_COLORS.primaryDark} 0%, ${BRAND_COLORS.primary} 50%, ${BRAND_COLORS.accent} 100%)`,
            },
          },
        },
        // Content overlay
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              padding: '60px',
              justifyContent: 'space-between',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: createLogoSection(),
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          width: '64px',
                          height: '64px',
                          backgroundColor: 'white',
                          borderRadius: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '32px',
                        },
                        children: '🌎',
                      },
                    },
                    {
                      type: 'span',
                      props: {
                        style: {
                          color: 'white',
                          fontSize: '28px',
                          fontWeight: 600,
                        },
                        children: 'The Church Map',
                      },
                    },
                  ],
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px',
                  },
                  children: [
                    {
                      type: 'h1',
                      props: {
                        style: {
                          color: 'white',
                          fontSize: '72px',
                          fontWeight: 700,
                          lineHeight: 1.1,
                          margin: 0,
                        },
                        children: 'Explore',
                      },
                    },
                    {
                      type: 'h2',
                      props: {
                        style: {
                          color: 'rgba(255,255,255,0.95)',
                          fontSize: '48px',
                          fontWeight: 600,
                          lineHeight: 1.1,
                          margin: 0,
                        },
                        children: subtitle,
                      },
                    },
                    {
                      type: 'p',
                      props: {
                        style: {
                          color: 'rgba(255,255,255,0.9)',
                          fontSize: '22px',
                          margin: 0,
                          maxWidth: '700px',
                        },
                        children: 'Discover faith communities across America. Interactive map with city networks and church locations.',
                      },
                    },
                  ],
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '32px',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          backgroundColor: 'rgba(255,255,255,0.2)',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          color: 'white',
                          fontSize: '18px',
                        },
                        children: [
                          { type: 'span', props: { children: '🗺️' } },
                          { type: 'span', props: { children: 'Interactive Map' } },
                        ],
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          backgroundColor: 'rgba(255,255,255,0.2)',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          color: 'white',
                          fontSize: '18px',
                        },
                        children: [
                          { type: 'span', props: { children: '🏛️' } },
                          { type: 'span', props: { children: 'City Platforms' } },
                        ],
                      },
                    },
                    showChurches ? {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          backgroundColor: 'rgba(255,255,255,0.2)',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          color: 'white',
                          fontSize: '18px',
                        },
                        children: [
                          { type: 'span', props: { children: '⛪' } },
                          { type: 'span', props: { children: '240K+ Churches' } },
                        ],
                      },
                    } : null,
                  ].filter(Boolean),
                },
              },
            ],
          },
        },
      ],
    },
  };

  return renderToImage(element);
}

export async function generateChurchOGImage(churchId: string): Promise<Buffer | null> {
  try {
    const supabase = supabaseServer();
    
    const { data: church, error } = await supabase
      .from('churches')
      .select('id, name, city, state, denomination, description, location')
      .eq('id', churchId)
      .single();
    
    if (error || !church) {
      console.error('Error fetching church for OG image:', error);
      return null;
    }

    const { data: callings } = await supabase
      .from('church_calling')
      .select('callings:calling_id(name)')
      .eq('church_id', churchId)
      .limit(3);

    const callingNames = (callings || [])
      .map((c: any) => c.callings?.name)
      .filter(Boolean)
      .slice(0, 3);

    const location = [church.city, church.state].filter(Boolean).join(', ');
    const description = church.description 
      ? church.description.slice(0, 100) + (church.description.length > 100 ? '...' : '')
      : 'Discover this church on The Church Map.';

    // Get static map URL if we have coordinates and fetch as base64
    // location is a GeoJSON Point with coordinates [longitude, latitude]
    const loc = church.location as { type: string; coordinates: [number, number] } | null;
    const hasCoords = loc && loc.coordinates && loc.coordinates.length >= 2;
    let mapImageBase64: string | null = null;
    if (hasCoords) {
      const mapUrl = getChurchMapUrl(loc.coordinates[0], loc.coordinates[1]);
      mapImageBase64 = await fetchImageAsBase64(mapUrl);
    }

    const element = {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          width: OG_WIDTH,
          height: OG_HEIGHT,
          position: 'relative',
        },
        children: [
          // Map background image (if available)
          mapImageBase64 ? {
            type: 'img',
            props: {
              src: mapImageBase64,
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              },
            },
          } : null,
          // Dark overlay for text readability
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                background: mapImageBase64 
                  ? 'linear-gradient(135deg, rgba(79, 70, 229, 0.4) 0%, rgba(55, 48, 163, 0.35) 50%, rgba(79, 70, 229, 0.4) 100%)'
                  : `linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, ${BRAND_COLORS.primaryDark} 50%, ${BRAND_COLORS.primary} 100%)`,
              },
            },
          },
          // Content overlay
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                padding: '60px',
                justifyContent: 'space-between',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: createLogoSection(),
                          children: [
                            {
                              type: 'div',
                              props: {
                                style: {
                                  width: '48px',
                                  height: '48px',
                                  backgroundColor: 'white',
                                  borderRadius: '8px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '24px',
                                },
                                children: '🗺️',
                              },
                            },
                            {
                              type: 'span',
                              props: {
                                style: {
                                  color: 'rgba(255,255,255,0.9)',
                                  fontSize: '20px',
                                  fontWeight: 600,
                                },
                                children: 'The Church Map',
                              },
                            },
                          ],
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            backgroundColor: 'rgba(255,255,255,0.2)',
                            padding: '8px 16px',
                            borderRadius: '20px',
                            color: 'white',
                            fontSize: '14px',
                          },
                          children: 'Church Profile',
                        },
                      },
                    ],
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '40px',
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            width: '120px',
                            height: '120px',
                            backgroundColor: 'rgba(255,255,255,0.2)',
                            borderRadius: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '48px',
                          },
                          children: '⛪',
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                            flex: 1,
                          },
                          children: [
                            {
                              type: 'h1',
                              props: {
                                style: {
                                  color: 'white',
                                  fontSize: '48px',
                                  fontWeight: 700,
                                  margin: 0,
                                  lineHeight: 1.2,
                                },
                                children: church.name,
                              },
                            },
                            location ? {
                              type: 'div',
                              props: {
                                style: {
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  color: 'rgba(255,255,255,0.95)',
                                  fontSize: '22px',
                                },
                                children: [
                                  { type: 'span', props: { children: '📍' } },
                                  { type: 'span', props: { children: location } },
                                ],
                              },
                            } : null,
                            church.denomination ? {
                              type: 'div',
                              props: {
                                style: {
                                  color: 'rgba(255,255,255,0.8)',
                                  fontSize: '18px',
                                },
                                children: church.denomination,
                              },
                            } : null,
                          ].filter(Boolean),
                        },
                      },
                    ],
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '16px',
                    },
                    children: [
                      {
                        type: 'p',
                        props: {
                          style: {
                            color: 'rgba(255,255,255,0.9)',
                            fontSize: '20px',
                            margin: 0,
                            maxWidth: '800px',
                            lineHeight: 1.4,
                          },
                          children: description,
                        },
                      },
                      callingNames.length > 0 ? {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            gap: '12px',
                            flexWrap: 'wrap',
                          },
                          children: callingNames.map((name: string) => ({
                            type: 'div',
                            props: {
                              style: {
                                backgroundColor: 'rgba(255,255,255,0.2)',
                                padding: '8px 16px',
                                borderRadius: '20px',
                                color: 'white',
                                fontSize: '14px',
                              },
                              children: name,
                            },
                          })),
                        },
                      } : null,
                    ].filter(Boolean),
                  },
                },
              ],
            },
          },
        ].filter(Boolean),
      },
    };

    return renderToImage(element);
  } catch (error) {
    console.error('Error generating church OG image:', error);
    return null;
  }
}

export async function generateAboutOGImage(): Promise<Buffer> {
  const element = {
    type: 'div',
    props: {
      style: {
        ...createGradientBackground(),
        background: `linear-gradient(135deg, ${BRAND_COLORS.backgroundDark} 0%, #1E293B 50%, ${BRAND_COLORS.primaryDark} 100%)`,
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              padding: '60px',
              height: '100%',
              justifyContent: 'space-between',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: createLogoSection(),
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          width: '64px',
                          height: '64px',
                          backgroundColor: BRAND_COLORS.primary,
                          borderRadius: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '32px',
                        },
                        children: '🗺️',
                      },
                    },
                    {
                      type: 'span',
                      props: {
                        style: {
                          color: 'white',
                          fontSize: '28px',
                          fontWeight: 600,
                        },
                        children: 'The Church Map',
                      },
                    },
                  ],
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px',
                  },
                  children: [
                    {
                      type: 'h1',
                      props: {
                        style: {
                          color: 'white',
                          fontSize: '56px',
                          fontWeight: 700,
                          lineHeight: 1.1,
                          margin: 0,
                        },
                        children: 'Connecting Churches',
                      },
                    },
                    {
                      type: 'h1',
                      props: {
                        style: {
                          color: BRAND_COLORS.gold,
                          fontSize: '56px',
                          fontWeight: 700,
                          lineHeight: 1.1,
                          margin: 0,
                        },
                        children: 'For Community Impact',
                      },
                    },
                    {
                      type: 'p',
                      props: {
                        style: {
                          color: 'rgba(255,255,255,0.7)',
                          fontSize: '22px',
                          margin: 0,
                          maxWidth: '700px',
                          lineHeight: 1.4,
                        },
                        children: 'A geospatial platform helping churches discover collaboration opportunities, share resources, and strengthen their collective ministry impact.',
                      },
                    },
                  ],
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    gap: '40px',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                        },
                        children: [
                          {
                            type: 'span',
                            props: {
                              style: { color: BRAND_COLORS.gold, fontSize: '32px', fontWeight: 700 },
                              children: '500+',
                            },
                          },
                          {
                            type: 'span',
                            props: {
                              style: { color: 'rgba(255,255,255,0.6)', fontSize: '16px' },
                              children: 'Churches',
                            },
                          },
                        ],
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                        },
                        children: [
                          {
                            type: 'span',
                            props: {
                              style: { color: BRAND_COLORS.gold, fontSize: '32px', fontWeight: 700 },
                              children: '50+',
                            },
                          },
                          {
                            type: 'span',
                            props: {
                              style: { color: 'rgba(255,255,255,0.6)', fontSize: '16px' },
                              children: 'Ministry Callings',
                            },
                          },
                        ],
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                        },
                        children: [
                          {
                            type: 'span',
                            props: {
                              style: { color: BRAND_COLORS.gold, fontSize: '32px', fontWeight: 700 },
                              children: '10+',
                            },
                          },
                          {
                            type: 'span',
                            props: {
                              style: { color: 'rgba(255,255,255,0.6)', fontSize: '16px' },
                              children: 'City Platforms',
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  };

  return renderToImage(element);
}

function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export async function generatePlatformOGImage(platformIdentifier: string): Promise<Buffer | null> {
  try {
    const supabase = supabaseServer();
    
    const isIdLookup = isUUID(platformIdentifier);
    const { data: platform, error } = await supabase
      .from('city_platforms')
      .select('id, name, slug, description, default_center_lat, default_center_lng')
      .eq(isIdLookup ? 'id' : 'slug', platformIdentifier)
      .single();
    
    if (error || !platform) {
      console.error('Error fetching platform for OG image:', error);
      return null;
    }

    const { count: churchCount } = await supabase
      .from('city_platform_churches')
      .select('*', { count: 'exact', head: true })
      .eq('city_platform_id', platform.id);

    const description = platform.description 
      ? platform.description.slice(0, 120) + (platform.description.length > 120 ? '...' : '')
      : `Discover churches and ministry opportunities in ${platform.name}.`;

    // Get static map URL if we have coordinates and fetch as base64
    const hasCoords = platform.default_center_lat && platform.default_center_lng;
    let mapImageBase64: string | null = null;
    if (hasCoords) {
      const mapUrl = getPlatformMapUrl(platform.default_center_lng, platform.default_center_lat);
      mapImageBase64 = await fetchImageAsBase64(mapUrl);
    }

    const element = {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          width: OG_WIDTH,
          height: OG_HEIGHT,
          position: 'relative',
        },
        children: [
          // Map background image (if available)
          mapImageBase64 ? {
            type: 'img',
            props: {
              src: mapImageBase64,
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              },
            },
          } : null,
          // Gradient overlay for text readability
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                background: mapImageBase64
                  ? 'linear-gradient(135deg, rgba(5, 150, 105, 0.4) 0%, rgba(16, 185, 129, 0.35) 50%, rgba(5, 150, 105, 0.4) 100%)'
                  : 'linear-gradient(135deg, #059669 0%, #10B981 50%, #34D399 100%)',
              },
            },
          },
          // Content overlay
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                padding: '60px',
                justifyContent: 'space-between',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: createLogoSection(),
                          children: [
                            {
                              type: 'div',
                              props: {
                                style: {
                                  width: '48px',
                                  height: '48px',
                                  backgroundColor: 'white',
                                  borderRadius: '8px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '24px',
                                },
                                children: '🗺️',
                              },
                            },
                            {
                              type: 'span',
                              props: {
                                style: {
                                  color: 'rgba(255,255,255,0.95)',
                                  fontSize: '20px',
                                  fontWeight: 600,
                                },
                                children: 'The Church Map',
                              },
                            },
                          ],
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            backgroundColor: 'rgba(255,255,255,0.2)',
                            padding: '8px 16px',
                            borderRadius: '20px',
                            color: 'white',
                            fontSize: '14px',
                          },
                          children: 'City Platform',
                        },
                      },
                    ],
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '20px',
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px',
                          },
                          children: [
                            {
                              type: 'div',
                              props: {
                                style: {
                                  width: '80px',
                                  height: '80px',
                                  backgroundColor: 'rgba(255,255,255,0.2)',
                                  borderRadius: '16px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '40px',
                                },
                                children: '🏙️',
                              },
                            },
                            {
                              type: 'h1',
                              props: {
                                style: {
                                  color: 'white',
                                  fontSize: '56px',
                                  fontWeight: 700,
                                  margin: 0,
                                  lineHeight: 1.1,
                                },
                                children: platform.name,
                              },
                            },
                          ],
                        },
                      },
                      {
                        type: 'p',
                        props: {
                          style: {
                            color: 'rgba(255,255,255,0.95)',
                            fontSize: '24px',
                            margin: 0,
                            maxWidth: '800px',
                            lineHeight: 1.4,
                          },
                          children: description,
                        },
                      },
                    ],
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      gap: '40px',
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            backgroundColor: 'rgba(255,255,255,0.2)',
                            padding: '12px 24px',
                            borderRadius: '12px',
                          },
                          children: [
                            { type: 'span', props: { style: { fontSize: '24px' }, children: '⛪' } },
                            {
                              type: 'span',
                              props: {
                                style: { color: 'white', fontSize: '20px', fontWeight: 600 },
                                children: `${churchCount || 0} Churches`,
                              },
                            },
                          ],
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            backgroundColor: 'rgba(255,255,255,0.2)',
                            padding: '12px 24px',
                            borderRadius: '12px',
                          },
                          children: [
                            { type: 'span', props: { style: { fontSize: '24px' }, children: '🙏' } },
                            {
                              type: 'span',
                              props: {
                                style: { color: 'white', fontSize: '20px', fontWeight: 600 },
                                children: 'Prayer Network',
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ].filter(Boolean),
      },
    };

    return renderToImage(element);
  } catch (error) {
    console.error('Error generating platform OG image:', error);
    return null;
  }
}

export async function generateCommunityOGImage(platformIdentifier: string): Promise<Buffer | null> {
  try {
    const supabase = supabaseServer();
    
    const isIdLookup = isUUID(platformIdentifier);
    const { data: platform, error } = await supabase
      .from('city_platforms')
      .select('id, name, slug, description, default_center_lat, default_center_lng')
      .eq(isIdLookup ? 'id' : 'slug', platformIdentifier)
      .single();
    
    if (error || !platform) {
      console.error('Error fetching platform for community OG image:', error);
      return null;
    }

    const { count: churchCount } = await supabase
      .from('city_platform_churches')
      .select('*', { count: 'exact', head: true })
      .eq('city_platform_id', platform.id);

    // Get static map URL if we have coordinates and fetch as base64
    const hasCoords = platform.default_center_lat && platform.default_center_lng;
    let mapImageBase64: string | null = null;
    if (hasCoords) {
      const mapUrl = getPlatformMapUrl(platform.default_center_lng, platform.default_center_lat);
      mapImageBase64 = await fetchImageAsBase64(mapUrl);
    }

    const element = {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          width: OG_WIDTH,
          height: OG_HEIGHT,
          position: 'relative',
        },
        children: [
          // Map background image (if available)
          mapImageBase64 ? {
            type: 'img',
            props: {
              src: mapImageBase64,
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              },
            },
          } : null,
          // Purple/blue gradient overlay for community theme
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                background: mapImageBase64
                  ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.85) 0%, rgba(139, 92, 246, 0.8) 50%, rgba(168, 85, 247, 0.85) 100%)'
                  : 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #A855F7 100%)',
              },
            },
          },
          // Content overlay
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                padding: '60px',
                justifyContent: 'space-between',
              },
              children: [
                // Header with logo
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: createLogoSection(),
                          children: [
                            {
                              type: 'div',
                              props: {
                                style: {
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '48px',
                                  height: '48px',
                                  borderRadius: '12px',
                                  backgroundColor: 'white',
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                },
                                children: [
                                  {
                                    type: 'span',
                                    props: {
                                      style: { fontSize: '28px' },
                                      children: '⛪',
                                    },
                                  },
                                ],
                              },
                            },
                            {
                              type: 'span',
                              props: {
                                style: {
                                  color: 'white',
                                  fontSize: '24px',
                                  fontWeight: 600,
                                  textShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                },
                                children: 'The Church Map',
                              },
                            },
                          ],
                        },
                      },
                      // Community badge
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: 'rgba(255,255,255,0.25)',
                            padding: '10px 20px',
                            borderRadius: '24px',
                          },
                          children: [
                            { type: 'span', props: { style: { fontSize: '20px' }, children: '💬' } },
                            {
                              type: 'span',
                              props: {
                                style: { color: 'white', fontSize: '18px', fontWeight: 600 },
                                children: 'Community',
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                // Main content
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '24px',
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: { display: 'flex', flexDirection: 'column', gap: '12px' },
                          children: [
                            {
                              type: 'h1',
                              props: {
                                style: {
                                  color: 'white',
                                  fontSize: '64px',
                                  fontWeight: 700,
                                  margin: 0,
                                  textShadow: '0 4px 8px rgba(0,0,0,0.3)',
                                  lineHeight: 1.1,
                                },
                                children: platform.name,
                              },
                            },
                            {
                              type: 'p',
                              props: {
                                style: {
                                  color: 'rgba(255,255,255,0.9)',
                                  fontSize: '32px',
                                  fontWeight: 500,
                                  margin: 0,
                                  textShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                },
                                children: 'Community Threads',
                              },
                            },
                          ],
                        },
                      },
                      // Stats row
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            gap: '24px',
                          },
                          children: [
                            {
                              type: 'div',
                              props: {
                                style: {
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '12px',
                                  backgroundColor: 'rgba(255,255,255,0.2)',
                                  padding: '12px 24px',
                                  borderRadius: '12px',
                                },
                                children: [
                                  { type: 'span', props: { style: { fontSize: '24px' }, children: '⛪' } },
                                  {
                                    type: 'span',
                                    props: {
                                      style: { color: 'white', fontSize: '20px', fontWeight: 600 },
                                      children: `${churchCount || 0} Churches`,
                                    },
                                  },
                                ],
                              },
                            },
                            {
                              type: 'div',
                              props: {
                                style: {
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '12px',
                                  backgroundColor: 'rgba(255,255,255,0.2)',
                                  padding: '12px 24px',
                                  borderRadius: '12px',
                                },
                                children: [
                                  { type: 'span', props: { style: { fontSize: '24px' }, children: '🙏' } },
                                  {
                                    type: 'span',
                                    props: {
                                      style: { color: 'white', fontSize: '20px', fontWeight: 600 },
                                      children: 'Prayer Requests',
                                    },
                                  },
                                ],
                              },
                            },
                            {
                              type: 'div',
                              props: {
                                style: {
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '12px',
                                  backgroundColor: 'rgba(255,255,255,0.2)',
                                  padding: '12px 24px',
                                  borderRadius: '12px',
                                },
                                children: [
                                  { type: 'span', props: { style: { fontSize: '24px' }, children: '✨' } },
                                  {
                                    type: 'span',
                                    props: {
                                      style: { color: 'white', fontSize: '20px', fontWeight: 600 },
                                      children: 'Updates',
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ].filter(Boolean),
      },
    };

    return renderToImage(element);
  } catch (error) {
    console.error('Error generating community OG image:', error);
    return null;
  }
}

export async function generateFundMissionOGImage(churchId: string): Promise<Buffer | null> {
  try {
    const supabase = supabaseServer();
    const { data: church, error } = await supabase
      .from('churches')
      .select('id, name, city, state, profile_photo_url, banner_image_url, primary_calling')
      .eq('id', churchId)
      .single();

    if (error) {
      console.error('Supabase error for Fund Mission OG image:', error.message, 'churchId:', churchId);
      return null;
    }
    
    if (!church) {
      console.error('Church not found for Fund Mission OG image:', churchId);
      return null;
    }

    const location = [church.city, church.state].filter(Boolean).join(', ');
    
    // Try to get church logo as base64
    let logoBase64: string | null = null;
    if (church.profile_photo_url) {
      logoBase64 = await fetchImageAsBase64(church.profile_photo_url);
    }

    const element = {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          width: OG_WIDTH,
          height: OG_HEIGHT,
          position: 'relative',
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #334155 100%)',
        },
        children: [
          // Decorative pattern overlay
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(245, 158, 11, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(79, 70, 229, 0.2) 0%, transparent 50%)',
              },
            },
          },
          // Content
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                padding: '60px',
                justifyContent: 'space-between',
              },
              children: [
                // Top section: Logo and branding
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    },
                    children: [
                      // The Church Map branding
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                          },
                          children: [
                            {
                              type: 'div',
                              props: {
                                style: {
                                  width: '48px',
                                  height: '48px',
                                  backgroundColor: 'rgba(255,255,255,0.1)',
                                  borderRadius: '10px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '24px',
                                },
                                children: '🗺️',
                              },
                            },
                            {
                              type: 'span',
                              props: {
                                style: {
                                  color: 'rgba(255,255,255,0.7)',
                                  fontSize: '20px',
                                  fontWeight: 500,
                                },
                                children: 'The Church Map',
                              },
                            },
                          ],
                        },
                      },
                      // AARE Partnership badge
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: 'rgba(245, 158, 11, 0.2)',
                            padding: '8px 16px',
                            borderRadius: '20px',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                          },
                          children: [
                            {
                              type: 'span',
                              props: {
                                style: { fontSize: '16px' },
                                children: '🏠',
                              },
                            },
                            {
                              type: 'span',
                              props: {
                                style: {
                                  color: '#F59E0B',
                                  fontSize: '14px',
                                  fontWeight: 600,
                                },
                                children: 'AARE Partnership',
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                // Main content
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '24px',
                    },
                    children: [
                      // Church info row
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '20px',
                          },
                          children: [
                            // Church logo or fallback
                            logoBase64 ? {
                              type: 'img',
                              props: {
                                src: logoBase64,
                                style: {
                                  width: '80px',
                                  height: '80px',
                                  borderRadius: '16px',
                                  objectFit: 'cover',
                                  border: '3px solid rgba(255,255,255,0.2)',
                                },
                              },
                            } : {
                              type: 'div',
                              props: {
                                style: {
                                  width: '80px',
                                  height: '80px',
                                  borderRadius: '16px',
                                  backgroundColor: BRAND_COLORS.primary,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '32px',
                                  fontWeight: 700,
                                  color: 'white',
                                },
                                children: church.name.charAt(0).toUpperCase(),
                              },
                            },
                            // Church name and location
                            {
                              type: 'div',
                              props: {
                                style: {
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '4px',
                                },
                                children: [
                                  {
                                    type: 'h2',
                                    props: {
                                      style: {
                                        color: 'white',
                                        fontSize: '36px',
                                        fontWeight: 700,
                                        margin: 0,
                                        lineHeight: 1.2,
                                      },
                                      children: church.name.length > 35 
                                        ? church.name.slice(0, 35) + '...' 
                                        : church.name,
                                    },
                                  },
                                  location ? {
                                    type: 'p',
                                    props: {
                                      style: {
                                        color: 'rgba(255,255,255,0.6)',
                                        fontSize: '20px',
                                        margin: 0,
                                      },
                                      children: location,
                                    },
                                  } : null,
                                ].filter(Boolean),
                              },
                            },
                          ].filter(Boolean),
                        },
                      },
                      // Main headline
                      {
                        type: 'h1',
                        props: {
                          style: {
                            color: '#F59E0B',
                            fontSize: '56px',
                            fontWeight: 700,
                            lineHeight: 1.1,
                            margin: 0,
                          },
                          children: 'Unlock Mission Funding',
                        },
                      },
                      // Subheadline
                      {
                        type: 'p',
                        props: {
                          style: {
                            color: 'rgba(255,255,255,0.8)',
                            fontSize: '24px',
                            margin: 0,
                            maxWidth: '800px',
                            lineHeight: 1.4,
                          },
                          children: 'Support this church\'s mission through real estate activity. Every referral contributes to their ministry impact.',
                        },
                      },
                    ],
                  },
                },
                // Bottom section: Features
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      gap: '32px',
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            backgroundColor: 'rgba(255,255,255,0.1)',
                            padding: '12px 20px',
                            borderRadius: '10px',
                          },
                          children: [
                            { type: 'span', props: { style: { fontSize: '20px' }, children: '💰' } },
                            {
                              type: 'span',
                              props: {
                                style: { color: 'white', fontSize: '16px', fontWeight: 500 },
                                children: 'Up to 30% Commission',
                              },
                            },
                          ],
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            backgroundColor: 'rgba(255,255,255,0.1)',
                            padding: '12px 20px',
                            borderRadius: '10px',
                          },
                          children: [
                            { type: 'span', props: { style: { fontSize: '20px' }, children: '🏠' } },
                            {
                              type: 'span',
                              props: {
                                style: { color: 'white', fontSize: '16px', fontWeight: 500 },
                                children: 'Buy or Sell Referrals',
                              },
                            },
                          ],
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            backgroundColor: 'rgba(255,255,255,0.1)',
                            padding: '12px 20px',
                            borderRadius: '10px',
                          },
                          children: [
                            { type: 'span', props: { style: { fontSize: '20px' }, children: '❤️' } },
                            {
                              type: 'span',
                              props: {
                                style: { color: 'white', fontSize: '16px', fontWeight: 500 },
                                children: 'Fund Ministry Work',
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    };

    return renderToImage(element);
  } catch (error) {
    console.error('Error generating Fund Mission OG image:', error);
    return null;
  }
}

export async function generateMissionFundingOGImage(churchId: string): Promise<Buffer | null> {
  try {
    const supabase = supabaseServer();
    const { data: church, error } = await supabase
      .from('churches')
      .select('id, name, city, state, profile_photo_url, banner_image_url')
      .eq('id', churchId)
      .single();

    if (error) {
      console.error('Supabase error for Mission Funding OG image:', error.message, 'churchId:', churchId);
      return null;
    }
    
    if (!church) {
      console.error('Church not found for Mission Funding OG image:', churchId);
      return null;
    }

    const location = [church.city, church.state].filter(Boolean).join(', ');
    
    let logoBase64: string | null = null;
    if (church.profile_photo_url) {
      logoBase64 = await fetchImageAsBase64(church.profile_photo_url);
    }

    const element = {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          width: OG_WIDTH,
          height: OG_HEIGHT,
          position: 'relative',
          background: 'linear-gradient(135deg, #10B981 0%, #059669 50%, #047857 100%)',
        },
        children: [
          // Decorative pattern
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backgroundImage: 'radial-gradient(circle at 80% 20%, rgba(255,255,255,0.15) 0%, transparent 50%), radial-gradient(circle at 20% 80%, rgba(255,255,255,0.1) 0%, transparent 50%)',
              },
            },
          },
          // Content
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                padding: '60px',
                justifyContent: 'space-between',
              },
              children: [
                // Top: Branding
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                          },
                          children: [
                            {
                              type: 'div',
                              props: {
                                style: {
                                  width: '48px',
                                  height: '48px',
                                  backgroundColor: 'rgba(255,255,255,0.2)',
                                  borderRadius: '10px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '24px',
                                },
                                children: '🗺️',
                              },
                            },
                            {
                              type: 'span',
                              props: {
                                style: {
                                  color: 'rgba(255,255,255,0.9)',
                                  fontSize: '20px',
                                  fontWeight: 500,
                                },
                                children: 'The Church Map',
                              },
                            },
                          ],
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: 'rgba(255,255,255,0.2)',
                            padding: '8px 16px',
                            borderRadius: '20px',
                          },
                          children: [
                            { type: 'span', props: { style: { fontSize: '16px' }, children: '✓' } },
                            {
                              type: 'span',
                              props: {
                                style: { color: 'white', fontSize: '14px', fontWeight: 600 },
                                children: 'Active Partner',
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                // Main content
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '24px',
                    },
                    children: [
                      // Church info
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '20px',
                          },
                          children: [
                            logoBase64 ? {
                              type: 'img',
                              props: {
                                src: logoBase64,
                                style: {
                                  width: '80px',
                                  height: '80px',
                                  borderRadius: '16px',
                                  objectFit: 'cover',
                                  border: '3px solid rgba(255,255,255,0.3)',
                                },
                              },
                            } : {
                              type: 'div',
                              props: {
                                style: {
                                  width: '80px',
                                  height: '80px',
                                  borderRadius: '16px',
                                  backgroundColor: 'rgba(255,255,255,0.2)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '32px',
                                  fontWeight: 700,
                                  color: 'white',
                                },
                                children: church.name.charAt(0).toUpperCase(),
                              },
                            },
                            {
                              type: 'div',
                              props: {
                                style: {
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '4px',
                                },
                                children: [
                                  {
                                    type: 'h2',
                                    props: {
                                      style: {
                                        color: 'white',
                                        fontSize: '36px',
                                        fontWeight: 700,
                                        margin: 0,
                                        lineHeight: 1.2,
                                      },
                                      children: church.name.length > 35 
                                        ? church.name.slice(0, 35) + '...' 
                                        : church.name,
                                    },
                                  },
                                  location ? {
                                    type: 'p',
                                    props: {
                                      style: {
                                        color: 'rgba(255,255,255,0.8)',
                                        fontSize: '20px',
                                        margin: 0,
                                      },
                                      children: location,
                                    },
                                  } : null,
                                ].filter(Boolean),
                              },
                            },
                          ].filter(Boolean),
                        },
                      },
                      // Headline - matches the page theme
                      {
                        type: 'h1',
                        props: {
                          style: {
                            color: 'white',
                            fontSize: '48px',
                            fontWeight: 700,
                            lineHeight: 1.15,
                            margin: 0,
                          },
                          children: 'Buy or Sell a Home. Support the Mission.',
                        },
                      },
                      {
                        type: 'p',
                        props: {
                          style: {
                            color: 'rgba(255,255,255,0.9)',
                            fontSize: '22px',
                            margin: 0,
                            maxWidth: '800px',
                            lineHeight: 1.4,
                          },
                          children: `A portion of the commission funds ${church.name}'s ministry—at no added cost to you.`,
                        },
                      },
                    ],
                  },
                },
                // Bottom features
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      gap: '32px',
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            backgroundColor: 'rgba(255,255,255,0.15)',
                            padding: '12px 20px',
                            borderRadius: '10px',
                          },
                          children: [
                            { type: 'span', props: { style: { fontSize: '20px' }, children: '🏠' } },
                            { type: 'span', props: { style: { color: 'white', fontSize: '16px', fontWeight: 500 }, children: 'Buy or Sell' } },
                          ],
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            backgroundColor: 'rgba(255,255,255,0.15)',
                            padding: '12px 20px',
                            borderRadius: '10px',
                          },
                          children: [
                            { type: 'span', props: { style: { fontSize: '20px' }, children: '💰' } },
                            { type: 'span', props: { style: { color: 'white', fontSize: '16px', fontWeight: 500 }, children: 'No Extra Cost' } },
                          ],
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            backgroundColor: 'rgba(255,255,255,0.15)',
                            padding: '12px 20px',
                            borderRadius: '10px',
                          },
                          children: [
                            { type: 'span', props: { style: { fontSize: '20px' }, children: '❤️' } },
                            { type: 'span', props: { style: { color: 'white', fontSize: '16px', fontWeight: 500 }, children: 'Support Ministry' } },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    };

    return renderToImage(element);
  } catch (error) {
    console.error('Error generating Mission Funding OG image:', error);
    return null;
  }
}

export async function generatePostOGImage(postId: string): Promise<Buffer | null> {
  try {
    const supabase = supabaseServer();

    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, title, body, body_format, cover_image_url, media_urls, media_type, author_id, post_type, city_platform_id')
      .eq('id', postId)
      .single();

    if (postError || !post) {
      console.error('Error fetching post for OG image:', postError);
      return null;
    }

    const { data: author } = await supabase
      .from('profiles')
      .select('full_name, first_name, last_name, avatar_url')
      .eq('id', post.author_id)
      .single();

    const authorName = author?.full_name
      || [author?.first_name, author?.last_name].filter(Boolean).join(' ')
      || 'A community member';

    let platformName: string | null = null;
    if (post.city_platform_id) {
      const { data: platform } = await supabase
        .from('city_platforms')
        .select('name, slug')
        .eq('id', post.city_platform_id)
        .single();
      if (platform) {
        platformName = platform.name;
      }
    }

    let displayTitle = post.title;
    if (!displayTitle || displayTitle.trim() === '') {
      if (post.post_type === 'prayer') {
        displayTitle = 'Prayer Request';
      } else {
        displayTitle = `Post by ${authorName}`;
      }
    }
    if (displayTitle.length > 80) {
      displayTitle = displayTitle.slice(0, 77) + '...';
    }

    let bodyExcerpt = '';
    if (post.body) {
      let rawText = post.body;
      if (post.body_format === 'html') {
        rawText = rawText.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().replace(/\s+/g, ' ');
      }
      bodyExcerpt = rawText.slice(0, 180) + (rawText.length > 180 ? '...' : '');
    }

    let backgroundImageUrl: string | null = null;
    if (post.cover_image_url) {
      backgroundImageUrl = post.cover_image_url;
    } else if (post.media_urls && post.media_urls.length > 0 && post.media_type !== 'video') {
      backgroundImageUrl = post.media_urls[0];
    }

    let bgImageBase64: string | null = null;
    if (backgroundImageUrl) {
      bgImageBase64 = await fetchImageAsBase64(backgroundImageUrl);
    }

    let avatarBase64: string | null = null;
    if (author?.avatar_url) {
      avatarBase64 = await fetchImageAsBase64(author.avatar_url);
    }

    const authorInitial = authorName.charAt(0).toUpperCase();

    const element = {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          width: OG_WIDTH,
          height: OG_HEIGHT,
          position: 'relative',
        },
        children: [
          bgImageBase64 ? {
            type: 'img',
            props: {
              src: bgImageBase64,
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              },
            },
          } : null,
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                background: bgImageBase64
                  ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.85) 0%, rgba(30, 41, 59, 0.75) 50%, rgba(15, 23, 42, 0.85) 100%)'
                  : 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #A855F7 100%)',
              },
            },
          },
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                padding: '60px',
                justifyContent: 'space-between',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: createLogoSection(),
                          children: [
                            {
                              type: 'div',
                              props: {
                                style: {
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '48px',
                                  height: '48px',
                                  borderRadius: '12px',
                                  backgroundColor: 'white',
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                },
                                children: [
                                  {
                                    type: 'span',
                                    props: {
                                      style: { fontSize: '28px' },
                                      children: '⛪',
                                    },
                                  },
                                ],
                              },
                            },
                            {
                              type: 'span',
                              props: {
                                style: {
                                  color: 'white',
                                  fontSize: '24px',
                                  fontWeight: 600,
                                  textShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                },
                                children: 'The Church Map',
                              },
                            },
                          ],
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: 'rgba(255,255,255,0.25)',
                            padding: '10px 20px',
                            borderRadius: '24px',
                          },
                          children: [
                            { type: 'span', props: { style: { fontSize: '20px' }, children: '💬' } },
                            {
                              type: 'span',
                              props: {
                                style: { color: 'white', fontSize: '18px', fontWeight: 600 },
                                children: 'Community Post',
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '16px',
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            color: 'white',
                            fontSize: '48px',
                            fontWeight: 700,
                            lineHeight: 1.2,
                            overflow: 'hidden',
                            textShadow: '0 2px 8px rgba(0,0,0,0.3)',
                          },
                          children: displayTitle,
                        },
                      },
                      bodyExcerpt ? {
                        type: 'div',
                        props: {
                          style: {
                            color: 'rgba(255,255,255,0.75)',
                            fontSize: '22px',
                            fontWeight: 400,
                            lineHeight: 1.4,
                            overflow: 'hidden',
                            textShadow: '0 1px 4px rgba(0,0,0,0.2)',
                          },
                          children: bodyExcerpt,
                        },
                      } : null,
                    ].filter(Boolean),
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                          },
                          children: [
                            avatarBase64 ? {
                              type: 'img',
                              props: {
                                src: avatarBase64,
                                style: {
                                  width: '44px',
                                  height: '44px',
                                  borderRadius: '22px',
                                  objectFit: 'cover',
                                  border: '2px solid rgba(255,255,255,0.5)',
                                },
                              },
                            } : {
                              type: 'div',
                              props: {
                                style: {
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '44px',
                                  height: '44px',
                                  borderRadius: '22px',
                                  backgroundColor: 'rgba(255,255,255,0.25)',
                                  color: 'white',
                                  fontSize: '20px',
                                  fontWeight: 700,
                                  border: '2px solid rgba(255,255,255,0.5)',
                                },
                                children: authorInitial,
                              },
                            },
                            {
                              type: 'span',
                              props: {
                                style: {
                                  color: 'rgba(255,255,255,0.9)',
                                  fontSize: '20px',
                                  fontWeight: 600,
                                },
                                children: authorName,
                              },
                            },
                          ],
                        },
                      },
                      platformName ? {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: 'rgba(255,255,255,0.15)',
                            padding: '8px 16px',
                            borderRadius: '8px',
                          },
                          children: [
                            { type: 'span', props: { style: { fontSize: '16px' }, children: '📍' } },
                            {
                              type: 'span',
                              props: {
                                style: { color: 'rgba(255,255,255,0.9)', fontSize: '16px', fontWeight: 500 },
                                children: platformName,
                              },
                            },
                          ],
                        },
                      } : null,
                    ].filter(Boolean),
                  },
                },
              ],
            },
          },
        ].filter(Boolean),
      },
    };

    return renderToImage(element);
  } catch (error) {
    console.error('Error generating post OG image:', error);
    return null;
  }
}

export async function generateJourneyOGImage(journeyId: string): Promise<Buffer | null> {
  try {
    const supabase = supabaseServer();

    // Fetch journey
    const { data: journey, error: journeyError } = await supabase
      .from('prayer_journeys')
      .select('id, title, description, city_platform_id')
      .eq('id', journeyId)
      .single();

    if (journeyError || !journey) {
      console.error('Error fetching journey for OG image:', journeyError);
      return null;
    }

    // Fetch steps with church locations
    const { data: steps } = await supabase
      .from('prayer_journey_steps')
      .select('id, order_index, step_type, title, church_id, metadata')
      .eq('journey_id', journeyId)
      .order('order_index', { ascending: true });

    const stepCount = steps?.length || 0;

    // Fetch church coordinates for steps that have a church_id
    const churchIds = (steps || [])
      .filter((s: any) => s.church_id)
      .map((s: any) => s.church_id);

    let churchLocations: Record<string, { lat: number; lng: number; name: string }> = {};
    if (churchIds.length > 0) {
      const { data: churches } = await supabase
        .from('churches')
        .select('id, name, display_lat, display_lng')
        .in('id', churchIds);

      if (churches) {
        for (const c of churches) {
          if (c.display_lat && c.display_lng) {
            churchLocations[c.id] = { lat: c.display_lat, lng: c.display_lng, name: c.name };
          }
        }
      }
    }

    // Get platform name
    let platformName = 'The Church Map';
    if (journey.city_platform_id) {
      const { data: platform } = await supabase
        .from('city_platforms')
        .select('name')
        .eq('id', journey.city_platform_id)
        .single();
      if (platform) {
        platformName = platform.name;
      }
    }

    // Build map stops from church locations
    const mapStops: Array<{ lon: number; lat: number; index: number }> = [];
    let stopIndex = 1;
    for (const step of (steps || [])) {
      if (step.church_id && churchLocations[step.church_id]) {
        const loc = churchLocations[step.church_id];
        mapStops.push({ lon: loc.lng, lat: loc.lat, index: stopIndex });
      }
      stopIndex++;
    }

    // Fetch the static map as base64
    let mapImageBase64: string | null = null;
    if (mapStops.length > 0) {
      const mapUrl = getJourneyMapUrl(mapStops);
      if (mapUrl) {
        mapImageBase64 = await fetchImageAsBase64(mapUrl);
      }
    }

    // Truncate title
    let displayTitle = journey.title || 'Prayer Journey';
    if (displayTitle.length > 60) {
      displayTitle = displayTitle.slice(0, 57) + '...';
    }

    const element = {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          width: OG_WIDTH,
          height: OG_HEIGHT,
          position: 'relative',
          backgroundColor: '#0F172A',
        },
        children: [
          // Static map in the top portion
          mapImageBase64 ? {
            type: 'img',
            props: {
              src: mapImageBase64,
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '65%',
                objectFit: 'cover',
              },
            },
          } : null,
          // Gradient overlay on map area
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '65%',
                background: mapImageBase64
                  ? 'linear-gradient(180deg, rgba(15,23,42,0.1) 0%, rgba(15,23,42,0.6) 80%, rgba(15,23,42,1) 100%)'
                  : 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
              },
            },
          },
          // Content overlay
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                padding: '48px 60px',
                justifyContent: 'space-between',
              },
              children: [
                // Top: Logo + badge
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: createLogoSection(),
                          children: [
                            {
                              type: 'div',
                              props: {
                                style: {
                                  width: '48px',
                                  height: '48px',
                                  backgroundColor: 'rgba(255,255,255,0.15)',
                                  borderRadius: '10px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '24px',
                                },
                                children: '🙏',
                              },
                            },
                            {
                              type: 'span',
                              props: {
                                style: {
                                  color: 'rgba(255,255,255,0.8)',
                                  fontSize: '22px',
                                  fontWeight: 600,
                                },
                                children: 'Prayer Journey',
                              },
                            },
                          ],
                        },
                      },
                      // Step count badge
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: 'rgba(255,107,53,0.25)',
                            border: '1px solid rgba(255,107,53,0.4)',
                            padding: '8px 16px',
                            borderRadius: '20px',
                          },
                          children: [
                            {
                              type: 'span',
                              props: {
                                style: { color: '#ff6b35', fontSize: '18px', fontWeight: 700 },
                                children: `${stepCount} stop${stepCount !== 1 ? 's' : ''}`,
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                // Bottom: Title + platform
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '16px',
                    },
                    children: [
                      {
                        type: 'h1',
                        props: {
                          style: {
                            color: 'white',
                            fontSize: '56px',
                            fontWeight: 700,
                            lineHeight: 1.15,
                            margin: 0,
                          },
                          children: displayTitle,
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '24px',
                          },
                          children: [
                            {
                              type: 'div',
                              props: {
                                style: {
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                },
                                children: [
                                  { type: 'span', props: { style: { fontSize: '18px' }, children: '📍' } },
                                  {
                                    type: 'span',
                                    props: {
                                      style: { color: 'rgba(255,255,255,0.7)', fontSize: '20px', fontWeight: 500 },
                                      children: platformName,
                                    },
                                  },
                                ],
                              },
                            },
                            mapStops.length > 0 ? {
                              type: 'div',
                              props: {
                                style: {
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                },
                                children: [
                                  { type: 'span', props: { style: { fontSize: '18px' }, children: '⛪' } },
                                  {
                                    type: 'span',
                                    props: {
                                      style: { color: 'rgba(255,255,255,0.7)', fontSize: '20px', fontWeight: 500 },
                                      children: `${mapStops.length} church${mapStops.length !== 1 ? 'es' : ''}`,
                                    },
                                  },
                                ],
                              },
                            } : null,
                            {
                              type: 'div',
                              props: {
                                style: {
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  color: 'rgba(255,255,255,0.5)',
                                  fontSize: '18px',
                                },
                                children: 'thechurchmap.com',
                              },
                            },
                          ].filter(Boolean),
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ].filter(Boolean),
      },
    };

    return renderToImage(element);
  } catch (error) {
    console.error('Error generating journey OG image:', error);
    return null;
  }
}

export type OGImageType = 'home' | 'church' | 'about' | 'platform' | 'community' | 'post' | 'fund-mission' | 'mission-funding' | 'journey';
