// Builds data/country_totals.js: how many objects the WHOLE Smithsonian Open Access
// collection holds for each country on the map. The dashboard divides the miscellaneous
// objects by these totals, so the map shows a rate instead of the size of each collection.
// Run this with: node build-country-totals.js   (uses keys.js, like download-data.js)

const fs = require("fs");

const SI_URL = "https://api.si.edu/openaccess/api/v1.0/search";
const WORLD_URL = "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson";

// Read the local key without putting it in this file.
const keyFile = fs.readFileSync("keys.js", "utf8");
const SI_KEY = keyFile.match(/"([^"]+)"/)[1];

// Map country name -> the "place" values that mean that country in the Smithsonian records.
// The API matches place values exactly and has no OR, so two names are combined as
// A + B - (A and B). "exclude" drops records that also name another place.
const placeQueries = {
  "USA": { names: ["United States"] },
  "England": { names: ["United Kingdom", "England"] },
  "United Republic of Tanzania": { names: ["Tanzania"] },
  "Republic of Serbia": { names: ["Serbia"] },
  "The Bahamas": { names: ["Bahamas"] },
  "Myanmar": { names: ["Myanmar", "Burma"] },
  "Guinea Bissau": { names: ["Guinea-Bissau"] },
  "East Timor": { names: ["Timor-Leste", "East Timor"] },
  "Macedonia": { names: ["Macedonia", "North Macedonia"] },
  "Swaziland": { names: ["Swaziland", "Eswatini"] },
  "Czech Republic": { names: ["Czech Republic", "Czechia"] },
  // The country, not the U.S. state (matches how dashboard.js counts Georgia)
  "Georgia": { names: ["Georgia"], exclude: ["United States", "North America"] }
};

async function countObjects(query) {
  const url = `${SI_URL}?api_key=${SI_KEY}&q=${encodeURIComponent(query)}&rows=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status} for ${query}`);
  const json = await res.json();
  return json.response?.rowCount || 0;
}

const placeTerm = name => `place:"${name}"`;

async function countCountry(countryName) {
  const { names = [countryName], exclude = [] } = placeQueries[countryName] || {};
  const not = exclude.map(name => ` -${placeTerm(name)}`).join("");
  const counts = await Promise.all(names.map(name => countObjects(placeTerm(name) + not)));
  if (names.length === 1) return counts[0];
  const both = await countObjects(`${placeTerm(names[0])} AND ${placeTerm(names[1])}${not}`);
  return counts[0] + counts[1] - both;
}

async function main() {
  const world = await fetch(WORLD_URL).then(res => res.json());
  const countryNames = world.features.map(f => f.properties.name);

  const collectionTotal = await countObjects("*");
  const countries = {};

  // A few requests at a time to stay well inside the API rate limit
  for (let i = 0; i < countryNames.length; i += 4) {
    const batch = countryNames.slice(i, i + 4);
    const totals = await Promise.all(batch.map(countCountry));
    batch.forEach((name, j) => { countries[name] = totals[j]; });
    console.log(`Counted ${Math.min(i + 4, countryNames.length)} of ${countryNames.length} countries`);
  }

  const output = {
    retrieved: new Date().toISOString().slice(0, 10),
    collectionTotal,
    countries
  };
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/country_totals.js", `window.COUNTRY_TOTALS = ${JSON.stringify(output, null, 2)};\n`);
  console.log(`Saved totals for ${countryNames.length} countries to data/country_totals.js`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
