const smithsonianUnitFriendlyNames = {
  "SIL": "Smithsonian Libraries",
  "SILN": "Smithsonian Libraries",
  "NMNHANTHRO": "Anthropology (NMNH)",
  "NMAH": "American History (NMAH)",
  "SIA": "Institution Archives",
  "NMNHMINSCI": "Mineral Sciences (NMNH)",
  "SLA_SRO": "Smithsonian Research Online",
  "FBR": "Field Book Project",
  "NMNHPALEO": "Paleobiology (NMNH)",
  "CFCHFOLKLIFE": "Folklife Archives",
  "SAAM": "American Art Museum",
  "NMAA": "Asian Art Museum",
  "NASM": "Air and Space Museum",
  "CHNDM": "Cooper Hewitt",
  "NMAAHC": "African American History",
  "NMNHBOTANY": "Botany (NMNH)"
};

function getFriendlyUnitName(code) {
  return smithsonianUnitFriendlyNames[code] || code;
}

// Place names used in the records -> country names used in world.geojson
const countryAliases = {
  "United States": "USA",
  "United States of America": "USA",
  "United Kingdom": "England",
  "Great Britain": "England",
  "Scotland": "England",
  "Wales": "England",
  "Northern Ireland": "England",
  "Tanzania": "United Republic of Tanzania",
  "Serbia": "Republic of Serbia",
  "Côte d'Ivoire": "Ivory Coast",
  "Bahamas": "The Bahamas",
  "Burma": "Myanmar",
  "Zaire": "Democratic Republic of the Congo",
  "Korea": "South Korea",
  "Republic of Korea": "South Korea",
  "Guinea-Bissau": "Guinea Bissau",
  "Timor-Leste": "East Timor",
  "North Macedonia": "Macedonia",
  "Eswatini": "Swaziland",
  "Czechia": "Czech Republic",
  "Galapagos Islands": "Ecuador",
  "Colón, Archipiélago de": "Ecuador"
};

// Country names from world.geojson -> names shown to readers
const countryDisplayNames = {
  "USA": "United States",
  "England": "United Kingdom",
  "United Republic of Tanzania": "Tanzania",
  "Republic of Serbia": "Serbia"
};

// U.S. states count toward the USA ("Georgia" is resolved separately)
const usStates = new Set([
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
  "District of Columbia", "Florida", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas",
  "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
  "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
  "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah",
  "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"
]);

const formatNumber = d3.format(",");
const formatInt = value => formatNumber(Math.round(value));
const formatPercent = d3.format(".0%");
const formatRate = d3.format(".1f");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function getCountryDisplayName(name) {
  return countryDisplayNames[name] || name;
}

function withArticle(name) {
  return /^(United|Democratic|Republic|Czech|Dominican|Central African|Philippines|Netherlands|Solomon)/.test(name)
    ? `the ${name}` : name;
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ------------------------------------------------------------
// Page state
// ------------------------------------------------------------
const state = {
    records: [],        // one entry per object, with the fields the charts use
    filtered: [],       // records that pass the current filter
    datasets: {},       // what each chart is drawing right now (a chart ignores its own filter)
    world: null,
    map: null,
    filter: null,       // { dim, values, label, phrase, color }
    mapMode: "rate"
};

// Light/Dark Theme Toggle Logic
document.addEventListener("DOMContentLoaded", async () => {
    const toggleBtn = document.getElementById("theme-toggle");
    const themeIcon = document.getElementById("theme-icon");
    const htmlElement = document.documentElement;

    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        htmlElement.setAttribute("data-theme", "dark");
        themeIcon.textContent = "☀️";
    }

    toggleBtn.addEventListener("click", () => {
        const currentTheme = htmlElement.getAttribute("data-theme");
        if (currentTheme === "light") {
            htmlElement.setAttribute("data-theme", "dark");
            themeIcon.textContent = "☀️";
        } else {
            htmlElement.setAttribute("data-theme", "light");
            themeIcon.textContent = "🌙";
        }
    });

    setupCards();
    setupInfoTooltips();
    setupClearControls();
    fitHeadline();
    if (document.fonts) document.fonts.ready.then(fitHeadline);

    try {
        // Fetch JSON data and World Map GeoJSON simultaneously
        const [data, worldGeoJSON] = await Promise.all([
            loadRecords(),
            d3.json("https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson").catch(() => null)
        ]);

        state.world = worldGeoJSON;
        state.records = prepareRecords(data, worldGeoJSON);
        setStat("grandTotal", data.length);

        update();
        redrawOnResize(() => update({ animate: false }));

        d3.selectAll("[data-map-mode]").on("click", function () {
            state.mapMode = this.dataset.mapMode;
            update();
        });

    } catch (error) {
        console.error("Dashboard error:", error);
        showDataError();
    }
});

// Load the full JSON; if fetch() is blocked (index.html opened as file://),
// fall back to the slim copy made by build-fallback-data.js, loaded as a <script>
function loadRecords() {
    return fetch("miscellaneous_results.json")
        .then(res => {
            if (!res.ok) throw new Error("Could not load miscellaneous_results.json");
            return res.json();
        })
        .catch(error => {
            console.warn(`${error.message} — using data/miscellaneous_slim.js instead.`);
            return new Promise((resolve, reject) => {
                const script = document.createElement("script");
                script.src = "data/miscellaneous_slim.js";
                script.onload = () => window.MISCELLANEOUS_RECORDS
                    ? resolve(window.MISCELLANEOUS_RECORDS)
                    : reject(new Error("data/miscellaneous_slim.js has no records"));
                script.onerror = () => reject(new Error("Could not load data/miscellaneous_slim.js"));
                document.head.appendChild(script);
            });
        });
}

// Draw one chart; if it fails, say so inside its box instead of leaving it blank
function safeRender(selector, render) {
    try {
        return render();
    } catch (error) {
        console.error(`Could not draw ${selector}:`, error);
        d3.select(selector).html("").append("p")
            .attr("class", "chart-message")
            .text("This chart could not be drawn. Check the browser console for details.");
        return null;
    }
}

function showDataError() {
    ["#map-chart", "#unit-chart", "#objectType-chart", "#decade-chart"].forEach(selector => {
        d3.select(selector).html(
            `<p class="chart-message">The data could not be loaded. From this folder, run ` +
            `<code>python3 -m http.server</code> and open <code>http://localhost:8000</code>.</p>`
        );
    });
    document.querySelectorAll("[data-stat]").forEach(el => { el.textContent = "–"; });
}

// Charts are drawn at their box's real width, so redraw when a box changes width;
// the bridges between boxes follow any change in size
function redrawOnResize(redraw) {
    const targets = document.querySelectorAll(".chart-canvas, .chart-canvas-full, .headline");
    const widths = new Map(Array.from(targets, el => [el, Math.round(el.clientWidth)]));
    let timer;
    const observer = new ResizeObserver(entries => {
        const changed = entries.some(entry => {
            const width = Math.round(entry.contentRect.width);
            if (widths.get(entry.target) === width) return false;
            widths.set(entry.target, width);
            return true;
        });
        if (!changed) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
            fitHeadline();
            redraw();
        }, 120);
    });
    targets.forEach(el => observer.observe(el));

    const bridgeObserver = new ResizeObserver(scheduleBridges);
    document.querySelectorAll("[data-linked]").forEach(el => bridgeObserver.observe(el));
}

// Scale the headline so its longest line spans the box edge to edge
function fitHeadline() {
    const headline = document.querySelector(".headline");
    if (!headline) return;
    headline.style.fontSize = "";
    const lines = Array.from(headline.children);
    const widest = d3.max(lines, line => line.scrollWidth);
    const current = parseFloat(getComputedStyle(headline).fontSize);
    // Skip while the box has no layout yet (e.g. a hidden tab), or the text would shrink to 0
    if (!widest || !headline.clientWidth) return;
    headline.style.fontSize = `${Math.max(32, current * headline.clientWidth / widest)}px`;
}

