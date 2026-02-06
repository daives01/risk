export const PLAYER_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  p0: { bg: "bg-red-500", border: "border-red-600", text: "text-red-500" },
  p1: { bg: "bg-blue-500", border: "border-blue-600", text: "text-blue-500" },
  p2: { bg: "bg-green-500", border: "border-green-600", text: "text-green-500" },
  p3: { bg: "bg-yellow-500", border: "border-yellow-600", text: "text-yellow-500" },
  p4: { bg: "bg-purple-500", border: "border-purple-600", text: "text-purple-500" },
  p5: { bg: "bg-orange-500", border: "border-orange-600", text: "text-orange-500" },
  neutral: { bg: "bg-gray-400", border: "border-gray-500", text: "text-gray-400" },
};

export const CONTINENT_DISPLAY: Record<string, { name: string; color: string }> = {
  "north-america": { name: "North America", color: "bg-amber-50 border-amber-200" },
  "south-america": { name: "South America", color: "bg-red-50 border-red-200" },
  "europe": { name: "Europe", color: "bg-blue-50 border-blue-200" },
  "africa": { name: "Africa", color: "bg-orange-50 border-orange-200" },
  "asia": { name: "Asia", color: "bg-green-50 border-green-200" },
  "australia": { name: "Australia", color: "bg-purple-50 border-purple-200" },
};

export const TERRITORY_DISPLAY: Record<string, { name: string; continent: string }> = {
  // North America
  "alaska": { name: "Alaska", continent: "north-america" },
  "northwest-territory": { name: "NW Territory", continent: "north-america" },
  "greenland": { name: "Greenland", continent: "north-america" },
  "alberta": { name: "Alberta", continent: "north-america" },
  "ontario": { name: "Ontario", continent: "north-america" },
  "quebec": { name: "Quebec", continent: "north-america" },
  "western-us": { name: "W. United States", continent: "north-america" },
  "eastern-us": { name: "E. United States", continent: "north-america" },
  "central-america": { name: "Central America", continent: "north-america" },
  // South America
  "venezuela": { name: "Venezuela", continent: "south-america" },
  "peru": { name: "Peru", continent: "south-america" },
  "brazil": { name: "Brazil", continent: "south-america" },
  "argentina": { name: "Argentina", continent: "south-america" },
  // Europe
  "iceland": { name: "Iceland", continent: "europe" },
  "scandinavia": { name: "Scandinavia", continent: "europe" },
  "great-britain": { name: "Great Britain", continent: "europe" },
  "northern-europe": { name: "N. Europe", continent: "europe" },
  "western-europe": { name: "W. Europe", continent: "europe" },
  "southern-europe": { name: "S. Europe", continent: "europe" },
  "ukraine": { name: "Ukraine", continent: "europe" },
  // Africa
  "north-africa": { name: "N. Africa", continent: "africa" },
  "egypt": { name: "Egypt", continent: "africa" },
  "east-africa": { name: "E. Africa", continent: "africa" },
  "congo": { name: "Congo", continent: "africa" },
  "south-africa": { name: "S. Africa", continent: "africa" },
  "madagascar": { name: "Madagascar", continent: "africa" },
  // Asia
  "ural": { name: "Ural", continent: "asia" },
  "siberia": { name: "Siberia", continent: "asia" },
  "yakutsk": { name: "Yakutsk", continent: "asia" },
  "kamchatka": { name: "Kamchatka", continent: "asia" },
  "irkutsk": { name: "Irkutsk", continent: "asia" },
  "mongolia": { name: "Mongolia", continent: "asia" },
  "japan": { name: "Japan", continent: "asia" },
  "afghanistan": { name: "Afghanistan", continent: "asia" },
  "china": { name: "China", continent: "asia" },
  "middle-east": { name: "Middle East", continent: "asia" },
  "india": { name: "India", continent: "asia" },
  "siam": { name: "Siam", continent: "asia" },
  // Australia
  "indonesia": { name: "Indonesia", continent: "australia" },
  "new-guinea": { name: "New Guinea", continent: "australia" },
  "western-australia": { name: "W. Australia", continent: "australia" },
  "eastern-australia": { name: "E. Australia", continent: "australia" },
};

export function getTerritoriesByContinent(): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const [tid, info] of Object.entries(TERRITORY_DISPLAY)) {
    if (!groups[info.continent]) groups[info.continent] = [];
    groups[info.continent].push(tid);
  }
  return groups;
}
