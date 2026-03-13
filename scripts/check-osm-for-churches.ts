// Check if Ignite and Mosaic churches exist in OSM

async function checkOSM() {
  // Search OSM for churches with these names in Michigan
  const query = `
    [out:json][timeout:60];
    area["ISO3166-2"="US-MI"][admin_level=4]->.michigan;
    (
      node["amenity"="place_of_worship"]["name"~"Ignite|Mosaic",i](area.michigan);
      way["amenity"="place_of_worship"]["name"~"Ignite|Mosaic",i](area.michigan);
      relation["amenity"="place_of_worship"]["name"~"Ignite|Mosaic",i](area.michigan);
    );
    out center;
  `;
  
  const url = 'https://overpass-api.de/api/interpreter';
  
  console.log('Searching OSM for Ignite and Mosaic churches in Michigan...\n');
  
  const response = await fetch(url, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  
  if (!response.ok) {
    console.error('Overpass API error:', response.status);
    return;
  }
  
  const data = await response.json();
  
  console.log(`Found ${data.elements?.length || 0} results in OSM:\n`);
  
  data.elements?.forEach((el: any) => {
    const lat = el.lat || el.center?.lat;
    const lon = el.lon || el.center?.lon;
    console.log(`Name: ${el.tags?.name || 'Unnamed'}`);
    console.log(`  Type: ${el.type}/${el.id}`);
    console.log(`  Denomination: ${el.tags?.denomination || 'N/A'}`);
    console.log(`  City: ${el.tags?.['addr:city'] || 'N/A'}`);
    console.log(`  Location: ${lat}, ${lon}`);
    console.log('');
  });
}

checkOSM().catch(console.error);
