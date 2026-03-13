const PIN_ICONS: Record<string, string> = {
  anchor: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C10.34 2 9 3.34 9 5c0 1.1.6 2.05 1.5 2.56V9H8v2h2.5v7.92C7.36 18.47 5 15.97 5 13H3c0 4.42 4.03 8 9 8s9-3.58 9-8h-2c0 2.97-2.36 5.47-5.5 5.92V11H16V9h-2.5V7.56C14.4 7.05 15 6.1 15 5c0-1.66-1.34-3-3-3zm0 2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z"/></svg>`,
  handshake: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.22 19.85c-.18.18-.5.21-.71 0L6.91 15.3a3.67 3.67 0 0 1 0-5.18l3.05-3.06a1.5 1.5 0 0 1 2.12 0l.35.35.35-.35a1.5 1.5 0 0 1 2.12 0l3.05 3.06a3.67 3.67 0 0 1 0 5.18l-4.6 4.55c-.21.21-.53.18-.71 0l-.42-.42z"/></svg>`,
  bridge: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 14v-2c0-1.1.45-2.1 1.17-2.83A3.98 3.98 0 0 1 11 8h2c1.1 0 2.1.45 2.83 1.17A3.98 3.98 0 0 1 17 12v2h3V8a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v6h3zm-3 2v4h4v-4H4zm12 0v4h4v-4h-4zm-6 0v4h4v-4h-4z"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 7h-4v2h4c1.65 0 3 1.35 3 3s-1.35 3-3 3h-4v2h4c2.76 0 5-2.24 5-5s-2.24-5-5-5zm-6 8H7c-1.65 0-3-1.35-3-3s1.35-3 3-3h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-2zm-3-4h8v2H8z"/></svg>`,
  unity: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="16" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>`,
  flame: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg>`,
  cross: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 2h4v8h8v4h-8v8h-4v-8H2v-4h8V2z"/></svg>`,
  church: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3L4 9v12h5v-5c0-1.66 1.34-3 3-3s3 1.34 3 3v5h5V9l-8-6zm0 2.5l1 .75V8h-2V6.25l1-.75zM12 10a1.5 1.5 0 110 3 1.5 1.5 0 010-3z"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.248c-3.148-5.402-12-3.825-12 2.944 0 4.661 5.571 9.427 12 15.808 6.43-6.381 12-11.147 12-15.808 0-6.792-8.875-8.306-12-2.944z"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>`,
  people: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,
  users: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,
  globe: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`,
  book: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>`,
  home: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>`,
  dove: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-1.27 0-2.4.8-2.82 2H3v2h1.95L2 14c-.21 2 1.79 4 4 4h1v3h2v-3h2v3h2v-3h1c2.21 0 4.21-2 4-4l-2.95-7H17V5h-6.18C10.4 3.8 9.27 3 8 3h4z"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z"/></svg>`,
  crown: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/></svg>`,
  lamp: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/></svg>`,
  lightbulb: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/></svg>`,
  food: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.06 22.99h1.66c.84 0 1.53-.64 1.63-1.46L23 5.05l-5 2v6.06c0 .86-.78 1.48-1.62 1.28-1.25-.29-2.29-1.08-2.87-2.14-2.8 2.64-6.51 2.81-9.51.61V4.03h4c2.76 0 5 2.24 5 5v8.96c.68 1.11 1.4 2.23 2.06 3zm-9-13.96h-6v6h6v-6z"/></svg>`,
  medical: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>`,
  truck: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`,
  water: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8z"/></svg>`,
  hands: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.5 8c-.83 0-1.5.67-1.5 1.5v3h-1V6.5c0-.83-.67-1.5-1.5-1.5S13 5.67 13 6.5v6h-1V4.5c0-.83-.67-1.5-1.5-1.5S9 3.67 9 4.5v8h-1V6.5c0-.83-.67-1.5-1.5-1.5S5 5.67 5 6.5v10c0 3.31 2.69 6 6 6h4c3.31 0 6-2.69 6-6V9.5c0-.83-.67-1.5-1.5-1.5z"/></svg>`,
  music: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`,
  seedling: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c4.97 0 9-4.03 9-9-4.97 0-9 4.03-9 9zM5.6 10.25c0 1.38 1.12 2.5 2.5 2.5.53 0 1.01-.16 1.42-.44l-.02.19c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5l-.02-.19c.4.28.89.44 1.42.44 1.38 0 2.5-1.12 2.5-2.5 0-1-.59-1.85-1.43-2.25.84-.4 1.43-1.25 1.43-2.25 0-1.38-1.12-2.5-2.5-2.5-.53 0-1.01.16-1.42.44l.02-.19C14.5 4.12 13.38 3 12 3S9.5 4.12 9.5 5.5l.02.19c-.4-.28-.89-.44-1.42-.44-1.38 0-2.5 1.12-2.5 2.5 0 1 .59 1.85 1.43 2.25-.84.4-1.43 1.25-1.43 2.25z"/></svg>`,
  mountain: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 6l-3.75 5 2.85 3.8-1.6 1.2C9.81 13.75 7 10 7 10l-6 8h22L14 6z"/></svg>`,
};

