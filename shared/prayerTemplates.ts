/**
 * Prayer Templates for Template-Based Prayers
 * These are rendered on-the-fly with church name/city substitution
 * No database storage needed - instant response times
 */

export const PRAYER_TEMPLATES = [
  // General Ministry (20)
  "Pray for {churchName}'s ministry",
  "Pray for the congregation at {churchName}",
  "Pray for {churchName} as they serve {city}",
  "Pray for the leaders of {churchName}",
  "Pray for revival and renewal at {churchName}",
  "Pray for {churchName}'s outreach to the community",
  "Pray for wisdom and guidance for {churchName}",
  "Pray for God's blessing upon {churchName}",
  "Pray for unity and fellowship at {churchName}",
  "Pray for {churchName}'s impact in {city}",
  "Pray for the families connected to {churchName}",
  "Pray for strength and perseverance for {churchName}",
  "Pray for {churchName}'s mission and vision",
  "Pray for spiritual growth at {churchName}",
  "Pray for God's provision for {churchName}",
  "Pray for the worship and praise at {churchName}",
  "Pray for {churchName} to be a light in {city}",
  "Pray for the pastoral team at {churchName}",
  "Pray for new believers at {churchName}",
  "Pray for {churchName}'s community partnerships",

  // Leadership & Staff (15)
  "Pray for the pastor and staff at {churchName}",
  "Pray for the elders and deacons of {churchName}",
  "Pray for church leadership decisions at {churchName}",
  "Pray for the volunteers serving at {churchName}",
  "Pray for the administrative team at {churchName}",
  "Pray for wisdom for {churchName}'s board members",
  "Pray for the worship leaders at {churchName}",
  "Pray for ministry coordinators at {churchName}",
  "Pray for the teaching ministry at {churchName}",
  "Pray for those called to serve at {churchName}",
  "Pray for the next generation of leaders at {churchName}",
  "Pray for mentorship relationships at {churchName}",
  "Pray for the prayer team at {churchName}",
  "Pray for counseling ministries at {churchName}",
  "Pray for staff families at {churchName}",

  // Youth & Children (15)
  "Pray for the children's ministry at {churchName}",
  "Pray for the youth group at {churchName}",
  "Pray for young people at {churchName}",
  "Pray for students connected to {churchName}",
  "Pray for the Sunday School at {churchName}",
  "Pray for VBS and summer programs at {churchName}",
  "Pray for youth leaders at {churchName}",
  "Pray for teenagers at {churchName} facing peer pressure",
  "Pray for children to know Jesus at {churchName}",
  "Pray for parents at {churchName} raising godly children",
  "Pray for the nursery ministry at {churchName}",
  "Pray for college students from {churchName}",
  "Pray for young adults at {churchName}",
  "Pray for youth retreats and camps at {churchName}",
  "Pray for faith formation of children at {churchName}",

  // Outreach & Missions (20)
  "Pray for {churchName}'s evangelism efforts",
  "Pray for missionaries supported by {churchName}",
  "Pray for {churchName}'s global mission partners",
  "Pray for local outreach from {churchName}",
  "Pray for {churchName} to reach the lost in {city}",
  "Pray for community service projects at {churchName}",
  "Pray for the gospel to spread through {churchName}",
  "Pray for {churchName}'s neighborhood ministry",
  "Pray for homeless outreach from {churchName}",
  "Pray for prison ministry at {churchName}",
  "Pray for food pantry efforts at {churchName}",
  "Pray for refugee support through {churchName}",
  "Pray for addiction recovery ministry at {churchName}",
  "Pray for those {churchName} is reaching in {city}",
  "Pray for short-term mission teams from {churchName}",
  "Pray for church planting efforts from {churchName}",
  "Pray for the unchurched near {churchName}",
  "Pray for open doors for the gospel at {churchName}",
  "Pray for bold witnesses at {churchName}",
  "Pray for {churchName}'s compassion ministries",

  // Spiritual Growth & Discipleship (15)
  "Pray for Bible study groups at {churchName}",
  "Pray for small groups at {churchName}",
  "Pray for discipleship at {churchName}",
  "Pray for spiritual maturity at {churchName}",
  "Pray for those being baptized at {churchName}",
  "Pray for new members at {churchName}",
  "Pray for deepening faith at {churchName}",
  "Pray for men's ministry at {churchName}",
  "Pray for women's ministry at {churchName}",
  "Pray for couples and marriage at {churchName}",
  "Pray for spiritual breakthroughs at {churchName}",
  "Pray for the prayer life of {churchName}",
  "Pray for Scripture engagement at {churchName}",
  "Pray for obedience to God's Word at {churchName}",
  "Pray for transformation at {churchName}",

  // Community & City Impact (15)
  "Pray for {churchName}'s influence in {city}",
  "Pray for {city} through {churchName}",
  "Pray for community healing through {churchName}",
  "Pray for {churchName} to serve {city} well",
  "Pray for local leaders connected to {churchName}",
  "Pray for schools near {churchName}",
  "Pray for first responders in {city} through {churchName}",
  "Pray for healthcare workers near {churchName}",
  "Pray for businesses partnering with {churchName}",
  "Pray for neighborhood safety around {churchName}",
  "Pray for city transformation through {churchName}",
  "Pray for civic engagement at {churchName}",
  "Pray for racial reconciliation at {churchName}",
  "Pray for justice and mercy through {churchName}",
  "Pray for {churchName}'s community presence",

  // Worship & Gatherings (10)
  "Pray for Sunday worship at {churchName}",
  "Pray for the presence of God at {churchName}",
  "Pray for anointed preaching at {churchName}",
  "Pray for the music ministry at {churchName}",
  "Pray for powerful worship at {churchName}",
  "Pray for online services at {churchName}",
  "Pray for special events at {churchName}",
  "Pray for holiday gatherings at {churchName}",
  "Pray for prayer meetings at {churchName}",
  "Pray for revival services at {churchName}",

  // Needs & Challenges (15)
  "Pray for financial provision for {churchName}",
  "Pray for building and facilities at {churchName}",
  "Pray for those struggling at {churchName}",
  "Pray for healing at {churchName}",
  "Pray for those grieving at {churchName}",
  "Pray for the unemployed at {churchName}",
  "Pray for families in crisis at {churchName}",
  "Pray for mental health support at {churchName}",
  "Pray for single parents at {churchName}",
  "Pray for the elderly at {churchName}",
  "Pray for those facing addiction at {churchName}",
  "Pray for the lonely at {churchName}",
  "Pray for those with health challenges at {churchName}",
  "Pray for those facing financial hardship at {churchName}",
  "Pray for broken relationships at {churchName}",

  // Unity & Collaboration (15)
  "Pray for unity among believers at {churchName}",
  "Pray for {churchName}'s partnerships with other churches",
  "Pray for the body of Christ in {city}",
  "Pray for church collaboration in {city}",
  "Pray for denominational unity through {churchName}",
  "Pray for ecumenical relationships at {churchName}",
  "Pray for pastors in {city} through {churchName}",
  "Pray for inter-church events in {city}",
  "Pray for the Kingdom vision at {churchName}",
  "Pray for humility and service at {churchName}",
  "Pray for forgiveness and reconciliation at {churchName}",
  "Pray for peace among members at {churchName}",
  "Pray for trust and transparency at {churchName}",
  "Pray for shared mission in {city}",
  "Pray for collaborative ministry through {churchName}",

  // Protection & Spiritual Warfare (10)
  "Pray for protection over {churchName}",
  "Pray for spiritual covering at {churchName}",
  "Pray against division at {churchName}",
  "Pray for discernment at {churchName}",
  "Pray for God's hedge around {churchName}",
  "Pray for freedom from bondage at {churchName}",
  "Pray for victory at {churchName}",
  "Pray for breakthrough at {churchName}",
  "Pray for the armor of God at {churchName}",
  "Pray for spiritual alertness at {churchName}",

  // Future & Vision (15)
  "Pray for God's vision for {churchName}",
  "Pray for the future of {churchName}",
  "Pray for strategic planning at {churchName}",
  "Pray for next steps at {churchName}",
  "Pray for growth at {churchName}",
  "Pray for new initiatives at {churchName}",
  "Pray for expansion at {churchName}",
  "Pray for sustainability at {churchName}",
  "Pray for generational impact through {churchName}",
  "Pray for legacy at {churchName}",
  "Pray for fresh vision at {churchName}",
  "Pray for bold faith at {churchName}",
  "Pray for open doors for {churchName}",
  "Pray for divine appointments at {churchName}",
  "Pray for God's timing at {churchName}",

  // Seasonal & Timely (15)
  "Pray for Easter celebrations at {churchName}",
  "Pray for Christmas services at {churchName}",
  "Pray for the new year at {churchName}",
  "Pray for back-to-school season at {churchName}",
  "Pray for summer ministries at {churchName}",
  "Pray for fall programs at {churchName}",
  "Pray for Thanksgiving outreach at {churchName}",
  "Pray for special seasons at {churchName}",
  "Pray for transitions at {churchName}",
  "Pray for new beginnings at {churchName}",
  "Pray for perseverance during challenges at {churchName}",
  "Pray for hope in difficult times at {churchName}",
  "Pray for joy in every season at {churchName}",
  "Pray for faithfulness at {churchName}",
  "Pray for endurance at {churchName}",
];

