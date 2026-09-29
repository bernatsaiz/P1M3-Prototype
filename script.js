// Save the URL of the local JSON file as LOCAL_MISCELLANEOUS_JSON_FILE_URL.
const LOCAL_MISCELLANEOUS_JSON_FILE_URL = "data/miscellaneous.json";

// Dictionary mapping Smithsonian unit codes to friendly, readable names
const smithsonianUnitFriendlyNames = {
  "SIL": "Smithsonian Libraries",
  "SILN": "Smithsonian Libraries",
  "NMNHANTHRO": "National Museum of Natural History - Anthropology Department",
  "NMAH": "National Museum of American History",
  "SIA": "Smithsonian Institution Archives",
  "NMNHMINSCI": "National Museum of Natural History - Mineral Sciences Department",
  "FBR": "Smithsonian Field Book Project",
  "NMNHPALEO": "National Museum of Natural History - Paleobiology Department",
  "CFCHFOLKLIFE": "Ralph Rinzler Folklife Archives and Collections",
  "SAAM": "Smithsonian American Art Museum",
  "NMAA": "National Museum of American Art",
  "NASM": "National Air and Space Museum",
  "CHNDM": "Cooper Hewitt, Smithsonian Design Museum",
  "NMAAHC": "National Museum of African American History and Culture",
  "NMNHBOTANY": "National Museum of Natural History - Botany Department"
};

// Helper function to get a friendly name or fallback to the raw code
function getFriendlyUnitName(unitCode) {
  return smithsonianUnitFriendlyNames[unitCode] || unitCode;
}

// Is everything loaded? When it is, do what's next.
document.addEventListener("DOMContentLoaded", () => {

  // If there is a click...
  document.querySelector("#get-misc").addEventListener("click", async () => {
    const fetchMiscellaneousDataButtonElement = document.querySelector("#get-misc");
    const statusNotificationMessageElement = document.querySelector("#message");

    // Say it in the console
    console.log("Button was clicked");

    // Stop double-clicks while the API is loading.
    fetchMiscellaneousDataButtonElement.disabled = true;
    statusNotificationMessageElement.textContent = "Loading local data…";

    try {
      // Fetch the local JSON file, but wait until you get it.
      const rawNetworkResponseFromLocalFetch = await fetch(LOCAL_MISCELLANEOUS_JSON_FILE_URL);

      // Stop and show the error message if the API did not respond successfully.
      if (!rawNetworkResponseFromLocalFetch.ok) {
        throw new Error("The local JSON file could not be loaded.");
      }

      // Convert what you have received into JSON, and save it into parsedJsonDataArray.
      const parsedJsonDataArray = await rawNetworkResponseFromLocalFetch.json();

      // Print parsedJsonDataArray in the console.
      console.log(parsedJsonDataArray);

      // The local JSON file is already an array of matching objects.
      const extractedRowsArrayFromParsedJson = parsedJsonDataArray;

      // Print the rows in the console.
      console.log(extractedRowsArrayFromParsedJson);

      // The downloader already filtered these objects by title or Object Name.
      const filteredMiscellaneousObjectsArray = extractedRowsArrayFromParsedJson;

      // Select #results-container and save it into another variable called "miscellaneousResultsContainerElement".
      const miscellaneousResultsContainerElement = document.querySelector("#results-container");

      // Clean the container so it's empty.
      miscellaneousResultsContainerElement.innerHTML = "";

      // Make an empty object where we will count objects by collection unit.
      const collectionUnitCountTallyDictionary = {};

      // Grab each matching object and paint it.
      filteredMiscellaneousObjectsArray.forEach(currentMiscellaneousDatasetItem => {
        // Get the unit code. Some records do not have one, so give them a label.
        const currentItemCollectionUnitCode = currentMiscellaneousDatasetItem.unitCode || "No unit listed";

        // Add one to that unit's count.
        if (collectionUnitCountTallyDictionary[currentItemCollectionUnitCode]) {
          collectionUnitCountTallyDictionary[currentItemCollectionUnitCode] = collectionUnitCountTallyDictionary[currentItemCollectionUnitCode] + 1;
        } else {
          collectionUnitCountTallyDictionary[currentItemCollectionUnitCode] = 1;
        }

        // Translate the raw code into a friendly museum name for the card
        const friendlyMuseumNameString = getFriendlyUnitName(currentItemCollectionUnitCode);

        // Create one simple card for each record.
        const miscellaneousObjectInformationCardElement = document.createElement("article");
        miscellaneousObjectInformationCardElement.className = "object-card";
        miscellaneousObjectInformationCardElement.innerHTML = `
          <h3>${currentMiscellaneousDatasetItem.title}</h3>
          <p>${friendlyMuseumNameString}</p>
        `;
        miscellaneousResultsContainerElement.appendChild(miscellaneousObjectInformationCardElement);
      });

      // Turn the units object into an array that D3 can use, applying friendly names here too.
      const barChartDataFormattedArray = Object.entries(collectionUnitCountTallyDictionary).map(currentCollectionUnitEntry => {
        return { name: getFriendlyUnitName(currentCollectionUnitEntry[0]), count: currentCollectionUnitEntry[1] };
      });

      // Put the most common units at the top of the chart.
      barChartDataFormattedArray.sort((firstComparisonItem, secondComparisonItem) => secondComparisonItem.count - firstComparisonItem.count);

      // Draw the chart and show the page content.
      renderD3BarChartForCollectionUnits(barChartDataFormattedArray);
      document.querySelector("#visualization").hidden = false;
      statusNotificationMessageElement.textContent = `${filteredMiscellaneousObjectsArray.length} matching objects loaded from the local dataset.`;

    } catch (dataFetchOrProcessingError) {
      console.error(dataFetchOrProcessingError);
      statusNotificationMessageElement.textContent = "Something went wrong. Check the console and confirm the JSON file is in the data folder.";
    }

    fetchMiscellaneousDataButtonElement.disabled = false;
  });
});

