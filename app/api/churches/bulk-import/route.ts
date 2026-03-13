import type { Request, Response } from 'express';
import { supabaseServer } from '../../../../lib/supabaseServer';

interface ChurchImportData {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  denomination: string | null;
  latitude: number;
  longitude: number;
  tags: string[];
}

export async function POST(req: Request, res: Response) {
  try {
    const supabase = supabaseServer();
    
    const churches: ChurchImportData[] = req.body.churches;
    
    if (!Array.isArray(churches)) {
      return res.status(400).json({ error: 'Expected array of churches' });
    }
    
    console.log(`Starting bulk import of ${churches.length} churches...`);
    
    // Step 1: Delete all existing churches (cascade will delete areas too)
    console.log('Deleting existing churches and areas...');
    const { error: deleteError } = await supabase
      .from('churches')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    if (deleteError) {
      console.error('Delete error:', deleteError);
      return res.status(500).json({ error: 'Failed to delete existing churches', details: deleteError });
    }
    
    // Step 2: Prepare church data for insert
    console.log('Preparing church data...');
    const churchRecords = churches.map(c => ({
      name: c.name,
      address: c.address,
      phone: c.phone,
      email: c.email,
      website: c.website,
      denomination: c.denomination,
      // Use ST_SetSRID to create proper PostGIS geometry
      location: `SRID=4326;POINT(${c.longitude} ${c.latitude})`,
      collaboration_have: c.tags || [],
      collaboration_need: [],
      approved: true  // Auto-approve imported churches
    }));
    
    // Step 3: Insert churches in batches (Supabase has 1000 row limit)
    console.log('Inserting churches in batches...');
    const batchSize = 500;
    const inserted: any[] = [];
    
    for (let i = 0; i < churchRecords.length; i += batchSize) {
      const batch = churchRecords.slice(i, i + batchSize);
      console.log(`Inserting batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(churchRecords.length/batchSize)}...`);
      
      const { data, error } = await supabase
        .from('churches')
        .insert(batch)
        .select('id, name, location');
      
      if (error) {
        console.error('Insert error:', error);
        return res.status(500).json({ error: 'Failed to insert churches', details: error });
      }
      
      inserted.push(...(data || []));
    }
    
    console.log(`Inserted ${inserted.length} churches`);
    
    // Step 4: Attach boundaries using PostGIS spatial join
    console.log('Attaching boundaries via spatial join...');
    
    const { data: matchData, error: matchError } = await supabase.rpc('attach_boundaries_to_churches');
    
    if (matchError) {
      console.warn('Boundary attachment warning:', matchError);
      // Don't fail the whole import if boundary matching fails
    } else {
      console.log(`Boundaries attached to ${matchData?.[0]?.matched_count || 0} churches`);
    }
    
    res.json({
      success: true,
      imported: inserted.length,
      deleted: 'all existing churches and areas',
      boundaries_attached: matchData?.[0]?.matched_count || 0
    });
    
  } catch (error) {
    console.error('Bulk import error:', error);
    res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
}