// ------------------------------------------------------------
// Records: read each object once, keep what the charts need
// ------------------------------------------------------------
function prepareRecords(data, worldData) {
    const countryNames = new Set(worldData ? worldData.features.map(f => f.properties.name) : []);
    return data.map(item => {
        const year = getEarliestYear(item);
        return {
            raw: item,
            unitCode: item.unitCode || "Unknown",
            unit: getFriendlyUnitName(item.unitCode || "Unknown"),
            type: getPrimaryType(item),
            year,
            decade: year === null ? null : Math.floor(year / 10) * 10,
            countries: getRecordCountries(item, countryNames)
        };
    });
}

// Every country an object names, counted once per object
function getRecordCountries(item, countryNames) {
    const indexedPlaces = item.content?.indexedStructured?.place || [];
    const freetextPlaces = (item.content?.freetext?.place || [])
        .map(p => typeof p === 'string' ? p : (p.content || ""));

    // "Big Bend Reservoir, Lyman County, South Dakota, United States" -> separate parts
    const parts = new Set();
    [...indexedPlaces, ...freetextPlaces].forEach(place => {
        place.split(",").forEach(part => parts.add(part.trim()));
    });

    const found = new Set();
    parts.forEach(part => {
        const name = countryAliases[part] || part;
        if (usStates.has(part)) found.add("USA");
        else if (part !== "Georgia" && countryNames.has(name)) found.add(name);
    });
    // Georgia is the U.S. state when the record is in the USA, otherwise the country
    if (parts.has("Georgia") && !found.has("USA")) found.add("Georgia");
    return found;
}

function cleanTypeName(name) {
    const clean = name.replace(/\s*\(.*?\)\s*/g, "").trim();
    return clean.charAt(0).toUpperCase() + clean.slice(1);
}

// Each object counts once, by its first listed type
function getPrimaryType(item) {
    const indexed = item.content?.indexedStructured?.object_type || [];
    const freetext = item.content?.freetext?.objectType || [];
    const first = indexed[0] || (freetext[0] && (typeof freetext[0] === 'string' ? freetext[0] : freetext[0].content));
    return first ? cleanTypeName(first) : null;
}

function getEarliestYear(item) {
    // Prefer the Smithsonian's indexed decades ("1960s", "1615-1868")
    const indexed = (item.content?.indexedStructured?.date || [])
        .map(d => parseInt(d))
        .filter(y => !isNaN(y));
    if (indexed.length) return d3.min(indexed);

    // Fall back to the first year written in the free-text dates
    let year = null;
    const dates = item.content?.freetext?.date || [];
    dates.forEach(d => {
        const text = typeof d === 'string' ? d : (d.content || "");
        const match = text.match(/\b(1[5-9]|20)\d{2}\b/);
        if (match && year === null) year = parseInt(match[0]);
    });
    return year;
}

// ------------------------------------------------------------
// Cross-filtering: click a bar, column or country to filter every box
// ------------------------------------------------------------
function makeFilter(dim, values, label) {
    const phrases = {
        unit: `objects in ${label}`,
        type: label.toLowerCase(),
        decade: `objects from the ${label}`,
        country: `objects from ${withArticle(label)}`
    };
    const source = document.querySelector(`[data-dim="${dim}"]`);
    return { dim, values: new Set(values), label, phrase: phrases[dim], color: source?.dataset.baseColor || "ink" };
}

function matchesFilter(record, filter) {
    switch (filter.dim) {
        case "unit": return filter.values.has(record.unit);
        case "type": return filter.values.has(record.type);
        case "decade": return filter.values.has(record.decade);
        case "country": return [...filter.values].some(c => record.countries.has(c));
        default: return true;
    }
}

function sameValues(a, b) {
    return a.size === b.size && [...a].every(v => b.has(v));
}

// Clicking the active selection again clears it
function setFilter(next) {
    const current = state.filter;
    const same = next && current && next.dim === current.dim && sameValues(next.values, current.values);
    state.filter = same ? null : next;
    hideTooltip();
    update();
}

function setupClearControls() {
    document.querySelectorAll("[data-clear-filter]").forEach(btn => {
        btn.addEventListener("click", () => setFilter(null));
    });

    // Esc flips an open box back first, then clears the filter
    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;
        const flipped = document.querySelector(".card.is-flipped");
        if (flipped) flipCard(flipped);
        else if (state.filter) setFilter(null);
    });

    // The floating clear button only shows while the banner is out of view
    const banner = document.querySelector(".cell-banner");
    new IntersectionObserver(([entry]) => {
        state.bannerInView = entry.isIntersecting;
        updateFloatClear();
    }, { threshold: 0.3 }).observe(banner);
}

// Redraw every box for the current filter
function update({ animate = true } = {}) {
    const duration = animate && !prefersReducedMotion ? 750 : 0;
    const { records, filter } = state;
    const filtered = filter ? records.filter(r => matchesFilter(r, filter)) : records;
    const forDim = dim => (!filter || filter.dim === dim) ? records : filtered;

    state.filtered = filtered;
    state.datasets = { country: forDim("country"), unit: forDim("unit"), type: forDim("type"), decade: forDim("decade") };

    applyFilterLook();
    updateTitles();

    state.map = safeRender("#map-chart", () => renderWorldMap(state.world, state.datasets.country, { duration }));
    safeRender("#unit-chart", () => renderUnitChart(state.datasets.unit, { duration }));
    safeRender("#objectType-chart", () => renderObjectTypeChart(state.datasets.type, { duration }));
    safeRender("#decade-chart", () => renderDecadeChart(state.datasets.decade, { duration }));

    renderStats(filtered, state.map);
    updateBanner();
    refreshOpenBacks();
    scheduleBridges();
}

// Linked boxes take the colour of the box that set the filter
function applyFilterLook() {
    const filter = state.filter;
    const bento = document.getElementById("bento");
    document.body.classList.toggle("is-filtered", !!filter);
    if (filter) bento.dataset.filter = filter.color;
    else delete bento.dataset.filter;

    document.querySelectorAll("[data-linked]").forEach(card => {
        card.dataset.color = filter ? filter.color : card.dataset.baseColor;
        card.classList.toggle("is-source", !!filter && card.dataset.dim === filter.dim);
    });

    // A chip on the source box names the filter and clears it
    document.querySelectorAll(".filter-chip").forEach(chip => chip.remove());
    const head = filter && document.querySelector(`[data-dim="${filter.dim}"] .card-head`);
    if (head) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "filter-chip";
        chip.setAttribute("aria-label", `Clear the filter: ${filter.label}`);
        chip.innerHTML = `<span class="filter-chip-dot"></span>${escapeHtml(filter.label)} <span aria-hidden="true">✕</span>`;
        chip.addEventListener("click", () => setFilter(null));
        head.querySelector(".tag").after(chip);
    }

    updateFloatClear();
}

function updateFloatClear() {
    const btn = document.getElementById("float-clear");
    const filter = state.filter;
    btn.hidden = !filter || state.bannerInView !== false;
    if (filter) {
        btn.dataset.color = filter.color;
        document.getElementById("float-clear-label").textContent = `· ${filter.label}`;
    }
}

const titleTemplates = {
    country: phrase => `Where ${phrase} come from`,
    unit: phrase => `Who keeps ${phrase}`,
    type: phrase => `What ${phrase} are`,
    decade: phrase => `When ${phrase} are from`
};

// Titles say what the box is showing now
function updateTitles() {
    const filter = state.filter;
    document.querySelectorAll("[data-title]").forEach(el => {
        if (el.dataset.default === undefined) el.dataset.default = el.textContent;
        const dim = el.dataset.title;
        const next = filter && filter.dim !== dim ? titleTemplates[dim](filter.phrase) : el.dataset.default;
        swapText(el, next);
    });

    const totalText = document.getElementById("total-text");
    if (totalText.dataset.default === undefined) totalText.dataset.default = totalText.textContent;
    swapText(totalText, filter
        ? `${filter.phrase}, out of ${formatNumber(state.records.length)} in total.`
        : totalText.dataset.default);
}