// This function receives the simple barChartDataFormattedArray and draws a D3 bar chart.
function renderD3BarChartForCollectionUnits(barChartDataFormattedArray) {
  const barChartContainerSelection = d3.select("#unit-chart");
  barChartContainerSelection.html("");

  if (barChartDataFormattedArray.length === 0) {
    barChartContainerSelection.append("p").text("No matching titles were returned in this search.");
    return;
  }

  const barChartCanvasWidthInPixels = 700;
  const barChartCanvasHeightInPixels = barChartDataFormattedArray.length * 42 + 40;
  // Increased left margin to 220 so the long friendly museum names fit nicely
  const barChartCanvasMarginConfiguration = { top: 10, right: 40, bottom: 30, left: 220 };

  const scalableVectorGraphicsElement = barChartContainerSelection.append("svg")
    .attr("viewBox", `0 0 ${barChartCanvasWidthInPixels} ${barChartCanvasHeightInPixels}`);

  const xAxisLinearScaleFunction = d3.scaleLinear()
    .domain([0, d3.max(barChartDataFormattedArray, currentChartItem => currentChartItem.count)])
    .range([barChartCanvasMarginConfiguration.left, barChartCanvasWidthInPixels - barChartCanvasMarginConfiguration.right]);

  const yAxisBandScaleFunction = d3.scaleBand()
    .domain(barChartDataFormattedArray.map(currentChartItem => currentChartItem.name))
    .range([barChartCanvasMarginConfiguration.top, barChartCanvasHeightInPixels - barChartCanvasMarginConfiguration.bottom])
    .padding(0.2);

  scalableVectorGraphicsElement.append("g")
    .attr("transform", `translate(0, ${barChartCanvasHeightInPixels - barChartCanvasMarginConfiguration.bottom})`)
    .call(d3.axisBottom(xAxisLinearScaleFunction).ticks(5));

  scalableVectorGraphicsElement.append("g")
    .attr("transform", `translate(${barChartCanvasMarginConfiguration.left}, 0)`)
    .call(d3.axisLeft(yAxisBandScaleFunction));

  scalableVectorGraphicsElement.selectAll("rect")
    .data(barChartDataFormattedArray)
    .join("rect")
    .attr("x", barChartCanvasMarginConfiguration.left)
    .attr("y", currentChartItem => yAxisBandScaleFunction(currentChartItem.name))
    .attr("width", currentChartItem => xAxisLinearScaleFunction(currentChartItem.count) - barChartCanvasMarginConfiguration.left)
    .attr("height", yAxisBandScaleFunction.bandwidth())
    .attr("fill", "#b94a36");

  scalableVectorGraphicsElement.selectAll(".bar-label")
    .data(barChartDataFormattedArray)
    .join("text")
    .attr("class", "bar-label")
    .attr("x", currentChartItem => xAxisLinearScaleFunction(currentChartItem.count) + 6)
    .attr("y", currentChartItem => yAxisBandScaleFunction(currentChartItem.name) + yAxisBandScaleFunction.bandwidth() / 2 + 4)
    .text(currentChartItem => currentChartItem.count);
}