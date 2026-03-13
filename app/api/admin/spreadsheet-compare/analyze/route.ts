import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import wkx from "wkx";

interface SpreadsheetChurch {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  id: string;
}

interface DatabaseChurch {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
}

interface ComparisonResult {
  spreadsheetChurch: SpreadsheetChurch;
  status: "matched" | "missing";
  matchedDbChurch?: {
    id: string;
    name: string;
    address: string | null;
    matchReason: string;
    similarity: number;
    distance: number;
  };
}

function calculateSimilarity(s1: string, s2: string): number {
  if (!s1 || !s2) return 0;
  s1 = s1.toLowerCase().replace(/[^a-z0-9]/g, '');
  s2 = s2.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }
  
  let matches = 0;
  const shorterArr = shorter.split('');
  const longerArr = longer.split('');
  
  for (let i = 0; i < shorterArr.length; i++) {
    const idx = longerArr.indexOf(shorterArr[i]);
    if (idx !== -1) {
      matches++;
      longerArr[idx] = '';
    }
  }
  
  return matches / longer.length;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function parseLocationToCoords(location: any): { lat: number; lng: number } | null {
  if (!location) return null;
  
  const locStr = typeof location === 'string' ? location : String(location);
  
  const wktMatch = locStr.match(/POINT\(([^ ]+) ([^)]+)\)/);
  if (wktMatch) {
    return {
      lng: parseFloat(wktMatch[1]),
      lat: parseFloat(wktMatch[2]),
    };
  }
  
  if (/^[0-9A-Fa-f]+$/.test(locStr) && locStr.length >= 34) {
    try {
      const buffer = Buffer.from(locStr, 'hex');
      const geom = wkx.Geometry.parse(buffer) as any;
      if (geom && typeof geom.x === 'number' && typeof geom.y === 'number') {
        return {
          lng: geom.x,
          lat: geom.y,
        };
      }
    } catch (e: any) {}
  }
  
  return null;
}