function swapText(el, text) {
    if (el.textContent === text) return;
    el.textContent = text;
    if (!prefersReducedMotion) {
        el.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }],
            { duration: 450, easing: "cubic-bezier(.2,.9,.3,1.25)" });
    }
}

function updateBanner() {
    const filter = state.filter;
    const banner = document.querySelector(".cell-banner");
    banner.querySelector(".banner-default").hidden = !!filter;
    banner.querySelector(".banner-active").hidden = !filter;
    if (filter) {
        document.getElementById("banner-phrase").textContent = `${filter.phrase}. Every box now counts only these.`;
    }
}

// ------------------------------------------------------------
// Bridges: soft joins between neighbouring linked boxes while filtered
// ------------------------------------------------------------
let bridgeFrame;
function scheduleBridges() {
    cancelAnimationFrame(bridgeFrame);
    bridgeFrame = requestAnimationFrame(() => requestAnimationFrame(drawBridges));
}

function drawBridges() {
    const svg = d3.select("#bridges");
    if (!state.filter) {
        svg.selectAll("path.bridge").remove();
        return;
    }
    const bento = document.getElementById("bento");
    const gap = parseFloat(getComputedStyle(bento).columnGap) || 14;
    // Layout positions (offset*) ignore flip and entrance animations
    const boxes = Array.from(document.querySelectorAll("[data-linked]"), el => ({
        id: el.dataset.card,
        x0: el.offsetLeft,
        y0: el.offsetTop,
        x1: el.offsetLeft + el.offsetWidth,
        y1: el.offsetTop + el.offsetHeight,
        radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 32
    }));

    const necks = [];
    boxes.forEach(a => boxes.forEach(b => {
        if (a === b) return;
        const radius = Math.max(a.radius, b.radius);
        if (Math.abs(a.x1 + gap - b.x0) <= 3) {
            const start = Math.max(a.y0, b.y0) + radius;
            const end = Math.min(a.y1, b.y1) - radius;
            if (end - start >= 60) necks.push({ key: `${a.id}>${b.id}`, d: neckPath("h", a.x1, b.x0, start, end) });
        }
        if (Math.abs(a.y1 + gap - b.y0) <= 3) {
            const start = Math.max(a.x0, b.x0) + radius;
            const end = Math.min(a.x1, b.x1) - radius;
            if (end - start >= 60) necks.push({ key: `${a.id}v${b.id}`, d: neckPath("v", a.y1, b.y0, start, end) });
        }
    }));

    svg.selectAll("path.bridge")
        .data(necks, d => d.key)
        .join("path")
        .attr("class", "bridge")
        .attr("d", d => d.d);
}

// A short straight band across the gap. Its ends are rounded fillets
// (radius = half the gap), so the uncovered gap reads as two pills.
function neckPath(direction, from, to, start, end) {
    const P = (u, v) => direction === "h" ? `${u},${v}` : `${v},${u}`;
    const r = (to - from) / 2;
    const sweep = direction === "h" ? 1 : 0;
    const centre = (start + end) / 2;
    const half = Math.min(30, (end - start) / 2);
    const a = centre - half;
    const b = centre + half;
    return `M${P(from - 1, a)} L${P(from - 1, b)} L${P(from, b)} ` +
        `A${r},${r} 0 0 ${sweep} ${P(to, b)} L${P(to + 1, b)} L${P(to + 1, a)} L${P(to, a)} ` +
        `A${r},${r} 0 0 ${sweep} ${P(from, a)} Z`;
}

// ------------------------------------------------------------
// Key numbers (they count up to each new value)
// ------------------------------------------------------------
function setStat(key, value, format = formatInt) {
    document.querySelectorAll(`[data-stat="${key}"]`).forEach(el => {
        if (typeof value !== "number" || !Number.isFinite(value)) {
            d3.select(el).interrupt();
            el.textContent = typeof value === "string" ? value : "–";
            el._value = undefined;
            return;
        }
        const from = el._value;
        el._value = value;
        if (from === value || prefersReducedMotion) {
            el.textContent = format(value);
            return;
        }
        const interpolate = d3.interpolateNumber(from ?? 0, value);
        d3.select(el).interrupt().transition().duration(900).ease(d3.easeCubicOut)
            .tween("text", () => t => { el.textContent = format(interpolate(t)); });
    });
}

function renderStats(filtered, map) {
    const placed = filtered.filter(r => r.countries.size).length;
    const dated = filtered.filter(r => r.year !== null).length;
    const countries = new Set();
    filtered.forEach(r => r.countries.forEach(c => countries.add(c)));
    const share = (part, whole) => whole ? part / whole : NaN;

    setStat("total", filtered.length);
    setStat("units", new Set(filtered.map(r => r.unit)).size);
    setStat("countries", countries.size);
    setStat("dated", dated);
    setStat("undated", filtered.length - dated);
    setStat("datedShare", share(dated, filtered.length), formatPercent);
    setStat("unplaced", filtered.length - placed);
    setStat("unplacedShare", share(filtered.length - placed, filtered.length), formatPercent);

    // Facts beside the map: the highest rate, and how the biggest collection compares
    const top = map?.rated?.[0];
    const biggest = map?.ranked?.length ? map.stats.get(map.ranked[0][0]) : null;
    setStat("topRate", top ? top.rate : NaN, formatRate);
    setStat("topRatePlace", top ? withArticle(getCountryDisplayName(top.name)) : "–");
    setStat("topRateCount", top ? top.count : NaN);
    setStat("topRateTotal", top ? top.total : NaN);
    setStat("biggestRate", biggest?.rate ?? NaN, formatRate);
    setStat("biggestPlace", biggest ? withArticle(getCountryDisplayName(biggest.name)) : "–");
    setStat("biggestCount", biggest ? biggest.count : NaN);
    setStat("averageRate", map?.average ?? NaN, formatRate);
    const ratio = biggest?.rate != null && map?.average ? biggest.rate / map.average : null;
    setStat("biggestCompare", ratio == null ? "compared with" : ratio > 1.33 ? "well above" : ratio < 0.75 ? "well below" : "close to");
}

// ------------------------------------------------------------
// Tooltip helpers (one shared tooltip for every chart)
// ------------------------------------------------------------
const tooltipEl = () => document.getElementById("tooltip");

function showTooltip(event, html) {
    const tip = tooltipEl();
    tip.innerHTML = html;
    tip.classList.add("is-visible");
    tip.setAttribute("aria-hidden", "false");
    moveTooltip(event);
}

function moveTooltip(event) {
    const tip = tooltipEl();
    const pad = 16;
    const rect = tip.getBoundingClientRect();
    let x = event.clientX + pad;
    let y = event.clientY + pad;
    if (x + rect.width > window.innerWidth - 8) x = event.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = event.clientY - rect.height - pad;
    tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
}

function hideTooltip() {
    const tip = tooltipEl();
    tip.classList.remove("is-visible");
    tip.setAttribute("aria-hidden", "true");
}

function tooltipHtml(title, value, sub, hint) {
    return `<span class="tooltip-title">${escapeHtml(title)}</span>` +
        (value ? `<span class="tooltip-value">${escapeHtml(value)}</span>` : "") +
        (sub ? `<span class="tooltip-sub">${escapeHtml(sub)}</span>` : "") +
        (hint ? `<span class="tooltip-hint">${escapeHtml(hint)}</span>` : "");
}

