import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface BoundaryInfo {
  id: string;
  name: string;
  type: string;
  external_id: string | null;
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

async function analyzeDuplicateBoundaries() {
  console.log("🔍 Analyzing potential duplicate boundaries on churches...\n");

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
    const { data, error: boundaryError } = await supabase
      .from("boundaries")
      .select("id, name, type, external_id")
      .in("id", batch);

    if (boundaryError) {
      console.error("Error fetching boundaries batch:", boundaryError);
      continue;
    }

    if (data) {
      boundaries.push(...data);
    }
  }

  console.log(`  Fetched ${boundaries.length} boundaries\n`);

  const boundaryMap = new Map<string, BoundaryInfo>();
  for (const b of boundaries || []) {
    boundaryMap.set(b.id, b);
  }

  const duplicatePatterns: {
    churchId: string;
    churchName: string;
    duplicates: { boundary1: BoundaryInfo; boundary2: BoundaryInfo }[];
  }[] = [];

  for (const church of churchesWithMultiple) {
    const churchBoundaries = (church.boundary_ids || [])
      .map((id) => boundaryMap.get(id))
      .filter((b): b is BoundaryInfo => b !== undefined);

    const foundDuplicates: { boundary1: BoundaryInfo; boundary2: BoundaryInfo }[] = [];

    for (let i = 0; i < churchBoundaries.length; i++) {
      for (let j = i + 1; j < churchBoundaries.length; j++) {
        const b1 = churchBoundaries[i];
        const b2 = churchBoundaries[j];

        const norm1 = normalizeForComparison(b1.name);
        const norm2 = normalizeForComparison(b2.name);

        if (norm1 === norm2 && b1.type !== b2.type) {
          foundDuplicates.push({ boundary1: b1, boundary2: b2 });
        }
      }
    }

    if (foundDuplicates.length > 0) {
      duplicatePatterns.push({
        churchId: church.id,
        churchName: church.name,
        duplicates: foundDuplicates,
      });
    }
  }

  console.log(`\n📊 ANALYSIS RESULTS\n${"=".repeat(60)}\n`);
  console.log(`Churches with potential duplicate boundaries: ${duplicatePatterns.length}\n`);

  const pairCounts = new Map<string, number>();
  for (const pattern of duplicatePatterns) {
    for (const dup of pattern.duplicates) {
      const key = `${dup.boundary1.type} + ${dup.boundary2.type}`;
      pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
    }
  }

  console.log("Duplicate type combinations:");
  for (const [pair, count] of Array.from(pairCounts.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pair}: ${count} churches`);
  }

  console.log(`\n\nSAMPLE DUPLICATES (first 20):\n${"=".repeat(60)}\n`);

  for (const pattern of duplicatePatterns.slice(0, 20)) {
    console.log(`\n📍 ${pattern.churchName}`);
    for (const dup of pattern.duplicates) {
      console.log(`   └─ "${dup.boundary1.name}" (${dup.boundary1.type})`);
      console.log(`      "${dup.boundary2.name}" (${dup.boundary2.type})`);
    }
  }

  const uniqueDuplicatePairs = new Map<string, { b1: BoundaryInfo; b2: BoundaryInfo; count: number }>();
  for (const pattern of duplicatePatterns) {
    for (const dup of pattern.duplicates) {
      const ids = [dup.boundary1.id, dup.boundary2.id].sort();
      const key = ids.join("|");
      if (!uniqueDuplicatePairs.has(key)) {
        uniqueDuplicatePairs.set(key, { b1: dup.boundary1, b2: dup.boundary2, count: 0 });
      }
      uniqueDuplicatePairs.get(key)!.count++;
    }
  }

  console.log(`\n\nUNIQUE BOUNDARY PAIRS TO CONSIDER MERGING:\n${"=".repeat(60)}\n`);
  console.log(`Found ${uniqueDuplicatePairs.size} unique pairs of boundaries that appear as duplicates\n`);

  const sortedPairs = Array.from(uniqueDuplicatePairs.values()).sort((a, b) => b.count - a.count);

  console.log("Top 30 most common duplicate pairs:");
  for (const pair of sortedPairs.slice(0, 30)) {
    console.log(`\n  Churches affected: ${pair.count}`);
    console.log(`    "${pair.b1.name}" (${pair.b1.type}, id: ${pair.b1.id.slice(0, 8)}...)`);
    console.log(`    "${pair.b2.name}" (${pair.b2.type}, id: ${pair.b2.id.slice(0, 8)}...)`);
  }

  console.log(`\n\n${"=".repeat(60)}`);
  console.log("RECOMMENDATION:");
  console.log("=".repeat(60));
  console.log(`
For each duplicate pair, we should:
1. Keep the 'place' boundary (preferred - official census designation)
2. Remove the 'county_subdivision' boundary ID from affected churches

This will reduce clutter while preserving the most authoritative boundary.
  `);
}

analyzeDuplicateBoundaries()
  .then(() => {
    console.log("\n✅ Analysis complete!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