export async function POST(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    const isSuperAdmin = user.user_metadata?.super_admin === true;
    
    if (!isSuperAdmin) {
      return res.status(403).json({ error: "Only super admins can access this endpoint" });
    }

    const { churches: spreadsheetData, platformId } = req.body;
    
    if (!spreadsheetData || !Array.isArray(spreadsheetData) || spreadsheetData.length === 0) {
      return res.status(400).json({ error: "No churches provided for analysis" });
    }

    const targetPlatformId = platformId || "6a51f189-5c96-4883-b7f9-adb185d53916";

    // Step 1: Detect internal duplicates within the spreadsheet
    const internalDuplicates: { original: SpreadsheetChurch; duplicates: SpreadsheetChurch[] }[] = [];
    const processedIds = new Set<string>();
    const uniqueSpreadsheetData: SpreadsheetChurch[] = [];
    
    for (let i = 0; i < spreadsheetData.length; i++) {
      const church = spreadsheetData[i];
      if (processedIds.has(church.id)) continue;
      
      const duplicatesOfThis: SpreadsheetChurch[] = [];
      
      for (let j = i + 1; j < spreadsheetData.length; j++) {
        const other = spreadsheetData[j];
        if (processedIds.has(other.id)) continue;
        
        const distance = haversineDistance(
          church.latitude, church.longitude,
          other.latitude, other.longitude
        );
        
        if (distance <= 100) {
          const nameSim = calculateSimilarity(church.name, other.name);
          if (nameSim >= 0.5 || distance <= 30) {
            duplicatesOfThis.push(other);
            processedIds.add(other.id);
          }
        }
      }
      
      processedIds.add(church.id);
      uniqueSpreadsheetData.push(church);
      
      if (duplicatesOfThis.length > 0) {
        internalDuplicates.push({
          original: church,
          duplicates: duplicatesOfThis,
        });
      }
    }
    
    console.log(`[Spreadsheet Analyze] Found ${internalDuplicates.length} duplicate groups`);
    console.log(`[Spreadsheet Analyze] Reduced from ${spreadsheetData.length} to ${uniqueSpreadsheetData.length} unique entries`);
    
    // Query churches linked to the platform
    const { data: dbChurches, error: dbError } = await adminClient
      .from('city_platform_churches')
      .select('church_id, churches!inner(id, name, address, location)')
      .eq('city_platform_id', targetPlatformId);
    
    if (dbError) {
      console.error('Error fetching churches:', dbError);
      return res.status(500).json({ error: "Failed to fetch churches from database" });
    }
    
    const flatChurches = (dbChurches || []).map((row: any) => row.churches);
    console.log(`[Spreadsheet Analyze] Fetched ${flatChurches.length} churches from platform`);

    const processedDbChurches: DatabaseChurch[] = flatChurches
      .map((church: any) => {
        const coords = parseLocationToCoords(church.location);
        if (!coords) return null;
        return {
          id: church.id,
          name: church.name,
          address: church.address,
          latitude: coords.lat,
          longitude: coords.lng,
        };
      })
      .filter((c): c is DatabaseChurch => c !== null);

    console.log(`[Spreadsheet Analyze] Comparing ${uniqueSpreadsheetData.length} unique spreadsheet churches against ${processedDbChurches.length} database churches`);

    const results: ComparisonResult[] = [];
    const NAME_SIMILARITY_THRESHOLD = 0.6;
    const DISTANCE_THRESHOLD_METERS = 300;

    for (const ssChurch of uniqueSpreadsheetData) {
      let bestMatch: ComparisonResult['matchedDbChurch'] | undefined;
      let bestScore = 0;

      for (const dbChurch of processedDbChurches) {
        const distance = haversineDistance(
          ssChurch.latitude,
          ssChurch.longitude,
          dbChurch.latitude,
          dbChurch.longitude
        );

        if (distance <= DISTANCE_THRESHOLD_METERS) {
          const nameSimilarity = calculateSimilarity(ssChurch.name, dbChurch.name);
          
          if (nameSimilarity >= NAME_SIMILARITY_THRESHOLD) {
            const score = nameSimilarity + (1 - distance / DISTANCE_THRESHOLD_METERS);
            if (score > bestScore) {
              bestScore = score;
              bestMatch = {
                id: dbChurch.id,
                name: dbChurch.name,
                address: dbChurch.address,
                matchReason: `name_similarity: ${(nameSimilarity * 100).toFixed(0)}%, distance: ${distance.toFixed(0)}m`,
                similarity: nameSimilarity,
                distance,
              };
            }
          } else if (distance <= 100 && nameSimilarity >= 0.4) {
            const score = 0.5 + (1 - distance / 100) * 0.5;
            if (score > bestScore || !bestMatch) {
              bestScore = Math.max(bestScore, score);
              bestMatch = {
                id: dbChurch.id,
                name: dbChurch.name,
                address: dbChurch.address,
                matchReason: `close_proximity: ${distance.toFixed(0)}m (name similarity: ${(nameSimilarity * 100).toFixed(0)}%)`,
                similarity: nameSimilarity,
                distance,
              };
            }
          }
        }
      }

      results.push({
        spreadsheetChurch: ssChurch,
        status: bestMatch ? "matched" : "missing",
        matchedDbChurch: bestMatch,
      });
    }

    const matched = results.filter(r => r.status === "matched");
    const missing = results.filter(r => r.status === "missing");

    console.log(`[Spreadsheet Analyze] Results: ${matched.length} matched, ${missing.length} missing`);

    return res.json({
      summary: {
        totalSpreadsheet: spreadsheetData.length,
        uniqueSpreadsheet: uniqueSpreadsheetData.length,
        internalDuplicatesRemoved: spreadsheetData.length - uniqueSpreadsheetData.length,
        totalDatabase: processedDbChurches.length,
        matched: matched.length,
        missing: missing.length,
      },
      internalDuplicates,
      matched,
      missing,
    });
  } catch (error: any) {
    console.error('[Spreadsheet Analyze] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