// "?" buttons: describe how to read each chart (hover, focus or tap)
function setupInfoTooltips() {
    document.querySelectorAll(".info").forEach(btn => {
        const html = tooltipHtml("How to read this", "", btn.dataset.tip);
        const anchor = () => {
            const r = btn.getBoundingClientRect();
            return { clientX: r.left, clientY: r.bottom };
        };
        btn.addEventListener("pointerenter", e => showTooltip(e, html));
        btn.addEventListener("pointermove", moveTooltip);
        btn.addEventListener("pointerleave", hideTooltip);
        btn.addEventListener("focus", () => showTooltip(anchor(), html));
        btn.addEventListener("blur", hideTooltip);
        btn.addEventListener("click", () => showTooltip(anchor(), html));
    });
}

// ------------------------------------------------------------
// Chart 1: World Map Geographic Distribution
// ------------------------------------------------------------

// Map measure: "rate" = miscellaneous objects per 10,000 objects the Smithsonian holds
// from that country (so big collections don't win by size alone); "count" = raw totals
const RATE_PER = 10000;
const MIN_OBJECTS_FOR_RATE = 5;

const mapScales = {
    rate: {
        thresholds: [1, 2, 4, 8],
        labels: ["Under 1", "1–2", "2–4", "4–8", "8+"],
        title: "Miscellaneous objects per 10,000 held"
    },
    count: {
        thresholds: [5, 20, 50, 200],
        labels: ["1–4", "5–19", "20–49", "50–199", "200+"],
        title: "Miscellaneous objects per country"
    }
};

