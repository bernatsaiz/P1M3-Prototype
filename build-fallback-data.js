// Builds data/miscellaneous_slim.js from miscellaneous_results.json.
// It keeps only the fields dashboard.js reads, wrapped in a <script>-loadable file,
// so the charts still draw when index.html is opened straight from the file system
// (file://), where the browser blocks fetch().
// Run this again after re-downloading the data with: node build-fallback-data.js

const fs = require("fs");

const records = JSON.parse(fs.readFileSync("miscellaneous_results.json", "utf8"));
const text = list => (list || []).map(item => typeof item === "string" ? item : item.content);

const slim = records.map(record => {
  const freetext = record.content?.freetext || {};
  const indexed = record.content?.indexedStructured || {};
  return {
    id: record.id,
    title: (record.title || "").slice(0, 160),
    unitCode: record.unitCode,
    content: {
      freetext: {
        place: text(freetext.place),
        objectType: text(freetext.objectType).slice(0, 1),
        date: text(freetext.date)
      },
      indexedStructured: {
        place: indexed.place || [],
        object_type: (indexed.object_type || []).slice(0, 1),
        date: indexed.date || []
      }
    }
  };
});

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/miscellaneous_slim.js", `window.MISCELLANEOUS_RECORDS = ${JSON.stringify(slim)};\n`);
console.log(`Saved ${slim.length} records to data/miscellaneous_slim.js`);
