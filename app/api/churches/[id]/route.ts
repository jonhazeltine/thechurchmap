import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";
import { insertChurchSchema } from "@shared/schema";
import { geocodeAddress } from "../../../../lib/geocoding";
import { canEditChurch } from "../../../../lib/authMiddleware";
import wkx from 'wkx';

function isValidAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  
  const clean = address.trim();
  
  if (clean.length < 5) return false;
  
  const hasNumber = /\d/.test(clean);
  const hasLetter = /[a-zA-Z]/.test(clean);
  const invalidChars = /[<>{}|\^`~]/.test(clean);
  
  return hasNumber && hasLetter && !invalidChars;
}

export async function GET(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const supabase = supabaseServer();

    console.log(`📍 Fetching church by ID: ${id}`);

    const { data: church, error } = await supabase.rpc('fn_get_church_by_id', {
      church_uuid: id,
    });

    console.log(`📍 RPC result - error:`, error, `data:`, church ? 'has data' : 'null/empty', `length:`, Array.isArray(church) ? church.length : 'not array');

    if (error) throw error;
    
    // RPC returns an array, get the first row
    const churchData = Array.isArray(church) ? church[0] : church;
    
    if (!churchData) {
      res.status(404).json({ error: 'Church not found' });
      return;
    }

    // Fetch callings for this church (with custom_boundary_enabled from church_calling)
    const { data: churchCallings, error: callingsError } = await supabase
      .from('church_calling')
      .select(`
        calling_id,
        custom_boundary_enabled,
        callings:calling_id (
          id,
          name,
          type,
          description,
          color
        )
      `)
      .eq('church_id', id);

    if (callingsError) {
      console.error('Error fetching church callings:', callingsError);
    }

    // Format callings to include custom_boundary_enabled flag
    const callings = (churchCallings || [])
      .filter((cc: any) => cc.callings)
      .map((cc: any) => ({
        ...cc.callings,
        custom_boundary_enabled: cc.custom_boundary_enabled ?? false
      }));

    console.log(`📍 Fetched ${callings.length} callings for church ${id}`);

    // Fetch partnership_status directly from churches table (not in RPC)
    const { data: churchRecord, error: churchRecordError } = await supabase
      .from('churches')
      .select('partnership_status, formation_church_id, formation_api_key')
      .eq('id', id)
      .single();
    
    if (churchRecord) {
      churchData.partnership_status = churchRecord.partnership_status;
      churchData.formation_church_id = churchRecord.formation_church_id;
      churchData.formation_api_key = churchRecord.formation_api_key ? '***' : null;
    }

    // Fetch the church's city platform info (for platform-aware navigation)
    const { data: platformLink } = await supabase
      .from('city_platform_churches')
      .select('city_platform_id, city_platforms:city_platform_id (id, name, slug)')
      .eq('church_id', id)
      .limit(1)
      .maybeSingle();
    
    const churchPlatform = platformLink?.city_platforms
      ? { id: (platformLink.city_platforms as any).id, name: (platformLink.city_platforms as any).name, slug: (platformLink.city_platforms as any).slug }
      : null;

    // Fetch boundary details WITH geometry for this church's boundary_ids
    // Convert WKB hex geometry to GeoJSON using wkx library
    let boundaries: { id: string; name: string; type: string; geometry: any }[] = [];
    const boundaryIds = churchData.boundary_ids || [];
    if (boundaryIds.length > 0) {
      const { data: boundariesData, error: boundariesError } = await supabase
        .from('boundaries')
        .select('id, name, type, geometry')
        .in('id', boundaryIds);
      
      if (boundariesError) {
        console.error('Error fetching boundaries:', boundariesError);
      } else if (boundariesData) {
        // Convert WKB hex geometry to GeoJSON
        boundaries = boundariesData.map((b: any) => {
          let geoJsonGeometry = null;
          if (b.geometry && typeof b.geometry === 'string') {
            try {
              // Parse WKB hex string and convert to GeoJSON
              const wkbBuffer = Buffer.from(b.geometry, 'hex');
              const geometry = wkx.Geometry.parse(wkbBuffer);
              geoJsonGeometry = geometry.toGeoJSON();
            } catch (err) {
              console.error(`Error converting geometry for boundary ${b.id}:`, err);
            }
          }
          return {
            id: b.id,
            name: b.name,
            type: b.type,
            geometry: geoJsonGeometry
          };
        });
        console.log(`📍 Fetched ${boundaries.length} boundaries with GeoJSON geometry for church ${id}`);
      }
    }

    res.json({
      ...churchData,
      callings,
      boundaries,
      platform: churchPlatform
    });
  } catch (error: any) {
    console.error(`📍 Church fetch error:`, error);
    res.status(404).json({ error: error.message });
  }
}

export async function PATCH(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const access = await canEditChurch(req, id);
    if (!access.allowed) {
      return res.status(access.authenticationFailed ? 401 : 403).json({ 
        error: access.reason || 'Permission denied' 
      });
    }

    const { calling_ids, boundary_ids, ...churchData } = req.body;
    const supabase = supabaseServer();

    // Log incoming data for debugging pin adjustment
    if (churchData.display_lat !== undefined || churchData.display_lng !== undefined) {
      console.log('📍 Pin adjustment request:', {
        churchId: id,
        display_lat: churchData.display_lat,
        display_lng: churchData.display_lng,
      });
    }

    if (Object.keys(churchData).length > 0 || boundary_ids !== undefined) {
      const updateData: any = {};
      
      if (Object.keys(churchData).length > 0) {
        if (churchData.address !== undefined && churchData.address !== null && churchData.address !== '') {
          if (!isValidAddress(churchData.address)) {
            throw new Error('Please enter a valid street address (e.g., "123 Main St, City, ST 12345")');
          }
          
          try {
            const geocodeResult = await geocodeAddress(churchData.address);
            
            if (geocodeResult) {
              updateData.location = `POINT(${geocodeResult.lng} ${geocodeResult.lat})`;
            } else {
              console.warn('Geocoding failed for address:', churchData.address);
            }
          } catch (geocodeError: any) {
            console.error('Geocoding error:', geocodeError);
          }
        }
        
        const parsedChurchData = insertChurchSchema.partial().parse(churchData);
        Object.assign(updateData, parsedChurchData);
      }
      
      if (boundary_ids !== undefined) {
        updateData.boundary_ids = boundary_ids;
      }

      // Log what we're about to update
      if (updateData.display_lat !== undefined || updateData.display_lng !== undefined) {
        console.log('📍 Updating church with display location:', updateData);
      }

      const { error } = await supabase
        .from('churches')
        .update(updateData)
        .eq('id', id);

      if (error) {
        console.error('📍 Church update error:', error);
        throw error;
      }
      
      if (updateData.display_lat !== undefined || updateData.display_lng !== undefined) {
        console.log('📍 Pin adjustment update successful');
      }
    }

    if (calling_ids !== undefined) {
      const { error: deleteError } = await supabase
        .from('church_calling')
        .delete()
        .eq('church_id', id);

      if (deleteError) throw deleteError;

      if (calling_ids.length > 0) {
        const callingInserts = calling_ids.map((calling_id: string) => ({
          church_id: id,
          calling_id,
        }));

        const { error: insertError } = await supabase
          .from('church_calling')
          .insert(callingInserts);

        if (insertError) throw insertError;
      }
    }

    const { data: church, error: fetchError } = await supabase.rpc('fn_get_church_by_id', {
      church_uuid: id,
    });

    if (fetchError) throw fetchError;
    if (!church) {
      res.status(404).json({ error: 'Church not found' });
      return;
    }

    res.json(church);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function DELETE(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const access = await canEditChurch(req, id);
    if (!access.allowed) {
      return res.status(access.authenticationFailed ? 401 : 403).json({ 
        error: access.reason || 'Permission denied' 
      });
    }

    const supabase = supabaseServer();

    const { error } = await supabase
      .from('churches')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}