function renderWorldMap(worldData, records, { duration = 0 } = {}) {
    const container = d3.select("#map-chart");

    if (!worldData) {
        container.html("").append("p")
            .attr("class", "chart-message")
            .text("The world map could not be downloaded. Check your internet connection and reload the page.");
        return null;
    }

    // Without Smithsonian-wide totals there is nothing to divide by, so fall back to counts
    const totals = window.COUNTRY_TOTALS?.countries;
    if (!totals) state.mapMode = "count";
    const mapMode = state.mapMode;
    d3.select("#map-mode").attr("hidden", totals ? null : "");
    d3.selectAll("[data-map-mode]").attr("aria-pressed", function () {
        return String(this.dataset.mapMode === mapMode);
    });

    const width = container.node().clientWidth || 1200;
    const height = Math.round(width * 0.5);

    const projection = d3.geoNaturalEarth1()
        .fitSize([width, height], worldData);

    const pathGenerator = d3.geoPath().projection(projection);

    // Countries are drawn once per width, then only recoloured, so colours animate
    let svg = container.select("svg");
    if (svg.empty() || +svg.attr("data-width") !== width) {
        container.html("");
        svg = container.append("svg")
            .attr("data-width", width)
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("width", "100%")
            .attr("role", "img");

        // Flat diagonal hatch for countries with too few objects to rate
        const hatch = svg.append("defs").append("pattern")
            .attr("id", "hatch-few")
            .attr("width", 6)
            .attr("height", 6)
            .attr("patternUnits", "userSpaceOnUse")
            .attr("patternTransform", "rotate(45)");
        hatch.append("rect").attr("class", "hatch-bg").attr("width", 6).attr("height", 6);
        hatch.append("line").attr("class", "hatch-line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 6);

        svg.append("g").attr("class", "countries")
            .selectAll("path")
            .data(worldData.features)
            .join("path")
            .attr("class", "country bin-0")
            .attr("d", pathGenerator);
    }

    // Count objects per country (exact name match, not substring)
    const countryCounts = {};
    let placedRecords = 0;
    records.forEach(record => {
        if (record.countries.size) placedRecords++;
        record.countries.forEach(c => {
            countryCounts[c] = (countryCounts[c] || 0) + 1;
        });
    });

    // Rate = miscellaneous objects per 10,000 Smithsonian objects from the same country.
    // A handful of objects gives a noisy rate, so those countries are shown but not rated.
    const countryStats = new Map(Object.entries(countryCounts).map(([name, count]) => {
        const total = totals?.[name] || 0;
        const rate = total > 0 && count >= MIN_OBJECTS_FOR_RATE ? count / total * RATE_PER : null;
        return [name, { name, count, total, rate }];
    }));
    const statsList = Array.from(countryStats.values());
    const ranked = statsList.map(d => [d.name, d.count]).sort((a, b) => b[1] - a[1]);
    const rated = statsList.filter(d => d.rate != null).sort((a, b) => b.rate - a.rate);
    const withTotals = statsList.filter(d => d.total > 0);
    const average = withTotals.length
        ? d3.sum(withTotals, d => d.count) / d3.sum(withTotals, d => d.total) * RATE_PER
        : null;

    const scale = mapScales[mapMode];
    const binOf = d => {
        if (!d) return "bin-0";
        if (mapMode === "rate") {
            return d.rate == null ? "bin-few" : `bin-${d3.bisectRight(scale.thresholds, d.rate) + 1}`;
        }
        return `bin-${d3.bisectRight(scale.thresholds, d.count) + 1}`;
    };

    const filter = state.filter;
    const selected = filter?.dim === "country" ? filter.values : new Set();

    svg.attr("aria-label", mapMode === "rate"
        ? `World map of miscellaneous objects per 10,000 Smithsonian objects. Highest rates: ${rated.slice(0, 3)
            .map(d => `${getCountryDisplayName(d.name)} ${formatRate(d.rate)}`).join(", ")}.`
        : `World map of objects per country. Top countries: ${ranked.slice(0, 3)
            .map(([name, count]) => `${getCountryDisplayName(name)} ${formatNumber(count)}`).join(", ")}.`);

    svg.select("g.countries").selectAll("path")
        .attr("class", d => `country ${binOf(countryStats.get(d.properties.name))}${selected.has(d.properties.name) ? " is-selected" : ""}`)
        .on("pointerenter", (event, d) => {
            const name = getCountryDisplayName(d.properties.name);
            const stat = countryStats.get(d.properties.name);
            const hint = !stat ? "" : selected.has(d.properties.name)
                ? "Click again to clear the filter" : "Click to filter the page";
            showTooltip(event, mapTooltip(name, stat, totals?.[d.properties.name], placedRecords, average, hint));
        })
        .on("pointermove", moveTooltip)
        .on("pointerleave", hideTooltip)
        .on("click", (event, d) => {
            if (!countryStats.has(d.properties.name)) return;
            setFilter(makeFilter("country", [d.properties.name], getCountryDisplayName(d.properties.name)));
        });

    // Annotate the highest rates (plus the biggest collection, for comparison) or the top counts
    svg.select("g.callouts").remove();
    const callouts = svg.append("g").attr("class", "callouts").attr("pointer-events", "none");
    const featureByName = new Map(worldData.features.map(f => [f.properties.name, f]));
    const fontScale = Math.max(0.85, Math.min(1.15, width / 1100));
    let labelled = mapMode === "rate"
        ? [...rated.slice(0, 4), ...rated.filter((d, i) => i >= 4 && ranked.length && d.name === ranked[0][0])]
            .map(d => [d.name, `${formatRate(d.rate)} per 10k`])
        : ranked.slice(0, 3).map(([name, count]) => [name, `${formatNumber(count)} objects`]);
    selected.forEach(name => {
        const stat = countryStats.get(name);
        if (!stat || labelled.some(([n]) => n === name)) return;
        labelled = [[name, mapMode === "rate" && stat.rate != null ? `${formatRate(stat.rate)} per 10k` : `${formatNumber(stat.count)} objects`], ...labelled];
    });

    const placedBoxes = [];
    labelled.forEach(([name, subLabel]) => {
        const feature = featureByName.get(name);
        if (!feature) return;
        const [cx, cy] = projection(d3.geoCentroid(largestPolygon(feature)));
        placeCallout(callouts, {
            cx, cy, width, height, fontScale, placedBoxes,
            lines: [getCountryDisplayName(name), subLabel]
        });
    });

    renderMapLegend(scale, average, mapMode);

    const unplaced = records.length - placedRecords;
    d3.select("#map-subtitle").text(mapMode === "rate"
        ? `Miscellaneous objects per 10,000 objects the Smithsonian holds from each country, so a big collection doesn’t win by size alone.`
        : `Total miscellaneous objects naming each country. Countries with big Smithsonian collections naturally have more.`);
    d3.select("#map-note").html(
        `The map uses the <strong>${formatNumber(placedRecords)} objects</strong> ` +
        `(${records.length ? formatPercent(placedRecords / records.length) : "0%"} of ${formatNumber(records.length)}) that name a place; ` +
        `the other ${formatNumber(unplaced)} have no place on record. ` +
        (mapMode === "rate" && window.COUNTRY_TOTALS
            ? `Rates divide by each country’s objects in the whole Smithsonian Open Access collection ` +
              `(API, ${window.COUNTRY_TOTALS.retrieved}); countries with fewer than ${MIN_OBJECTS_FOR_RATE} miscellaneous objects are hatched instead of rated. `
            : ``) +
        `An object that names several countries counts once in each, and U.S. states count toward the United States.`
    );

    return { ranked, rated, average, placed: placedRecords, stats: countryStats };
}

function mapTooltip(name, stat, held, placedRecords, average, hint) {
    const heldText = held ? `${formatNumber(held)} Smithsonian objects from here` : "";
    if (!stat) {
        return tooltipHtml(name, "0 objects",
            `No objects in this set name this country${heldText ? `, out of ${heldText}` : ""}.`);
    }
    const share = `${formatNumber(stat.count)} of ${formatNumber(stat.total)} Smithsonian objects from here`;
    if (state.mapMode === "count") {
        return tooltipHtml(name, `${formatNumber(stat.count)} ${stat.count === 1 ? "object" : "objects"}`,
            `${formatPercent(stat.count / placedRecords)} of the ${formatNumber(placedRecords)} objects with a known place`, hint);
    }
    if (stat.rate == null) {
        return tooltipHtml(name, `${formatNumber(stat.count)} ${stat.count === 1 ? "object" : "objects"}`,
            `Too few to compare fairly (fewer than ${MIN_OBJECTS_FOR_RATE}). ${share}.`, hint);
    }
    const vsAverage = average ? ` · ${formatRate(stat.rate / average)}× the map average` : "";
    return tooltipHtml(name, `${formatRate(stat.rate)} per 10,000`, `${share}${vsAverage}`, hint);
}

// Put a label beside its point, trying each diagonal until it fits inside the map
// without covering a label that is already placed
function placeCallout(layer, { cx, cy, width, height, fontScale, placedBoxes, lines }) {
    const side = cx < width / 2 ? -1 : 1;
    const candidates = [[side, -1], [side, 1], [-side, -1], [-side, 1]];
    const line = layer.append("path").attr("class", "callout-line");
    const text = layer.append("text")
        .attr("class", "callout-text")
        .style("font-size", `${14 * fontScale}px`);
    const title = text.append("tspan").text(lines[0]);
    const sub = text.append("tspan").attr("class", "callout-sub").attr("dy", "1.2em").text(lines[1]);

    let box;
    for (const [sx, sy] of candidates) {
        const lx = cx + sx * width * 0.06;
        const ly = cy + sy * height * 0.09;
        const tx = lx + sx * 6;
        text.attr("x", tx).attr("y", ly + 4).attr("text-anchor", sx < 0 ? "end" : "start");
        title.attr("x", tx);
        sub.attr("x", tx);
        line.attr("d", `M${cx},${cy}L${lx},${ly}`);
        box = text.node().getBBox();
        const inside = box.x >= 4 && box.y >= 4 && box.x + box.width <= width - 4 && box.y + box.height <= height - 4;
        const clear = placedBoxes.every(b =>
            box.x > b.x + b.width + 6 || box.x + box.width + 6 < b.x ||
            box.y > b.y + b.height + 6 || box.y + box.height + 6 < b.y);
        if (inside && clear) break;
    }

    // On very narrow maps nothing may fit perfectly; at least keep the label on screen
    const shift = box.x < 4 ? 4 - box.x : Math.min(0, width - 4 - (box.x + box.width));
    if (shift) text.attr("transform", `translate(${shift}, 0)`);
    placedBoxes.push({ x: box.x + shift, y: box.y, width: box.width, height: box.height });

    layer.append("circle")
        .attr("class", "callout-dot")
        .attr("cx", cx).attr("cy", cy).attr("r", 5);
}

function largestPolygon(feature) {
    if (feature.geometry.type !== "MultiPolygon") return feature;
    return d3.greatest(
        feature.geometry.coordinates.map(coordinates => ({ type: "Polygon", coordinates })),
        polygon => d3.geoArea(polygon)
    );
}

function renderMapLegend(scale, average, mapMode) {
    const legend = d3.select("#map-legend");
    legend.html("");
    legend.append("span").attr("class", "legend-title").text(scale.title);

    const steps = legend.append("div").attr("class", "legend-steps");
    scale.labels.forEach((label, i) => {
        const step = steps.append("div").attr("class", "legend-step");
        step.append("span").attr("class", `legend-swatch bin-${i + 1}`);
        step.append("span").text(label);
    });

    if (mapMode === "rate") {
        const few = legend.append("div").attr("class", "legend-nodata");
        few.append("svg")
            .attr("class", "legend-swatch legend-swatch--svg")
            .attr("aria-hidden", "true")
            .append("rect")
            .attr("width", "100%").attr("height", "100%").attr("rx", 9)
            .attr("fill", "url(#hatch-few)");
        few.append("span").text(`1–${MIN_OBJECTS_FOR_RATE - 1} objects, too few to rate`);
    }

    const none = legend.append("div").attr("class", "legend-nodata");
    none.append("span").attr("class", "legend-swatch bin-0");
    none.append("span").text("None");

    if (mapMode === "rate" && average != null) {
        legend.append("div").attr("class", "legend-average")
            .html(`Map average <strong>${formatRate(average)}</strong>`);
    }
}

// ------------------------------------------------------------
// Chart 2: Collection Units
// ------------------------------------------------------------
function renderUnitChart(records, { duration = 0 } = {}) {
    const counts = d3.rollups(records, v => v.length, r => r.unit).sort((a, b) => b[1] - a[1]);

    // The six biggest units, then the long tail folded into one bar
    const shownCount = counts.length > 7 ? 6 : counts.length;
    const shown = counts.slice(0, shownCount).map(([name, count]) => ({ key: name, name, count, values: [name] }));
    const tail = counts.slice(shownCount);
    const chartData = tail.length
        ? [...shown, {
            key: "__other",
            name: `Other units (${tail.length})`,
            count: d3.sum(tail, d => d[1]),
            values: tail.map(d => d[0]),
            description: tail.map(([name, count]) => `${name} ${formatNumber(count)}`).join(" · ")
        }]
        : shown;

    const top = chartData[0];
    d3.select("#unit-note").html(!top ? "No objects match this filter." :
        `<strong>${escapeHtml(top.name)}</strong> keep <strong>${formatPercent(top.count / records.length)}</strong> ` +
        `of these ${formatNumber(records.length)} objects` +
        (chartData.length > 1 && top.count > records.length - top.count ? ` — more than all other units combined.` : `.`)
    );

    const filter = state.filter;
    createHorizontalBarChart("#unit-chart", chartData, {
        total: records.length,
        duration,
        highlight: d => d === top,
        isSelected: filter?.dim === "unit" ? d => sameValues(new Set(d.values), filter.values) : null,
        onSelect: d => setFilter(makeFilter("unit", d.values,
            d.key === "__other" ? `the ${d.values.length} smaller units` : d.name))
    });

    return counts;
}

// ------------------------------------------------------------
// Chart 3: Top Object Types
// ------------------------------------------------------------
function renderObjectTypeChart(records, { duration = 0 } = {}) {
    const counts = d3.rollups(records.filter(r => r.type), v => v.length, r => r.type)
        .sort((a, b) => b[1] - a[1]);
    const unspecified = records.filter(r => !r.type).length;
    const chartData = counts.slice(0, 8).map(([name, count]) => ({ key: name, name, count }));

    const [first, second] = chartData;
    const shownTotal = d3.sum(chartData, d => d.count);
    const rest = records.length - shownTotal - unspecified;
    d3.select("#objectType-note").html(!first ? "No objects match this filter." :
        (second
            ? `<strong>${escapeHtml(first.name)}</strong> and <strong>${escapeHtml(second.name.toLowerCase())}</strong> make up ` +
              `<strong>${formatPercent((first.count + second.count) / records.length)}</strong> of these objects. `
            : `<strong>${escapeHtml(first.name)}</strong> make up <strong>${formatPercent(first.count / records.length)}</strong> of these objects. `) +
        (rest > 0 ? `Not shown: ${formatNumber(rest)} objects in ${formatNumber(counts.length - chartData.length)} smaller types` : `All types are shown`) +
        (unspecified ? ` and ${formatNumber(unspecified)} with no type.` : `.`)
    );

    const filter = state.filter;
    createHorizontalBarChart("#objectType-chart", chartData, {
        total: records.length,
        duration,
        highlight: d => d === first || d === second,
        isSelected: filter?.dim === "type" ? d => filter.values.has(d.name) : null,
        onSelect: d => setFilter(makeFilter("type", [d.name], d.name))
    });

    return counts;
}

// ------------------------------------------------------------
// Chart 4: Records by Decade
// ------------------------------------------------------------
function renderDecadeChart(records, { duration = 0 } = {}) {
    const firstDecade = 1800;
    const lastDecade = 2020;
    const counts = new Map(d3.range(firstDecade, lastDecade + 10, 10).map(decade => [decade, 0]));
    let undated = 0;
    let older = 0;

    records.forEach(record => {
        if (record.decade === null) undated++;
        else if (record.decade < firstDecade) older++;
        else if (counts.has(record.decade)) counts.set(record.decade, counts.get(record.decade) + 1);
    });

    // Every decade gets a column, including empty ones, so gaps in time stay visible
    const chartData = Array.from(counts, ([decade, count]) => ({
        key: String(decade),
        name: `${decade}s`,
        decade,
        count
    }));

    const dated = records.length - undated;
    const peak = d3.greatest(chartData, d => d.count);
    d3.select("#decade-note").html(!dated ? "None of these objects has a date." :
        `<strong>${formatNumber(peak.count)}</strong> ${peak.count === 1 ? "object starts" : "objects start"} in the <strong>${peak.name}</strong> — ` +
        `${formatPercent(peak.count / dated)} of the ${formatNumber(dated)} with a date. ` +
        `Not shown: ${formatNumber(undated)} undated objects and ${formatNumber(older)} from before 1800.`
    );

    const filter = state.filter;
    createVerticalBarChart("#decade-chart", chartData, {
        total: dated,
        totalLabel: "dated objects",
        duration,
        highlight: d => peak.count > 0 && d === peak,
        isSelected: filter?.dim === "decade" ? d => filter.values.has(d.decade) : null,
        onSelect: d => d.count && setFilter(makeFilter("decade", [d.decade], d.name))
    });

    return { dated, undated, older, chartData };
}

// ------------------------------------------------------------
// Bar shapes: rounded only at the data end, square at the baseline
// ------------------------------------------------------------
function topRoundedBar(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h));
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function bindSelection(selection, { tooltip, onSelect }) {
    selection
        .on("pointerenter", (event, d) => showTooltip(event, tooltip(d)))
        .on("pointermove", moveTooltip)
        .on("pointerleave", hideTooltip)
        .on("click", (event, d) => onSelect && onSelect(d))
        .on("keydown", (event, d) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            if (onSelect) onSelect(d);
        });
}