// Total: 180 templates

/**
 * Simple hash function for church IDs
 * Returns a number between 0 and max-1
 */
function hashChurchId(churchId: string, max: number): number {
  let hash = 0;
  for (let i = 0; i < churchId.length; i++) {
    const char = churchId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash) % max;
}

/**
 * Get the day of year (0-364) for daily rotation
 */
function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

/**
 * Calculate rotation offset for a church
 * Combines church-specific hash with daily rotation
 * This ensures:
 * - Different churches show different templates
 * - Same church shows different templates each day
 */
export function getChurchTemplateOffset(churchId: string): number {
  const churchHash = hashChurchId(churchId, PRAYER_TEMPLATES.length);
  const dayOffset = getDayOfYear() * 7; // Shift by 7 templates each day
  return (churchHash + dayOffset) % PRAYER_TEMPLATES.length;
}

/**
 * Body templates that pair with titles for richer content
 */
export const BODY_TEMPLATES = [
  "Join us in lifting up {churchName} and their ministry in {city}.",
  "Stand with {churchName} as they serve their community.",
  "Intercede for {churchName} and those they shepherd.",
  "Cover {churchName} in prayer as they pursue God's calling.",
  "Lift up {churchName} before the throne of grace.",
  "Partner in prayer with {churchName}.",
  "Support {churchName} through the power of prayer.",
  "Unite with {churchName} in seeking God's will.",
  "Pray alongside {churchName} for transformation.",
  "Agree in prayer with {churchName} for breakthrough.",
];

