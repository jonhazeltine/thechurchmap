import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface BoundaryInfo {
  id: string;
  name: string;
  type: string;
}

interface Church {
  id: string;
  name: string;
  boundary_ids: string[] | null;
}

function normalizeForComparison(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+(city|township|charter township|village|cdp)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function removeDuplicateCountySubdivisions() {
  console.log("🧹 Removing duplicate county subdivision boundaries...\n");

  const { data: churches, error: churchError } = await supabase
    .from("churches")
    .select("id, name, boundary_ids")
    .not("boundary_ids", "is", null);

  if (churchError) {
    console.error("Error fetching churches:", churchError);
    return;
  }

  const churchesWithMultiple = (churches || []).filter(
    (c) => c.boundary_ids && c.boundary_ids.length > 1
  );

  console.log(`📊 Found ${churchesWithMultiple.length} churches with 2+ boundaries\n`);

  const allBoundaryIds = new Set<string>();
  for (const church of churchesWithMultiple) {
    for (const id of church.boundary_ids || []) {
      allBoundaryIds.add(id);
    }
  }

  console.log(`🔍 Fetching details for ${allBoundaryIds.size} unique boundaries...\n`);

  const boundaryIdArray = Array.from(allBoundaryIds);
  const boundaries: BoundaryInfo[] = [];
  const batchSize = 100;

  for (let i = 0; i < boundaryIdArray.length; i += batchSize) {
    const batch = boundaryIdArray.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from("boundaries")
      .select("id, name, type")
      .in("id", batch);

    if (error) {
      console.error("Error fetching boundaries batch:", error);
      continue;
    }

    if (data) {
      boundaries.push(...data);
    }
  }

  console.log(`  Fetched ${boundaries.length} boundaries\n`);

  const boundaryMap = new Map<string, BoundaryInfo>();
  for (const b of boundaries) {
    boundaryMap.set(b.id, b);
  }

  const churchesToUpdate: { id: string; name: string; oldIds: string[]; newIds: string[]; removed: string[] }[] = [];

  for (const church of churchesWithMultiple) {
    const boundaryIds = church.boundary_ids || [];
    const churchBoundaries = boundaryIds
      .map((id) => ({ id, ...boundaryMap.get(id) }))
      .filter((b): b is { id: string } & BoundaryInfo => b.name !== undefined);

    const placeBoundaries = churchBoundaries.filter((b) => b.type === "place");
    const countySubBoundaries = churchBoundaries.filter((b) => b.type === "county subdivision");

    const idsToRemove = new Set<string>();

    for (const placeBoundary of placeBoundaries) {
      const placeNormalized = normalizeForComparison(placeBoundary.name);

      for (const countySubBoundary of countySubBoundaries) {
        const countySubNormalized = normalizeForComparison(countySubBoundary.name);

        if (placeNormalized === countySubNormalized) {
          idsToRemove.add(countySubBoundary.id);
        }
      }
    }

    if (idsToRemove.size > 0) {
      const newIds = boundaryIds.filter((id) => !idsToRemove.has(id));
      churchesToUpdate.push({
        id: church.id,
        name: church.name,
        oldIds: boundaryIds,
        newIds,
        removed: Array.from(idsToRemove),
      });
    }
  }

  if (churchesToUpdate.length === 0) {
    console.log("✅ No duplicate county subdivisions found. Nothing to clean up.");
    return;
  }

  console.log(`🧹 Found ${churchesToUpdate.length} churches with duplicate county subdivisions to remove\n`);
  console.log("Sample churches to update:");
  churchesToUpdate.slice(0, 10).forEach((c) => {
    const removedNames = c.removed.map((id) => boundaryMap.get(id)?.name || id).join(", ");
    console.log(`  - ${c.name}: removing "${removedNames}"`);
  });
  console.log("\n");

  console.log("🚀 Updating churches...\n");

  let updated = 0;
  let errors = 0;
  const updateBatchSize = 50;

  for (let i = 0; i < churchesToUpdate.length; i += updateBatchSize) {
    const batch = churchesToUpdate.slice(i, i + updateBatchSize);

    for (const church of batch) {
      const { error: updateError } = await supabase
        .from("churches")
        .update({ boundary_ids: church.newIds.length > 0 ? church.newIds : null })
        .eq("id", church.id);

      if (updateError) {
        console.error(`  ❌ Error updating ${church.name}:`, updateError.message);
        errors++;
      } else {
        updated++;
      }
    }

    console.log(`  Progress: ${Math.min(i + updateBatchSize, churchesToUpdate.length)}/${churchesToUpdate.length} churches processed`);
  }

  console.log("\n📊 Summary:");
  console.log(`  ✅ Updated: ${updated} churches`);
  console.log(`  ❌ Errors: ${errors} churches`);
  console.log(`  📉 Duplicate county subdivisions removed from ${updated} churches`);
}

removeDuplicateCountySubdivisions()
  .then(() => {
    console.log("\n✅ Duplicate cleanup complete!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