// Reusable Vertical Bar Chart (used for the timeline)
function createVerticalBarChart(containerSelector, data, options = {}) {
    const container = d3.select(containerSelector);
    const {
        total = d3.sum(data, d => d.count),
        totalLabel = "objects",
        highlight = () => false,
        isSelected = null,
        onSelect = null,
        duration = 0
    } = options;

    const width = container.node().clientWidth || 400;
    const height = options.height || Math.round(Math.min(380, Math.max(260, width * 0.4)));
    const margin = { top: 44, right: 18, bottom: 30, left: 38 };

    let svg = container.select("svg");
    if (svg.empty() || +svg.attr("data-width") !== width) {
        container.html("");
        svg = container.append("svg")
            .attr("data-width", width)
            .attr("width", "100%")
            .attr("role", "img");
        svg.append("g").attr("class", "axis-y");
        svg.append("g").attr("class", "axis-x");
        svg.append("g").attr("class", "columns");
        svg.append("g").attr("class", "column-callout");
    }
    svg.attr("viewBox", `0 0 ${width} ${height}`)
        .attr("aria-label", `Column chart: ${data.map(d => `${d.name} ${d.count}`).join(", ")}`);

    const x = d3.scaleBand()
        .domain(data.map(d => d.name))
        .range([margin.left, width - margin.right])
        .padding(0.12);

    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.count) || 1])
        .nice(4)
        .range([height - margin.bottom, margin.top]);

    const t = d3.transition().duration(duration).ease(d3.easeCubicOut);
    const bw = x.bandwidth();
    const hasSelection = !!isSelected && data.some(isSelected);
    const emph = d => hasSelection ? isSelected(d) : highlight(d);
    const valueInside = d => y(0) - y(d.count) >= 28 && bw >= 22;

    // Recessive gridlines
    svg.select(".axis-y")
        .attr("transform", `translate(${margin.left}, 0)`)
        .transition(t)
        .call(d3.axisLeft(y).ticks(4).tickSize(-(width - margin.left - margin.right)).tickPadding(8).tickFormat(d3.format("~s")));

    const every = bw >= 30 ? 20 : 50;
    svg.select(".axis-x")
        .attr("transform", `translate(0, ${height - margin.bottom})`)
        .call(d3.axisBottom(x)
            .tickValues(data.map(d => d.name).filter(name => parseInt(name) % every === 0))
            .tickSize(0)
            .tickPadding(10));

    const columns = svg.select(".columns")
        .selectAll("g.column")
        .data(data, d => d.key || d.name)
        .join(enter => {
            const g = enter.append("g").attr("class", "column");
            g.append("path").attr("class", "bar")
                .attr("d", d => topRoundedBar(x(d.name), y(0), bw, 0, 10));
            g.append("text").attr("class", "bar-value")
                .attr("x", d => x(d.name) + bw / 2)
                .attr("y", y(0) - 6);
            g.append("rect").attr("class", "hit").attr("tabindex", 0).attr("role", "button");
            return g;
        });

    columns.classed("is-dimmed", d => hasSelection && !isSelected(d))
        .classed("is-emph", emph);

    columns.select(".bar")
        .classed("is-highlight", emph)
        .transition(t)
        .delay((d, i) => duration ? i * 18 : 0)
        .attr("d", d => topRoundedBar(x(d.name), y(d.count), bw, y(0) - y(d.count), Math.min(10, bw / 2)));

    // Every decade shows its count: inside tall columns, on top of short ones
    columns.select(".bar-value")
        .text(d => d.count && bw >= 16 ? formatNumber(d.count) : "")
        .classed("is-inside", valueInside)
        .transition(t)
        .delay((d, i) => duration ? i * 18 : 0)
        .attr("x", d => x(d.name) + bw / 2)
        .attr("y", d => valueInside(d) ? y(d.count) + 18 : y(d.count) - 7);

    // Name the emphasised decade above its column
    const callout = svg.select(".column-callout").selectAll("text")
        .data(data.filter(emph), d => d.key)
        .join(enter => enter.append("text").attr("class", "callout-text").attr("text-anchor", "middle"));
    callout.text(d => d.name)
        .transition(t)
        .attr("x", d => Math.min(width - 24, Math.max(margin.left + 24, x(d.name) + bw / 2)))
        .attr("y", d => valueInside(d) ? y(d.count) - 10 : y(d.count) - 26);

    // Hit areas span the full column so thin bars are easy to hover
    const hits = columns.select(".hit")
        .attr("x", d => x(d.name) - (x.step() - bw) / 2)
        .attr("y", margin.top)
        .attr("width", x.step())
        .attr("height", height - margin.top - margin.bottom)
        .attr("aria-label", d => `${d.name}: ${formatNumber(d.count)} objects. Press to filter.`);

    bindSelection(hits, {
        onSelect,
        tooltip: d => tooltipHtml(d.name, `${formatNumber(d.count)} objects`,
            total ? `${formatPercent(d.count / total)} of ${formatNumber(total)} ${totalLabel}` : "",
            !d.count ? "" : hasSelection && isSelected(d) ? "Click again to clear the filter" : "Click to filter the page")
    });
}

