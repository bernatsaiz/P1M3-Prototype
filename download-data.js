// One-time downloader based on Project01/00-fetch-si-js/main.js.
// Run this with: node download-data.js

const fs = require("fs");
const https = require("https");

const SI_URL = "https://api.si.edu/openaccess/api/v1.0/search";
const OBJS_PER_QUERY = 1000;
const QUERY_TERMS = ["miscellaneous", "misc"];

// Read the local key without putting it in this file.
const keyFile = fs.readFileSync("keys.js", "utf8");
const SI_KEY = keyFile.match(/"([^"]+)"/)[1];

// "misc" includes both misc and miscellaneous, without requiring it to be the only word.
function hasMiscName(value) {
  const name = (value || "").toLowerCase();
  return name.includes("misc") || name.includes("miscellaneous");
}

function isMatchingObject(row) {
  // Checking the objectType array structure from the dataset records[cite: 8]
  const objectNames = row.content?.freetext?.objectType || [];
  return objectNames.some(obj => hasMiscName(obj.content));
}

// Helper function to query the Smithsonian API with pagination support
function fetchQuery(query, start = 0) {
  return new Promise((resolve, reject) => {
    const url = `${SI_URL}?api_key=${SI_KEY}&q=${encodeURIComponent(query)}&start=${start}&rows=${OBJS_PER_QUERY}`;
    
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error("Failed to parse JSON response: " + e.message));
        }
      });
    }).on("error", (err) => {
      reject(err);
    });
  });
}

async function main() {
  const matchedRecords = [];

  for (const term of QUERY_TERMS) {
    let start = 0;
    let total = 1; // Initial placeholder to start the pagination loop

    console.log(`Fetching records for query term: "${term}"...`);

    while (start < total) {
      try {
        const response = await fetchQuery(term, start);
        const rows = response.response?.rows || [];
        total = response.response?.rowCount || 0;

        for (const row of rows) {
          if (isMatchingObject(row)) {
            // Prevent duplicate entries if a record matches multiple query terms
            if (!matchedRecords.some(r => r.id === row.id)) {
              matchedRecords.push(row);
            }
          }
        }

        start += OBJS_PER_QUERY;
        console.log(`Processed up to ${Math.min(start, total)} of ${total} records for "${term}"`);
      } catch (err) {
        console.error(`Error fetching data for "${term}" at start=${start}:`, err.message);
        break;
      }
    }
  }

  // Save the filtered results to a local JSON file
  fs.writeFileSync("miscellaneous_results.json", JSON.stringify(matchedRecords, null, 2));
  console.log(`Done! Successfully saved ${matchedRecords.length} matching records to miscellaneous_results.json`);
}

main();