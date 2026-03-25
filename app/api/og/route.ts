import type { Request, Response } from "express";
import { execFile } from "child_process";
import { promisify } from "util";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import {
  generateHomeOGImage,
  generateExploreOGImage,
  generateChurchOGImage,
  generateAboutOGImage,
  generatePlatformOGImage,
  generateCommunityOGImage,
  generateFundMissionOGImage,
  generateMissionFundingOGImage,
  generatePostOGImage,
  generateJourneyOGImage,
} from "../../../server/services/og-image";

const execFileAsync = promisify(execFile);
const THUMB_CACHE_DIR = '/tmp/video-thumbs';

function getThumbCachePath(videoUrl: string): string {
  const hash = createHash('md5').update(videoUrl).digest('hex');
  return path.join(THUMB_CACHE_DIR, `${hash}.jpg`);
}

async function extractVideoThumbnail(videoUrl: string): Promise<Buffer | null> {
  try {
    if (!fs.existsSync(THUMB_CACHE_DIR)) {
      fs.mkdirSync(THUMB_CACHE_DIR, { recursive: true });
    }

    const cachePath = getThumbCachePath(videoUrl);
    if (fs.existsSync(cachePath)) {
      return fs.readFileSync(cachePath);
    }

    const { stdout } = await execFileAsync('ffmpeg', [
      '-i', videoUrl,
      '-ss', '1',
      '-vframes', '1',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-q:v', '2',
      '-'
    ], { encoding: 'buffer' as any, maxBuffer: 10 * 1024 * 1024, timeout: 30000 } as any);
    const buffer = stdout as unknown as Buffer;

    fs.writeFileSync(cachePath, buffer);

    return buffer;
  } catch (err) {
    console.error('ffmpeg thumbnail extraction failed:', err);
    return null;
  }
}

export async function GET(req: Request, res: Response) {
  try {
    const { type, id, slug, showChurches, showLds, videoUrl, token } = req.query as {
      type?: string;
      id?: string;
      slug?: string;
      showChurches?: string;
      showLds?: string;
      videoUrl?: string;
      token?: string;
    };

    let imageBuffer: Buffer | null = null;

    switch (type) {
      case 'home':
        imageBuffer = await generateHomeOGImage();
        break;
      case 'explore':
        imageBuffer = await generateExploreOGImage({
          showChurches: showChurches === 'true',
          showLds: showLds !== 'false',
        });
        break;
      case 'church':
        if (!id) {
          return res.status(400).json({ error: 'Church ID required' });
        }
        imageBuffer = await generateChurchOGImage(id);
        break;
      case 'about':
        imageBuffer = await generateAboutOGImage();
        break;
      case 'platform':
        const platformIdentifier = slug || id;
        if (!platformIdentifier) {
          return res.status(400).json({ error: 'Platform ID or slug required' });
        }
        imageBuffer = await generatePlatformOGImage(platformIdentifier);
        break;
      case 'community':
        const communityPlatformId = slug || id;
        if (!communityPlatformId) {
          return res.status(400).json({ error: 'Platform ID or slug required for community' });
        }
        imageBuffer = await generateCommunityOGImage(communityPlatformId);
        break;
      case 'post':
        if (!id) {
          return res.status(400).json({ error: 'Post ID required' });
        }
        imageBuffer = await generatePostOGImage(id);
        break;
      case 'video-thumb':
        if (!videoUrl) {
          return res.status(400).json({ error: 'Video URL required' });
        }
        const thumbBuffer = await extractVideoThumbnail(videoUrl);
        if (thumbBuffer) {
          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=2592000');
          return res.send(thumbBuffer);
        }
        imageBuffer = await generateHomeOGImage();
        break;
      case 'fund-mission':
        if (!id) {
          return res.status(400).json({ error: 'Church ID required for fund-mission' });
        }
        imageBuffer = await generateFundMissionOGImage(id);
        break;
      case 'mission-funding':
        if (!id) {
          return res.status(400).json({ error: 'Church ID required for mission-funding' });
        }
        imageBuffer = await generateMissionFundingOGImage(id);
        break;
      case 'journey':
        let journeyId = id;
        if (!journeyId && token) {
          // Look up journey ID from share token
          const { supabaseServer } = await import('../../../lib/supabaseServer');
          const supabase = supabaseServer();
          const { data: journey } = await supabase
            .from('prayer_journeys')
            .select('id')
            .eq('share_token', token)
            .single();
          if (journey) journeyId = journey.id;
        }
        if (!journeyId) {
          return res.status(400).json({ error: 'Journey ID or token required' });
        }
        imageBuffer = await generateJourneyOGImage(journeyId);
        break;
      default:
        imageBuffer = await generateHomeOGImage();
    }

    if (!imageBuffer) {
      imageBuffer = await generateHomeOGImage();
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    res.send(imageBuffer);
  } catch (error) {
    console.error('OG image generation error:', error);
    res.status(500).json({ error: 'Failed to generate image' });
  }
}