function convertLegacyIconKey(iconKey: string): string {
  if (!iconKey) return '';
  
  let iconId = iconKey;
  
  if (iconId.includes(':')) {
    const parts = iconId.split(':');
    iconId = parts[1] || parts[0];
  }
  
  const legacyMapping: Record<string, string> = {
    'FaAnchor': 'anchor',
    'FaHeart': 'heart',
    'FaChurch': 'church',
    'FaHandshake': 'handshake',
    'FaCross': 'cross',
    'FaBridge': 'bridge',
    'FaLink': 'link',
    'FaUsers': 'users',
    'FaHome': 'home',
    'FaBook': 'book',
    'FaStar': 'star',
    'FaGlobe': 'globe',
    'FaShield': 'shield',
    'FaLightbulb': 'lightbulb',
    'FaMusic': 'music',
    'FaSeedling': 'seedling',
    'FaSun': 'sun',
    'FaMountain': 'mountain',
    'FaWater': 'water',
    'FaHands': 'hands',
    'FaDove': 'dove',
    'FaFire': 'flame',
    'Flame': 'flame',
    'Heart': 'heart',
    'Church': 'church',
    'Anchor': 'anchor',
    'Handshake': 'handshake',
    'Cross': 'cross',
    'Bridge': 'bridge',
    'Link': 'link',
    'Users': 'users',
    'Home': 'home',
    'Book': 'book',
    'Star': 'star',
    'Globe': 'globe',
    'Shield': 'shield',
    'Lightbulb': 'lightbulb',
    'Music': 'music',
    'Seedling': 'seedling',
    'Sun': 'sun',
    'Mountain': 'mountain',
    'Droplet': 'water',
    'HandHelping': 'hands',
    'Bird': 'dove',
  };
  
  return legacyMapping[iconId] || iconId.toLowerCase();
}

export function getPinIconSvg(iconKey: string): string | null {
  const normalizedKey = convertLegacyIconKey(iconKey);
  return PIN_ICONS[normalizedKey] || null;
}

interface IconDisplayProps {
  iconKey?: string;
  className?: string;
  size?: number;
  fallback?: React.ReactNode;
}

export function IconDisplay({ 
  iconKey, 
  className = "",
  fallback = null 
}: IconDisplayProps) {
  if (!iconKey) return <>{fallback}</>;
  
  const svgString = getPinIconSvg(iconKey);
  if (!svgString) return <>{fallback}</>;
  
  const svgWithClass = svgString.replace('<svg ', `<svg class="${className}" style="width: 100%; height: 100%;" `);
  
  return (
    <span 
      className={`inline-flex items-center justify-center ${className}`}
      dangerouslySetInnerHTML={{ __html: svgWithClass }}
    />
  );
}

export function LazyIcon({ iconKey, className, fallback = null }: IconDisplayProps) {
  return <IconDisplay iconKey={iconKey} className={className} fallback={fallback} />;
}

export async function getIconComponentAsync(iconKey: string): Promise<null> {
  return null;
}

export async function renderIconToHtml(iconKey: string, size: number = 16): Promise<string | null> {
  return getPinIconSvg(iconKey);
}
