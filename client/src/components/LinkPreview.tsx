import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, Link2 } from 'lucide-react';

interface LinkMetadata {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  favicon: string | null;
}

interface LinkPreviewProps {
  url: string;
  className?: string;
}

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function LinkPreview({ url, className = '' }: LinkPreviewProps) {
  const [imageError, setImageError] = useState(false);

  const { data, isLoading, error } = useQuery<LinkMetadata>({
    queryKey: ['/api/link-preview', url],
    queryFn: async () => {
      const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
      if (!res.ok) {
        throw new Error('Failed to fetch preview');
      }
      return res.json();
    },
    staleTime: 1000 * 60 * 60,
    retry: 1,
  });

  useEffect(() => {
    setImageError(false);
  }, [url]);

  if (error) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-2 text-sm text-primary hover:underline ${className}`}
        data-testid="link-preview-fallback"
      >
        <Link2 className="h-4 w-4 flex-shrink-0" />
        <span className="truncate">{url}</span>
        <ExternalLink className="h-3 w-3 flex-shrink-0" />
      </a>
    );
  }

  if (isLoading) {
    return (
      <Card className={`overflow-hidden ${className}`} data-testid="link-preview-loading">
        <div className="flex gap-3 p-3">
          <Skeleton className="h-16 w-16 flex-shrink-0 rounded" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  const hasImage = data.image && !imageError;
  const domain = data.siteName || extractDomain(data.url);

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block hover-elevate ${className}`}
      data-testid="link-preview-card"
    >
      <Card className="overflow-hidden">
        <div className={hasImage ? 'flex' : ''}>
          {hasImage && (
            <div className="flex-shrink-0 w-24 h-24 sm:w-32 sm:h-32 bg-muted">
              <img
                src={data.image!}
                alt=""
                className="w-full h-full object-cover"
                onError={() => setImageError(true)}
                loading="lazy"
              />
            </div>
          )}
          <div className="flex-1 p-3 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {data.favicon && (
                <img
                  src={data.favicon}
                  alt=""
                  className="h-4 w-4 flex-shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              <span className="text-xs text-muted-foreground truncate">
                {domain}
              </span>
            </div>
            {data.title && (
              <h4 className="font-medium text-sm line-clamp-2 mb-1" data-testid="link-preview-title">
                {data.title}
              </h4>
            )}
            {data.description && (
              <p className="text-xs text-muted-foreground line-clamp-2" data-testid="link-preview-description">
                {data.description}
              </p>
            )}
          </div>
        </div>
      </Card>
    </a>
  );
}

export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"\[\]]+|www\.[^\s<>"\[\]]+/gi;
  const matches = text.match(urlRegex) || [];
  const seen = new Set<string>();
  return matches.filter(url => {
    const normalized = url.toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).slice(0, 3);
}
