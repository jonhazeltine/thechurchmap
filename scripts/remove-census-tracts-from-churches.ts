import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface Church {
  id: string;
  name: string;
  boundary_ids: string[] | null;
}

async function removeCensusTractsFromChurches() {
  console.log("🔍 Finding all census_tract boundaries...\n");

  const { data: censusTractBoundaries, error: boundaryError } = await supabase
    .from("boundaries")
    .select("id, name, external_id")
    .eq("type", "census_tract");

  if (boundaryError) {
    console.error("Error fetching census tract boundaries:", boundaryError);
    return;
  }

  if (!censusTractBoundaries || censusTractBoundaries.length === 0) {
    console.log("✅ No census_tract boundaries found. Nothing to clean up.");
    return;
  }

  const censusTractIds = new Set(censusTractBoundaries.map((b) => b.id));
  console.log(`📊 Found ${censusTractIds.size} census_tract boundaries\n`);
  console.log("Sample census tracts:");
  censusTractBoundaries.slice(0, 5).forEach((b) => {
    console.log(`  - ${b.name} (${b.external_id})`);
  });
  console.log("\n");

  console.log("🔍 Finding churches with census_tract boundaries attached...\n");

  const { data: churches, error: churchError } = await supabase
    .from("churches")
    .select("id, name, boundary_ids")
    .not("boundary_ids", "is", null);

  if (churchError) {
    console.error("Error fetching churches:", churchError);
    return;
  }

  if (!churches || churches.length === 0) {
    console.log("✅ No churches have any boundaries attached.");
    return;
  }

  console.log(`📊 Found ${churches.length} churches with boundaries\n`);

  const churchesToUpdate: { id: string; name: string; oldIds: string[]; newIds: string[] }[] = [];

  for (const church of churches) {
    const boundaryIds = church.boundary_ids || [];
    const newBoundaryIds = boundaryIds.filter((id: string) => !censusTractIds.has(id));

    if (newBoundaryIds.length < boundaryIds.length) {
      churchesToUpdate.push({
        id: church.id,
        name: church.name,
        oldIds: boundaryIds,
        newIds: newBoundaryIds,
      });
    }
  }

  if (churchesToUpdate.length === 0) {
    console.log("✅ No churches have census_tract boundaries attached. Nothing to clean up.");
    return;
  }

  console.log(`🧹 Found ${churchesToUpdate.length} churches with census_tract boundaries to remove\n`);
  console.log("Sample churches to update:");
  churchesToUpdate.slice(0, 10).forEach((c) => {
    const removed = c.oldIds.length - c.newIds.length;
    console.log(`  - ${c.name}: ${c.oldIds.length} → ${c.newIds.length} boundaries (removing ${removed} census tracts)`);
  });
  console.log("\n");

  console.log("🚀 Updating churches...\n");

  let updated = 0;
  let errors = 0;
  const batchSize = 50;

  for (let i = 0; i < churchesToUpdate.length; i += batchSize) {
    const batch = churchesToUpdate.slice(i, i + batchSize);

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

    console.log(`  Progress: ${Math.min(i + batchSize, churchesToUpdate.length)}/${churchesToUpdate.length} churches processed`);
  }

  console.log("\n📊 Summary:");
  console.log(`  ✅ Updated: ${updated} churches`);
  console.log(`  ❌ Errors: ${errors} churches`);
  console.log(`  📉 Census tract boundaries removed from ${updated} churches`);
}

removeCensusTractsFromChurches()
  .then(() => {
    console.log("\n✅ Census tract cleanup complete!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
