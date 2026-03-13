export interface MetroArea {
  id: string;
  name: string;
  description: string;
  countyFips: string[];
  population?: string;
}

export const MICHIGAN_METRO_AREAS: MetroArea[] = [
  {
    id: "detroit",
    name: "Greater Detroit",
    description: "Detroit-Warren-Ann Arbor metro area including Thumb region",
    population: "5.4M",
    countyFips: [
      "26163", // Wayne County
      "26125", // Oakland County
      "26099", // Macomb County
      "26093", // Livingston County
      "26147", // St. Clair County
      "26087", // Lapeer County
      "26049", // Genesee County (Flint)
      "26161", // Washtenaw County (Ann Arbor)
      "26115", // Monroe County
      "26091", // Lenawee County (Adrian)
      "26063", // Huron County (Thumb)
      "26151", // Sanilac County (Thumb)
      "26157", // Tuscola County (Thumb)
    ],
  },
  {
    id: "grand-rapids",
    name: "Greater Grand Rapids",
    description: "Grand Rapids-Wyoming metro area and West Michigan",
    population: "1.5M",
    countyFips: [
      "26081", // Kent County
      "26139", // Ottawa County
      "26117", // Montcalm County
      "26067", // Ionia County
      "26015", // Barry County
      "26121", // Muskegon County
      "26005", // Allegan County (Holland)
      "26107", // Mecosta County (Big Rapids)
      "26123", // Newaygo County
      "26127", // Oceana County
      "26105", // Mason County (Ludington)
      "26085", // Lake County
    ],
  },
  {
    id: "lansing",
    name: "Greater Lansing",
    description: "Lansing-East Lansing metro area and mid-Michigan",
    population: "550K",
    countyFips: [
      "26065", // Ingham County
      "26045", // Eaton County
      "26037", // Clinton County
      "26155", // Shiawassee County (Owosso)
      "26075", // Jackson County
      "26057", // Gratiot County
    ],
  },
  {
    id: "kalamazoo",
    name: "Greater Kalamazoo",
    description: "Kalamazoo-Battle Creek-Portage metro area",
    population: "460K",
    countyFips: [
      "26077", // Kalamazoo County
      "26025", // Calhoun County (Battle Creek)
      "26149", // St. Joseph County (Sturgis)
      "26159", // Van Buren County
      "26023", // Branch County (Coldwater)
      "26059", // Hillsdale County
    ],
  },
  {
    id: "saginaw-bay",
    name: "Saginaw / Bay City / Midland",
    description: "Tri-Cities metro area and central Michigan",
    population: "380K",
    countyFips: [
      "26145", // Saginaw County
      "26017", // Bay County
      "26111", // Midland County
      "26011", // Arenac County
      "26051", // Gladwin County
      "26035", // Clare County
      "26073", // Isabella County (Mt. Pleasant)
    ],
  },
  {
    id: "southwest",
    name: "Southwest Michigan",
    description: "Niles-Benton Harbor corridor along Indiana border",
    population: "200K",
    countyFips: [
      "26021", // Berrien County (Niles, St. Joseph, Benton Harbor)
      "26027", // Cass County
    ],
  },
  {
    id: "traverse-city",
    name: "Traverse City / Northern Lower",
    description: "Grand Traverse Bay region and northern Lower Peninsula",
    population: "350K",
    countyFips: [
      "26055", // Grand Traverse County
      "26089", // Leelanau County
      "26019", // Benzie County
      "26009", // Antrim County
      "26079", // Kalkaska County
      "26165", // Wexford County (Cadillac)
      "26113", // Missaukee County
      "26101", // Manistee County
      "26029", // Charlevoix County
      "26047", // Emmet County (Petoskey)
    ],
  },
  {
    id: "up-east",
    name: "Upper Peninsula East",
    description: "Eastern U.P. including Sault Ste. Marie and Mackinac",
    population: "80K",
    countyFips: [
      "26033", // Chippewa County (Sault Ste. Marie)
      "26097", // Mackinac County
      "26095", // Luce County
      "26153", // Schoolcraft County
      "26003", // Alger County (Munising)
      "26041", // Delta County (Escanaba)
    ],
  },
  {
    id: "up-west",
    name: "Upper Peninsula West",
    description: "Western U.P. including Marquette and the Keweenaw",
    population: "120K",
    countyFips: [
      "26103", // Marquette County
      "26043", // Dickinson County (Iron Mountain)
      "26109", // Menominee County
      "26071", // Iron County
      "26013", // Baraga County
      "26061", // Houghton County
      "26083", // Keweenaw County
      "26131", // Ontonagon County
      "26053", // Gogebic County
    ],
  },
  {
    id: "northern-michigan",
    name: "Northern Michigan",
    description: "Northeast Lower Peninsula and interior northern counties",
    population: "200K",
    countyFips: [
      "26007", // Alpena County
      "26001", // Alcona County
      "26069", // Iosco County (Tawas)
      "26129", // Ogemaw County
      "26143", // Roscommon County
      "26039", // Crawford County (Grayling)
      "26137", // Otsego County (Gaylord)
      "26119", // Montmorency County
      "26141", // Presque Isle County
      "26031", // Cheboygan County
      "26135", // Oscoda County
      "26133", // Osceola County
    ],
  },
];

export function getMetroAreaForCounty(countyFips: string): MetroArea | undefined {
  return MICHIGAN_METRO_AREAS.find((area) =>
    area.countyFips.includes(countyFips)
  );
}

export function getCountiesInMetroArea(metroAreaId: string): string[] {
  const area = MICHIGAN_METRO_AREAS.find((a) => a.id === metroAreaId);
  return area?.countyFips || [];
}