// Reusable Horizontal Bar Chart (For long names like Museum Units)
// Thick bars on a track; each label sits inside its bar when it fits
function createHorizontalBarChart(containerSelector, data, options = {}) {
    const container = d3.select(containerSelector);
    const {
        total = d3.sum(data, d => d.count),
        highlight = () => false,
        isSelected = null,
        onSelect = null,
        duration = 0
    } = options;

    const width = container.node().clientWidth || 400;
    const pitch = 50;
    const barH = 42;
    const radius = 14;
    const pad = 16;
    const height = Math.max(1, data.length * pitch - (pitch - barH));

    let svg = container.select("svg");
    if (svg.empty() || +svg.attr("data-width") !== width) {
        container.html("");
        svg = container.append("svg")
            .attr("data-width", width)
            .attr("width", "100%")
            .attr("role", "img");
    }
    container.selectAll(".chart-message").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`)
        .attr("aria-label", `Bar chart: ${data.map(d => `${d.name} ${d.count}`).join(", ")}`);

    if (!data.length) {
        svg.selectAll("g.row").remove();
        container.append("p").attr("class", "chart-message").text("No objects match this filter.");
        return;
    }

    const x = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.count) || 1])
        .range([0, width]);
    const barWidth = d => d.count ? Math.max(12, x(d.count)) : 0;
    const hasSelection = !!isSelected && data.some(isSelected);
    const emph = d => hasSelection ? isSelected(d) : highlight(d);
    const t = d3.transition().duration(duration).ease(d3.easeCubicOut);
    const delay = (d, i) => duration ? i * 45 : 0;

    const rows = svg.selectAll("g.row")
        .data(data, d => d.key || d.name)
        .join(
            enter => {
                const g = enter.append("g")
                    .attr("class", "row")
                    .attr("transform", (d, i) => `translate(0, ${i * pitch})`)
                    .style("opacity", 0);
                g.append("rect").attr("class", "bar-track").attr("height", barH).attr("rx", radius);
                g.append("rect").attr("class", "bar").attr("height", barH).attr("rx", radius).attr("width", 0);
                g.append("text").attr("class", "bar-label").attr("x", pad).attr("y", barH / 2).attr("dy", "0.36em");
                g.append("text").attr("class", "bar-value").attr("y", barH / 2).attr("dy", "0.36em").attr("text-anchor", "end");
                g.append("rect").attr("class", "hit").attr("height", barH).attr("rx", radius)
                    .attr("tabindex", 0).attr("role", "button");
                return g;
            },
            update => update,
            exit => exit.transition(t).style("opacity", 0).remove()
        );

    rows.classed("is-dimmed", d => hasSelection && !isSelected(d))
        .classed("is-emph", emph);
    rows.transition(t)
        .delay(delay)
        .attr("transform", (d, i) => `translate(0, ${i * pitch})`)
        .style("opacity", 1);

    rows.select(".bar-track").attr("width", width);
    rows.select(".bar")
        .classed("is-highlight", emph)
        .transition(t)
        .delay(delay)
        .attr("width", barWidth);

    // Labels: inside the bar when they fit, otherwise just after it; the value sits at the row's end
    rows.each(function (d, i) {
        const row = d3.select(this);
        const w = barWidth(d);
        const label = row.select(".bar-label").text(d.name);
        const value = row.select(".bar-value").text(`${formatNumber(d.count)} · ${formatPercent(d.count / total)}`);
        let valueW = value.node().getComputedTextLength();
        const labelW = label.node().getComputedTextLength();
        const inside = labelW + pad * 2 <= w;
        const labelX = inside ? pad : w + 12;

        if (!inside && labelX + labelW + 14 > width - pad - valueW) {
            value.text(formatNumber(d.count));
            valueW = value.node().getComputedTextLength();
            let text = d.name;
            while (text.length > 4 && labelX + label.node().getComputedTextLength() + 14 > width - pad - valueW) {
                text = text.slice(0, -2);
                label.text(`${text.trim()}…`);
            }
        }

        label.classed("is-inside", inside)
            .transition(t).delay(delay(d, i))
            .attr("x", labelX);
        value.classed("is-inside", w > width - pad - valueW - 10)
            .attr("x", width - pad);
    });

    const hits = rows.select(".hit")
        .attr("width", width)
        .attr("aria-label", d => `${d.name}: ${formatNumber(d.count)} objects. Press to filter.`);

    bindSelection(hits, {
        onSelect,
        tooltip: d => tooltipHtml(d.name, `${formatNumber(d.count)} objects`,
            d.description || `${formatPercent(d.count / total)} of these ${formatNumber(total)} objects`,
            hasSelection && isSelected(d) ? "Click again to clear the filter" : "Click to filter the page")
    });
}

// ------------------------------------------------------------
// Flip: every data box has a back with its raw data and query
// ------------------------------------------------------------
function setupCards() {
    document.querySelectorAll(".card").forEach((card, i) => card.style.setProperty("--i", i));

    document.querySelectorAll("[data-flip]").forEach(card => {
        const front = document.createElement("div");
        front.className = "card-front";
        while (card.firstChild) front.appendChild(card.firstChild);

        const back = document.createElement("div");
        back.className = "card-back";
        back.hidden = true;

        const peel = document.createElement("button");
        peel.type = "button";
        peel.className = "peel";
        peel.setAttribute("aria-label", "Flip this box to see its raw data and query");

        card.append(front, back, peel);

        peel.addEventListener("click", () => flipCard(card));
        peel.addEventListener("pointerenter", event => {
            const flipped = card.classList.contains("is-flipped");
            showTooltip(event, tooltipHtml(flipped ? "Flip back" : "Peel me",
                "", flipped ? "Back to the chart" : "See the raw data and the query behind this box"));
        });
        peel.addEventListener("pointermove", moveTooltip);
        peel.addEventListener("pointerleave", hideTooltip);
    });
}

async function flipCard(card) {
    if (card._flipping) return;
    card._flipping = true;
    const toBack = !card.classList.contains("is-flipped");
    hideTooltip();
    if (toBack) renderBack(card);

    const swap = () => {
        card.classList.toggle("is-flipped", toBack);
        card.querySelector(".card-back").hidden = !toBack;
    };

    if (prefersReducedMotion) {
        swap();
    } else {
        await card.animate(
            [{ transform: "perspective(1600px) rotateY(0deg)" }, { transform: "perspective(1600px) rotateY(90deg)" }],
            { duration: 200, easing: "cubic-bezier(.5,0,.9,.5)" }).finished;
        swap();
        await card.animate(
            [{ transform: "perspective(1600px) rotateY(-90deg)" }, { transform: "perspective(1600px) rotateY(0deg)" }],
            { duration: 460, easing: "cubic-bezier(.2,.9,.3,1.3)" }).finished;
    }

    card._flipping = false;
    const focusTarget = toBack ? card.querySelector(".back-close") : card.querySelector(".peel");
    if (focusTarget) focusTarget.focus({ preventScroll: true });
}

function refreshOpenBacks() {
    document.querySelectorAll(".card.is-flipped").forEach(renderBack);
}

function renderBack(card) {
    const spec = backSpec(card.dataset.card);
    const back = card.querySelector(".card-back");
    const head = spec.columns.map(c => `<th${c.num ? ' class="num"' : ""}>${escapeHtml(c.label)}</th>`).join("");
    const body = spec.rows.map(row => `<tr>${row.map((cell, i) =>
        `<td${spec.columns[i].num ? ' class="num"' : ""}>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");

    back.innerHTML =
        `<div class="back-head"><span class="tag">Behind this box</span>` +
        `<button type="button" class="round-btn back-close" aria-label="Flip back">↩</button></div>` +
        `<p class="back-label">Query</p>` +
        `<pre class="back-code">${spec.query}</pre>` +
        `<p class="back-label">${escapeHtml(spec.tableTitle)}</p>` +
        `<div class="back-table-wrap"><table class="back-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>` +
        (spec.more ? `<p class="back-more">${escapeHtml(spec.more)}</p>` : "") +
        `<p class="back-label">Sample record</p>` +
        `<pre class="back-code">${escapeHtml(JSON.stringify(spec.sample, null, 2))}</pre>`;

    back.querySelector(".back-close").addEventListener("click", () => flipCard(card));
}

// What each box's back shows: the steps from the API to the numbers, and the rows themselves
function backSpec(id) {
    const filter = state.filter;
    const dimOf = { map: "country", "fact-top": "country", "fact-biggest": "country", units: "unit", types: "type", decades: "decade" };
    const dim = dimOf[id];
    const records = dim ? state.datasets[dim] : state.filtered;
    const filtered = filter && (!dim || filter.dim !== dim);
    const comment = text => `<span class="c">// ${escapeHtml(text)}</span>`;

    const lines = [
        comment("1 · download (download-data.js)"),
        "GET api.si.edu/openaccess/api/v1.0/search?q=miscellaneous&amp;rows=1000&amp;start=…",
        "GET api.si.edu/openaccess/api/v1.0/search?q=misc&amp;rows=1000&amp;start=…",
        `keep rows where freetext.objectType mentions "misc"  → ${formatNumber(state.records.length)} records`
    ];
    if (filtered) {
        lines.push(comment("2 · filter"), `${escapeHtml(filterClause(filter))}  → ${formatNumber(records.length)} records`);
    }
    lines.push(comment(`${filtered ? 3 : 2} · this box`));

    const pct = (n, of) => of ? formatPercent(n / of) : "–";
    let columns;
    let rows;
    let tableTitle;

    if (id === "units" || id === "units-stat") {
        lines.push("group by unitCode → count");
        const byUnit = d3.rollups(records, v => ({ count: v.length, codes: [...new Set(v.map(r => r.unitCode))] }), r => r.unit)
            .sort((a, b) => b[1].count - a[1].count);
        columns = [{ label: "Code" }, { label: "Unit" }, { label: "Objects", num: true }, { label: "Share", num: true }];
        rows = byUnit.map(([unit, v]) => [v.codes.join(", "), unit, formatNumber(v.count), pct(v.count, records.length)]);
        tableTitle = `Data · ${rows.length} units`;
    } else if (id === "types") {
        lines.push("take indexedStructured.object_type[0]  (or freetext.objectType[0])", "group by type → count");
        const byType = d3.rollups(records, v => v.length, r => r.type || "(no type)").sort((a, b) => b[1] - a[1]);
        columns = [{ label: "Type" }, { label: "Objects", num: true }, { label: "Share", num: true }];
        rows = byType.map(([type, count]) => [type, formatNumber(count), pct(count, records.length)]);
        tableTitle = `Data · ${rows.length} types`;
    } else if (id === "decades" || id === "dated") {
        lines.push("take min(indexedStructured.date) → decade", "group by decade → count");
        const byDecade = d3.rollups(records, v => v.length, r => r.decade)
            .sort((a, b) => (a[0] ?? Infinity) - (b[0] ?? Infinity));
        columns = [{ label: "Decade" }, { label: "Objects", num: true }];
        rows = byDecade.map(([decade, count]) => [decade === null ? "(no date)" : `${decade}s`, formatNumber(count)]);
        tableTitle = `Data · ${rows.length} decades`;
    } else if (id === "countries-stat" || id === "map" || id === "fact-top" || id === "fact-biggest") {
        lines.push(
            "split indexedStructured.place + freetext.place on \",\"",
            "match world.geojson country names  (50 U.S. states → USA)",
            "group by country → count"
        );
        if (id !== "countries-stat" && window.COUNTRY_TOTALS) {
            lines.push(
                comment(`rate (build-country-totals.js, ${window.COUNTRY_TOTALS.retrieved})`),
                "÷ GET api.si.edu/openaccess/api/v1.0/search?q=place:\"&lt;country&gt;\"&amp;rows=1  → rowCount",
                `× 10,000 · rated only with ≥ ${MIN_OBJECTS_FOR_RATE} objects`
            );
        }
        const stats = id === "countries-stat" ? countryStatsFor(records) : Array.from(state.map?.stats?.values() || []);
        stats.sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.count - a.count);
        columns = [{ label: "Country" }, { label: "Misc.", num: true }, { label: "Smithsonian total", num: true }, { label: "Per 10k", num: true }];
        rows = stats.map(s => [getCountryDisplayName(s.name), formatNumber(s.count),
            s.total ? formatNumber(s.total) : "–", s.rate == null ? "too few" : formatRate(s.rate)]);
        tableTitle = `Data · ${rows.length} countries`;
    } else if (id === "fact-unplaced") {
        lines.push("keep records where no place part matches a country");
        const unplaced = records.filter(r => !r.countries.size);
        columns = [{ label: "Title" }, { label: "Unit" }];
        rows = unplaced.map(r => [shorten(r.raw.title), r.unit]);
        tableTitle = `Data · ${formatNumber(unplaced.length)} objects with no place`;
    } else {
        lines.push("count(records)");
        columns = [{ label: "Title" }, { label: "Unit" }, { label: "Type" }, { label: "Decade", num: true }];
        rows = records.map(r => [shorten(r.raw.title), r.unit, r.type || "–", r.decade === null ? "–" : `${r.decade}s`]);
        tableTitle = `Data · ${formatNumber(records.length)} objects`;
    }

    const limit = 80;
    return {
        query: lines.join("\n"),
        columns,
        rows: rows.slice(0, limit),
        more: rows.length > limit ? `…and ${formatNumber(rows.length - limit)} more rows` : "",
        tableTitle,
        sample: sampleRecord(records[0])
    };
}

function filterClause(filter) {
    const values = [...filter.values];
    if (filter.dim === "unit") {
        const codes = [...new Set(state.records.filter(r => filter.values.has(r.unit)).map(r => r.unitCode))];
        return `where unitCode in (${codes.map(c => `"${c}"`).join(", ")})`;
    }
    if (filter.dim === "type") return `where object_type[0] = "${values[0]}"`;
    if (filter.dim === "decade") return `where earliest date in ${values[0]}–${values[0] + 9}`;
    return `where place names ${values.map(v => `"${getCountryDisplayName(v)}"`).join(", ")}`;
}

function countryStatsFor(records) {
    const counts = {};
    records.forEach(r => r.countries.forEach(c => { counts[c] = (counts[c] || 0) + 1; }));
    const totals = window.COUNTRY_TOTALS?.countries || {};
    return Object.entries(counts).map(([name, count]) => ({ name, count, total: totals[name] || 0, rate: null }));
}

function shorten(text, max = 60) {
    const clean = String(text || "(untitled)");
    return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function sampleRecord(record) {
    if (!record) return { note: "No records match this filter." };
    const raw = record.raw;
    const indexed = raw.content?.indexedStructured || {};
    return {
        id: raw.id,
        title: raw.title,
        unitCode: raw.unitCode,
        indexedStructured: {
            place: indexed.place,
            object_type: indexed.object_type,
            date: indexed.date
        }
    };
}