/**
 * Generate a template-based prayer for a church
 * Used for on-the-fly rendering without database storage
 */
export function generatePrayer(churchName: string, city: string | null): { title: string; body: string } {
  const template = PRAYER_TEMPLATES[Math.floor(Math.random() * PRAYER_TEMPLATES.length)];
  const bodyTemplate = BODY_TEMPLATES[Math.floor(Math.random() * BODY_TEMPLATES.length)];
  
  const title = template
    .replace(/{churchName}/g, churchName)
    .replace(/{city}/g, city || 'their community');
  
  const body = bodyTemplate
    .replace(/{churchName}/g, churchName)
    .replace(/{city}/g, city || 'their community');
  
  return { title, body };
}

/**
 * Generate a deterministic template prayer for a church
 * Uses church ID to ensure consistent prayers across requests
 * @param churchId - The church UUID
 * @param churchName - The church name
 * @param city - The city name
 * @param index - Which template to use (0-based)
 */
export function getTemplatePrayer(
  churchId: string, 
  churchName: string, 
  city: string | null, 
  index: number
): { 
  id: string; 
  title: string; 
  body: string; 
  isTemplate: true;
  templateIndex: number;
} {
  // Use modulo to cycle through templates
  const templateIndex = index % PRAYER_TEMPLATES.length;
  const bodyIndex = index % BODY_TEMPLATES.length;
  
  const template = PRAYER_TEMPLATES[templateIndex];
  const bodyTemplate = BODY_TEMPLATES[bodyIndex];
  
  const title = template
    .replace(/{churchName}/g, churchName)
    .replace(/{city}/g, city || 'their community');
  
  const body = bodyTemplate
    .replace(/{churchName}/g, churchName)
    .replace(/{city}/g, city || 'their community');
  
  // Create a deterministic ID: template-{churchId}-{index}
  const id = `template-${churchId}-${templateIndex}`;
  
  return { 
    id, 
    title, 
    body, 
    isTemplate: true,
    templateIndex 
  };
}

/**
 * Get multiple template prayers for a church
 * Uses rotation offset so different churches show different templates
 * and templates change daily
 */
export function getTemplatePrayersForChurch(
  churchId: string,
  churchName: string,
  city: string | null,
  count: number = 5
): ReturnType<typeof getTemplatePrayer>[] {
  const offset = getChurchTemplateOffset(churchId);
  const prayers = [];
  for (let i = 0; i < count; i++) {
    prayers.push(getTemplatePrayer(churchId, churchName, city, offset + i));
  }
  return prayers;
}
