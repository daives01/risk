import type { ContinentId, GraphMap, TerritoryId } from "risk-engine";

const t = (id: string) => id as TerritoryId;
const c = (id: string) => id as ContinentId;

/**
 * Classic Risk map: 42 territories, 6 continents.
 * Territory IDs use short kebab-case names.
 */
export const classicMap: GraphMap = {
  territories: {
    // ── North America (9) ──
    "alaska": { name: "Alaska", continentId: c("north-america") },
    "northwest-territory": { name: "Northwest Territory", continentId: c("north-america") },
    "greenland": { name: "Greenland", continentId: c("north-america") },
    "alberta": { name: "Alberta", continentId: c("north-america") },
    "ontario": { name: "Ontario", continentId: c("north-america") },
    "quebec": { name: "Quebec", continentId: c("north-america") },
    "western-us": { name: "Western United States", continentId: c("north-america") },
    "eastern-us": { name: "Eastern United States", continentId: c("north-america") },
    "central-america": { name: "Central America", continentId: c("north-america") },

    // ── South America (4) ──
    "venezuela": { name: "Venezuela", continentId: c("south-america") },
    "peru": { name: "Peru", continentId: c("south-america") },
    "brazil": { name: "Brazil", continentId: c("south-america") },
    "argentina": { name: "Argentina", continentId: c("south-america") },

    // ── Europe (7) ──
    "iceland": { name: "Iceland", continentId: c("europe") },
    "scandinavia": { name: "Scandinavia", continentId: c("europe") },
    "great-britain": { name: "Great Britain", continentId: c("europe") },
    "northern-europe": { name: "Northern Europe", continentId: c("europe") },
    "western-europe": { name: "Western Europe", continentId: c("europe") },
    "southern-europe": { name: "Southern Europe", continentId: c("europe") },
    "ukraine": { name: "Ukraine", continentId: c("europe") },

    // ── Africa (6) ──
    "north-africa": { name: "North Africa", continentId: c("africa") },
    "egypt": { name: "Egypt", continentId: c("africa") },
    "east-africa": { name: "East Africa", continentId: c("africa") },
    "congo": { name: "Congo", continentId: c("africa") },
    "south-africa": { name: "South Africa", continentId: c("africa") },
    "madagascar": { name: "Madagascar", continentId: c("africa") },

    // ── Asia (12) ──
    "ural": { name: "Ural", continentId: c("asia") },
    "siberia": { name: "Siberia", continentId: c("asia") },
    "yakutsk": { name: "Yakutsk", continentId: c("asia") },
    "kamchatka": { name: "Kamchatka", continentId: c("asia") },
    "irkutsk": { name: "Irkutsk", continentId: c("asia") },
    "mongolia": { name: "Mongolia", continentId: c("asia") },
    "japan": { name: "Japan", continentId: c("asia") },
    "afghanistan": { name: "Afghanistan", continentId: c("asia") },
    "china": { name: "China", continentId: c("asia") },
    "middle-east": { name: "Middle East", continentId: c("asia") },
    "india": { name: "India", continentId: c("asia") },
    "siam": { name: "Siam", continentId: c("asia") },

    // ── Australia (4) ──
    "indonesia": { name: "Indonesia", continentId: c("australia") },
    "new-guinea": { name: "New Guinea", continentId: c("australia") },
    "western-australia": { name: "Western Australia", continentId: c("australia") },
    "eastern-australia": { name: "Eastern Australia", continentId: c("australia") },
  },

  adjacency: {
    // ── North America ──
    "alaska": [t("northwest-territory"), t("alberta"), t("kamchatka")],
    "northwest-territory": [t("alaska"), t("alberta"), t("ontario"), t("greenland")],
    "greenland": [t("northwest-territory"), t("ontario"), t("quebec"), t("iceland")],
    "alberta": [t("alaska"), t("northwest-territory"), t("ontario"), t("western-us")],
    "ontario": [t("northwest-territory"), t("alberta"), t("greenland"), t("quebec"), t("western-us"), t("eastern-us")],
    "quebec": [t("ontario"), t("greenland"), t("eastern-us")],
    "western-us": [t("alberta"), t("ontario"), t("eastern-us"), t("central-america")],
    "eastern-us": [t("ontario"), t("quebec"), t("western-us"), t("central-america")],
    "central-america": [t("western-us"), t("eastern-us"), t("venezuela")],

    // ── South America ──
    "venezuela": [t("central-america"), t("peru"), t("brazil")],
    "peru": [t("venezuela"), t("brazil"), t("argentina")],
    "brazil": [t("venezuela"), t("peru"), t("argentina"), t("north-africa")],
    "argentina": [t("peru"), t("brazil")],

    // ── Europe ──
    "iceland": [t("greenland"), t("scandinavia"), t("great-britain")],
    "scandinavia": [t("iceland"), t("great-britain"), t("northern-europe"), t("ukraine")],
    "great-britain": [t("iceland"), t("scandinavia"), t("northern-europe"), t("western-europe")],
    "northern-europe": [t("scandinavia"), t("great-britain"), t("western-europe"), t("southern-europe"), t("ukraine")],
    "western-europe": [t("great-britain"), t("northern-europe"), t("southern-europe"), t("north-africa")],
    "southern-europe": [t("northern-europe"), t("western-europe"), t("ukraine"), t("north-africa"), t("egypt"), t("middle-east")],
    "ukraine": [t("scandinavia"), t("northern-europe"), t("southern-europe"), t("ural"), t("afghanistan"), t("middle-east")],

    // ── Africa ──
    "north-africa": [t("brazil"), t("western-europe"), t("southern-europe"), t("egypt"), t("east-africa"), t("congo")],
    "egypt": [t("southern-europe"), t("north-africa"), t("east-africa"), t("middle-east")],
    "east-africa": [t("north-africa"), t("egypt"), t("congo"), t("south-africa"), t("madagascar"), t("middle-east")],
    "congo": [t("north-africa"), t("east-africa"), t("south-africa")],
    "south-africa": [t("congo"), t("east-africa"), t("madagascar")],
    "madagascar": [t("south-africa"), t("east-africa")],

    // ── Asia ──
    "ural": [t("ukraine"), t("siberia"), t("china"), t("afghanistan")],
    "siberia": [t("ural"), t("yakutsk"), t("irkutsk"), t("mongolia"), t("china")],
    "yakutsk": [t("siberia"), t("irkutsk"), t("kamchatka")],
    "kamchatka": [t("alaska"), t("yakutsk"), t("irkutsk"), t("mongolia"), t("japan")],
    "irkutsk": [t("siberia"), t("yakutsk"), t("kamchatka"), t("mongolia")],
    "mongolia": [t("siberia"), t("irkutsk"), t("kamchatka"), t("japan"), t("china")],
    "japan": [t("kamchatka"), t("mongolia")],
    "afghanistan": [t("ukraine"), t("ural"), t("china"), t("india"), t("middle-east")],
    "china": [t("ural"), t("siberia"), t("mongolia"), t("afghanistan"), t("india"), t("siam")],
    "middle-east": [t("ukraine"), t("southern-europe"), t("egypt"), t("east-africa"), t("afghanistan"), t("india")],
    "india": [t("afghanistan"), t("china"), t("middle-east"), t("siam")],
    "siam": [t("china"), t("india"), t("indonesia")],

    // ── Australia ──
    "indonesia": [t("siam"), t("new-guinea"), t("western-australia")],
    "new-guinea": [t("indonesia"), t("western-australia"), t("eastern-australia")],
    "western-australia": [t("indonesia"), t("new-guinea"), t("eastern-australia")],
    "eastern-australia": [t("new-guinea"), t("western-australia")],
  },

  continents: {
    "north-america": {
      bonus: 5,
      territoryIds: [
        t("alaska"), t("northwest-territory"), t("greenland"), t("alberta"),
        t("ontario"), t("quebec"), t("western-us"), t("eastern-us"), t("central-america"),
      ],
    },
    "south-america": {
      bonus: 2,
      territoryIds: [t("venezuela"), t("peru"), t("brazil"), t("argentina")],
    },
    "europe": {
      bonus: 5,
      territoryIds: [
        t("iceland"), t("scandinavia"), t("great-britain"), t("northern-europe"),
        t("western-europe"), t("southern-europe"), t("ukraine"),
      ],
    },
    "africa": {
      bonus: 3,
      territoryIds: [
        t("north-africa"), t("egypt"), t("east-africa"), t("congo"),
        t("south-africa"), t("madagascar"),
      ],
    },
    "asia": {
      bonus: 7,
      territoryIds: [
        t("ural"), t("siberia"), t("yakutsk"), t("kamchatka"), t("irkutsk"),
        t("mongolia"), t("japan"), t("afghanistan"), t("china"), t("middle-east"),
        t("india"), t("siam"),
      ],
    },
    "australia": {
      bonus: 2,
      territoryIds: [
        t("indonesia"), t("new-guinea"), t("western-australia"), t("eastern-australia"),
      ],
    },
  },
};
