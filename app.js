const START_YEAR = 1981;
const END_YEAR = 2025;
const API_BASE = "https://power.larc.nasa.gov/api/temporal/daily/point";
const CACHE_PREFIX = "astrovanta-monsoon-v1-";
const BOOTSTRAP_RUNS = 500;
const BLOCK_LENGTH = 5;
const REGIONAL_API_BASE = "https://power.larc.nasa.gov/api/temporal/daily/regional";
const GRID_CACHE_KEY = "astrovanta-central-east-up-grid-v1";
const GRID_BOUNDS = { latitudeMin: 24.5, latitudeMax: 27.5, longitudeMin: 79.5, longitudeMax: 84 };

const LOCATIONS = [
  { id: "ayodhya", name: "Ayodhya", region: "Uttar Pradesh", lat: 26.79, lon: 82.20, seed: 17 },
  { id: "lucknow", name: "Lucknow", region: "Uttar Pradesh", lat: 26.85, lon: 80.95, seed: 29 },
  { id: "prayagraj", name: "Prayagraj", region: "Uttar Pradesh", lat: 25.44, lon: 81.84, seed: 41 },
  { id: "gorakhpur", name: "Gorakhpur", region: "Uttar Pradesh", lat: 26.76, lon: 83.37, seed: 53 },
  { id: "varanasi", name: "Varanasi", region: "Uttar Pradesh", lat: 25.32, lon: 82.97, seed: 67 }
];

let resultsById = {};
let selectedId = "ayodhya";
let mapInstance = null;
let mapMarkers = {};
let trendById = {};
let regionalGrid = [];
let gridLayers = [];
let gridLoading = false;

document.addEventListener("DOMContentLoaded", function () {
  initMap();
  document.getElementById("download-csv").addEventListener("click", downloadCsv);
  document.getElementById("retry-load").addEventListener("click", loadAllData);
  document.getElementById("retry-grid").addEventListener("click", loadRegionalGrid);
  loadAllData();
});

function initMap() {
  if (!window.L) {
    document.getElementById("map").innerHTML = '<div class="map-fallback">The map library did not load. Trend charts and location comparisons can still be explored below.</div>';
    return;
  }
  mapInstance = L.map("map", { scrollWheelZoom: false, zoomControl: false }).setView([26.1, 82.2], 6);
  L.control.zoom({ position: "topright" }).addTo(mapInstance);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 12,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'
  }).addTo(mapInstance);
  window.setTimeout(function () { mapInstance.invalidateSize(); }, 250);
}

function setStatus(message, kind) {
  const status = document.getElementById("data-status");
  status.className = "section-status" + (kind ? " " + kind : "");
  document.getElementById("status-text").textContent = message;
  const retry = document.getElementById("retry-load");
  if (retry) retry.hidden = kind !== "error";
}

function setGridStatus(message, kind) {
  const status = document.getElementById("grid-status");
  if (!status) return;
  status.className = "grid-status" + (kind ? " " + kind : "");
  document.getElementById("grid-status-text").textContent = message;
  const retry = document.getElementById("retry-grid");
  if (retry) retry.hidden = kind !== "error";
}

async function loadAllData() {
  setStatus("Requesting daily rainfall from NASA POWER…");
  try {
    const settled = await Promise.allSettled(LOCATIONS.map(fetchLocation));
    settled.forEach(function (item, index) {
      if (item.status === "fulfilled") resultsById[LOCATIONS[index].id] = item.value;
    });
    const count = Object.keys(resultsById).length;
    if (!count) {
      const firstFailure = settled.find(function (item) { return item.status === "rejected"; });
      throw (firstFailure && firstFailure.reason) || new Error("No location data was returned.");
    }
    if (!resultsById[selectedId]) {
      const firstAvailable = LOCATIONS.find(function (location) { return Boolean(resultsById[location.id]); });
      if (firstAvailable) selectedId = firstAvailable.id;
    }
    trendById = {};
    Object.keys(resultsById).forEach(function (id) {
      const location = resultsById[id].location;
      trendById[id] = bootstrapInterval(resultsById[id].seasons, location.seed);
    });
    renderLocations();
    renderRegionalSummary();
    renderMarkers();
    selectLocation(selectedId);
    document.getElementById("download-csv").disabled = false;
    if (count === LOCATIONS.length) {
      setStatus("NASA POWER data loaded · " + count + " reference cells", "ready");
    } else {
      setStatus("Loaded " + count + " of " + LOCATIONS.length + " cells · retry to complete", "error");
    }
  } catch (error) {
    setStatus(error.message || "NASA POWER could not be reached. Try again.", "error");
    document.getElementById("selected-name").textContent = "Data unavailable";
    document.getElementById("selected-region").textContent = "Check your connection and retry.";
    document.getElementById("signal-pill").textContent = "Offline";
  } finally {
    loadRegionalGrid();
  }
}

async function loadRegionalGrid() {
  if (gridLoading) return;
  gridLoading = true;
  setGridStatus("Requesting the NASA POWER daily regional grid…");
  try {
    let rawCells = [];
    try {
      const cached = JSON.parse(localStorage.getItem(GRID_CACHE_KEY) || "null");
      if (cached && cached.savedAt && Date.now() - cached.savedAt < 24 * 60 * 60 * 1000 &&
          Array.isArray(cached.cells) && cached.cells.length) {
        rawCells = cached.cells;
      }
    } catch (_) {}

    if (!rawCells.length) {
      const url = new URL(REGIONAL_API_BASE);
      url.searchParams.set("parameters", "PRECTOTCORR");
      url.searchParams.set("community", "AG");
      url.searchParams.set("latitude-min", GRID_BOUNDS.latitudeMin);
      url.searchParams.set("latitude-max", GRID_BOUNDS.latitudeMax);
      url.searchParams.set("longitude-min", GRID_BOUNDS.longitudeMin);
      url.searchParams.set("longitude-max", GRID_BOUNDS.longitudeMax);
      url.searchParams.set("start", String(START_YEAR) + "0101");
      url.searchParams.set("end", String(END_YEAR) + "1231");
      url.searchParams.set("format", "JSON");
      const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("NASA POWER regional request failed (" + response.status + ").");
      const payload = await response.json();
      rawCells = extractRegionalCells(payload);
      if (rawCells.length < 10) throw new Error("NASA POWER returned too few regional grid cells.");
      try {
        localStorage.setItem(GRID_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), cells: rawCells }));
      } catch (_) {}
    }

    if (rawCells.length < 10) throw new Error("No regional grid cells are available.");
    const analyzed = [];
    for (let index = 0; index < rawCells.length; index += 1) {
      const cell = rawCells[index];
      const seed = (Math.round((cell.lat + 90) * 10000) + Math.round((cell.lon + 180) * 1000)) >>> 0;
      const location = {
        id: "grid-" + cell.lat.toFixed(3) + "-" + cell.lon.toFixed(3),
        name: "POWER grid cell",
        region: "Central and eastern Uttar Pradesh sample",
        lat: cell.lat,
        lon: cell.lon,
        seed: seed
      };
      analyzed.push({
        location: location,
        seasons: cell.seasons,
        trend: bootstrapInterval(cell.seasons, seed)
      });
      if ((index + 1) % 4 === 0 && index + 1 < rawCells.length) {
        setGridStatus("Calculating trend intervals · " + (index + 1) + " of " + rawCells.length + " cells…");
        await new Promise(function (resolve) { window.setTimeout(resolve, 0); });
      }
    }
    regionalGrid = analyzed;
    renderRegionalGrid();
    renderMarkers();
    setGridStatus("NASA POWER trend grid loaded · " + regionalGrid.length + " cells · hover a cell for its interval", "ready");
  } catch (error) {
    regionalGrid = [];
    renderRegionalGrid();
    setGridStatus("Regional grid unavailable · city trends remain available. " + (error.message || "Retry the request."), "error");
  } finally {
    gridLoading = false;
  }
}

function extractRegionalCells(payload) {
  const features = payload && Array.isArray(payload.features) ? payload.features : [];
  const cells = [];
  const seen = new Set();
  features.forEach(function (feature) {
    const properties = feature && feature.properties ? feature.properties : {};
    const parameterSets = [properties.parameter, properties.parameters, properties.data, properties];
    let daily = null;
    for (let index = 0; index < parameterSets.length; index += 1) {
      const set = parameterSets[index];
      if (set && set.PRECTOTCORR && typeof set.PRECTOTCORR === "object") {
        daily = set.PRECTOTCORR;
        break;
      }
    }
    const pairs = [];
    collectCoordinatePairs(feature && feature.geometry ? feature.geometry.coordinates : null, pairs);
    if (!daily || !pairs.length) return;
    const lons = pairs.map(function (pair) { return pair[0]; });
    const lats = pairs.map(function (pair) { return pair[1]; });
    const lon = (Math.min.apply(null, lons) + Math.max.apply(null, lons)) / 2;
    const lat = (Math.min.apply(null, lats) + Math.max.apply(null, lats)) / 2;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const key = lat.toFixed(3) + "|" + lon.toFixed(3);
    if (seen.has(key)) return;
    const seasons = buildMonsoonTotals(daily);
    if (seasons.length < 40) return;
    seen.add(key);
    cells.push({ lat: lat, lon: lon, seasons: seasons });
  });
  return cells;
}

function collectCoordinatePairs(value, pairs) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1])) &&
      !Array.isArray(value[0]) && !Array.isArray(value[1])) {
    pairs.push([Number(value[0]), Number(value[1])]);
    return;
  }
  value.forEach(function (child) { collectCoordinatePairs(child, pairs); });
}

async function fetchLocation(location) {
  const cacheKey = CACHE_PREFIX + location.id;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (cached && cached.savedAt && Date.now() - cached.savedAt < 24 * 60 * 60 * 1000 && cached.seasons && cached.seasons.length) {
      return { location: location, seasons: cached.seasons, cached: true };
    }
  } catch (_) {}

  const url = new URL(API_BASE);
  url.searchParams.set("parameters", "PRECTOTCORR");
  url.searchParams.set("community", "AG");
  url.searchParams.set("longitude", location.lon);
  url.searchParams.set("latitude", location.lat);
  url.searchParams.set("start", String(START_YEAR) + "0101");
  url.searchParams.set("end", String(END_YEAR) + "1231");
  url.searchParams.set("format", "JSON");

  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("NASA POWER request failed (" + response.status + "). Please retry in a moment.");
  const payload = await response.json();
  const daily = payload && payload.properties && payload.properties.parameter && payload.properties.parameter.PRECTOTCORR;
  if (!daily || typeof daily !== "object") throw new Error("NASA POWER returned an unexpected data format.");

  const seasons = buildMonsoonTotals(daily);
  if (seasons.length < 20) throw new Error("Not enough complete monsoon seasons were returned for " + location.name + ".");
  const output = { location: location, seasons: seasons, cached: false };
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), seasons: seasons }));
  } catch (_) {}
  return output;
}

function buildMonsoonTotals(daily) {
  const seasons = [];
  for (let year = START_YEAR; year <= END_YEAR; year += 1) {
    let total = 0;
    let validDays = 0;
    for (let month = 6; month <= 9; month += 1) {
      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      for (let day = 1; day <= daysInMonth; day += 1) {
        const key = String(year) + String(month).padStart(2, "0") + String(day).padStart(2, "0");
        const value = Number(daily[key]);
        if (Number.isFinite(value) && value > -900) {
          total += value;
          validDays += 1;
        }
      }
    }
    const expectedDays = 122;
    if (validDays === expectedDays) seasons.push({ year: year, rainfall: total });
  }
  return seasons;
}

function median(values) {
  if (!values.length) return NaN;
  const sorted = values.slice().sort(function (a, b) { return a - b; });
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function theilSen(points) {
  const slopes = [];
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const span = points[j].year - points[i].year;
      if (span) slopes.push((points[j].rainfall - points[i].rainfall) / span);
    }
  }
  return median(slopes);
}

function makeRandom(seed) {
  let value = seed >>> 0;
  return function () {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bootstrapInterval(points, seed) {
  const slope = theilSen(points);
  const firstYear = points[0].year;
  const intercept = median(points.map(function (point) {
    return point.rainfall - slope * (point.year - firstYear);
  }));
  const residuals = points.map(function (point) {
    return point.rainfall - (intercept + slope * (point.year - firstYear));
  });
  const random = makeRandom(seed);
  const bootSlopes = [];

  for (let run = 0; run < BOOTSTRAP_RUNS; run += 1) {
    const sampledResiduals = [];
    while (sampledResiduals.length < points.length) {
      const start = Math.floor(random() * residuals.length);
      for (let offset = 0; offset < BLOCK_LENGTH && sampledResiduals.length < points.length; offset += 1) {
        sampledResiduals.push(residuals[(start + offset) % residuals.length]);
      }
    }
    const synthetic = points.map(function (point, index) {
      return {
        year: point.year,
        rainfall: intercept + slope * (point.year - firstYear) + sampledResiduals[index]
      };
    });
    bootSlopes.push(theilSen(synthetic));
  }
  bootSlopes.sort(function (a, b) { return a - b; });
  return {
    slope: slope,
    low: percentile(bootSlopes, 0.025),
    high: percentile(bootSlopes, 0.975)
  };
}

function percentile(sortedValues, probability) {
  const index = (sortedValues.length - 1) * probability;
  const lower = Math.floor(index);
  const fraction = index - lower;
  const upper = Math.min(lower + 1, sortedValues.length - 1);
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * fraction;
}

function getSignal(trend) {
  if (trend.low > 0) return "up";
  if (trend.high < 0) return "down";
  return "unclear";
}

function signalColor(signal) {
  if (signal === "up") return "#d7ff64";
  if (signal === "down") return "#ff9a82";
  return "#94a5ae";
}

function renderRegionalSummary() {
  const cells = LOCATIONS.filter(function (location) {
    return Boolean(resultsById[location.id] && trendById[location.id]);
  }).map(function (location) {
    const trend = trendById[location.id];
    return { location: location, trend: trend, signal: getSignal(trend) };
  });
  const increasing = cells.filter(function (cell) { return cell.signal === "up"; });
  const decreasing = cells.filter(function (cell) { return cell.signal === "down"; });
  const unclear = cells.filter(function (cell) { return cell.signal === "unclear"; });

  document.getElementById("summary-up").textContent = String(increasing.length);
  document.getElementById("summary-down").textContent = String(decreasing.length);
  document.getElementById("summary-unclear").textContent = String(unclear.length);
  document.getElementById("summary-coverage").textContent =
    cells.length + " of " + LOCATIONS.length + " reference cells loaded";

  if (!cells.length) {
    document.getElementById("summary-finding").textContent = "No reference-cell trends are available yet.";
    return;
  }

  let finding = "Among " + cells.length + " loaded cells: " + increasing.length +
    " increasing, " + decreasing.length + " decreasing, and " + unclear.length + " unclear.";
  const largest = cells.reduce(function (best, cell) {
    return Math.abs(cell.trend.slope) > Math.abs(best.trend.slope) ? cell : best;
  });
  finding += " Largest-magnitude point estimate: " + largest.location.name + " (" +
    signed(largest.trend.slope * 10, 1) + " mm/decade).";
  document.getElementById("summary-finding").textContent = finding;
}

function renderLocations() {
  const root = document.getElementById("location-list");
  root.innerHTML = LOCATIONS.map(function (location) {
    const result = resultsById[location.id];
    const trend = result ? trendById[location.id] : null;
    const signal = trend ? getSignal(trend) : "unclear";
    return '<button type="button" class="site-row' + (location.id === selectedId ? " active" : "") + '" data-location="' + location.id + '">' +
      '<span class="site-row-dot" style="background:' + signalColor(signal) + '"></span>' +
      '<span class="site-row-copy"><strong>' + escapeHtml(location.name) + '</strong><small>' + (trend ? signed(trend.slope * 10, 1) + ' mm / decade' : 'Data unavailable') + '</small></span>' +
      '</button>';
  }).join("");
  root.querySelectorAll("[data-location]").forEach(function (button) {
    button.addEventListener("click", function () { selectLocation(button.dataset.location); });
  });
}

function gridSpacing(values, fallback) {
  const unique = Array.from(new Set(values.map(function (value) { return Number(value.toFixed(4)); }))).sort(function (a, b) { return a - b; });
  const steps = [];
  for (let index = 1; index < unique.length; index += 1) {
    const step = unique[index] - unique[index - 1];
    if (step > .05) steps.push(step);
  }
  return steps.length ? median(steps) : fallback;
}

function renderRegionalGrid() {
  if (!mapInstance) return;
  gridLayers.forEach(function (layer) { mapInstance.removeLayer(layer); });
  gridLayers = [];
  if (!regionalGrid.length) return;
  const latitudeStep = gridSpacing(regionalGrid.map(function (cell) { return cell.location.lat; }), .5);
  const longitudeStep = gridSpacing(regionalGrid.map(function (cell) { return cell.location.lon; }), .625);
  regionalGrid.forEach(function (cell) {
    const location = cell.location;
    const trend = cell.trend;
    const signal = getSignal(trend);
    const rectangle = L.rectangle([
      [location.lat - latitudeStep / 2, location.lon - longitudeStep / 2],
      [location.lat + latitudeStep / 2, location.lon + longitudeStep / 2]
    ], {
      color: "#091321",
      weight: .6,
      opacity: .72,
      fillColor: signalColor(signal),
      fillOpacity: .48
    }).addTo(mapInstance);
    const label = signal === "up" ? "Increasing" : signal === "down" ? "Decreasing" : "Unclear";
    rectangle.bindTooltip(
      "POWER grid cell · " + location.lat.toFixed(2) + "°N, " + location.lon.toFixed(2) +
      "°E<br>" + label + " · " + signed(trend.slope * 10, 1) + " mm/decade<br>95% interval: " +
      signed(trend.low * 10, 1) + " to " + signed(trend.high * 10, 1) + " mm/decade",
      { sticky: true }
    );
    gridLayers.push(rectangle);
  });
}

function renderMarkers() {
  if (!mapInstance) return;
  Object.keys(mapMarkers).forEach(function (id) { mapInstance.removeLayer(mapMarkers[id]); });
  mapMarkers = {};
  LOCATIONS.forEach(function (location) {
    const result = resultsById[location.id];
    const trend = result ? trendById[location.id] : null;
    const signal = trend ? getSignal(trend) : "unclear";
    const marker = L.circleMarker([location.lat, location.lon], {
      radius: location.id === selectedId ? 9 : 7,
      color: "#091321",
      weight: 2.2,
      fillColor: signalColor(signal),
      fillOpacity: 1
    }).addTo(mapInstance);
    marker.bindTooltip(location.name + (trend ? " · " + signed(trend.slope * 10, 1) + " mm/decade" : ""), { direction: "top", offset: [0, -7] });
    marker.on("click", function () { selectLocation(location.id); });
    mapMarkers[location.id] = marker;
  });
  const extentPoints = LOCATIONS.map(function (location) { return [location.lat, location.lon]; })
    .concat(regionalGrid.map(function (cell) { return [cell.location.lat, cell.location.lon]; }));
  const bounds = L.latLngBounds(extentPoints);
  mapInstance.fitBounds(bounds.pad(.08), { maxZoom: 7 });
  window.setTimeout(function () { mapInstance.invalidateSize(); }, 100);
}

function selectLocation(id) {
  const result = resultsById[id];
  if (!result) return;
  selectedId = id;
  const location = result.location;
  const seasons = result.seasons;
  const trend = trendById[id] || bootstrapInterval(seasons, location.seed);
  const signal = getSignal(trend);
  const mean = seasons.reduce(function (sum, point) { return sum + point.rainfall; }, 0) / seasons.length;
  const first = seasons.slice(0, Math.min(10, seasons.length));
  const last = seasons.slice(-Math.min(10, seasons.length));
  const firstMean = first.reduce(function (sum, point) { return sum + point.rainfall; }, 0) / first.length;
  const lastMean = last.reduce(function (sum, point) { return sum + point.rainfall; }, 0) / last.length;
  const change = lastMean - firstMean;

  document.getElementById("selected-name").textContent = location.name;
  document.getElementById("selected-region").textContent = location.region + ", India · " + location.lat.toFixed(2) + "°N, " + location.lon.toFixed(2) + "°E";
  document.getElementById("mean-value").textContent = formatNumber(mean, 0);
  document.getElementById("trend-value").textContent = signed(trend.slope * 10, 1);
  document.getElementById("trend-note").textContent = seasons.length + " complete seasons · Theil–Sen";
  document.getElementById("interval-value").textContent = signed(trend.low * 10, 1) + " to " + signed(trend.high * 10, 1) + " mm / decade";
  document.getElementById("change-value").textContent = signed(change, 0) + " mm · last 10 vs first 10 seasons";
  const pill = document.getElementById("signal-pill");
  pill.className = "signal-pill " + (signal === "unclear" ? "neutral" : signal);
  pill.textContent = signal === "up" ? "INCREASING" : signal === "down" ? "DECREASING" : "UNCLEAR SIGNAL";
  document.getElementById("confidence-icon").textContent = signal === "down" ? "↘" : signal === "unclear" ? "↔" : "↗";

  renderChart(seasons, trend);
  renderLocations();
  renderMarkers();
}

function renderChart(points, trend) {
  const root = document.getElementById("chart");
  if (!points || points.length < 2) { root.textContent = "Not enough complete seasons to draw a trend."; return; }
  const width = 800, height = 260, left = 58, right = 18, top = 15, bottom = 35;
  const values = points.map(function (point) { return point.rainfall; });
  let minValue = Math.min.apply(null, values);
  let maxValue = Math.max.apply(null, values);
  const padding = Math.max((maxValue - minValue) * .12, 20);
  minValue = Math.max(0, minValue - padding);
  maxValue += padding;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xFor = function (index) { return left + (index / (points.length - 1)) * plotWidth; };
  const yFor = function (value) { return top + ((maxValue - value) / (maxValue - minValue)) * plotHeight; };
  const path = points.map(function (point, index) {
    return (index === 0 ? "M " : " L ") + xFor(index).toFixed(1) + " " + yFor(point.rainfall).toFixed(1);
  }).join("");
  const firstYear = points[0].year;
  const intercept = median(points.map(function (point) { return point.rainfall - trend.slope * (point.year - firstYear); }));
  const trendStart = intercept;
  const trendEnd = intercept + trend.slope * (points[points.length - 1].year - firstYear);
  const yTicks = 4;
  let grid = "";
  for (let i = 0; i <= yTicks; i += 1) {
    const value = minValue + ((maxValue - minValue) * i / yTicks);
    const y = yFor(value);
    grid += '<line class="gridline" x1="' + left + '" y1="' + y.toFixed(1) + '" x2="' + (width - right) + '" y2="' + y.toFixed(1) + '"></line>' +
      '<text class="axis-label" x="' + (left - 10) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end">' + Math.round(value) + '</text>';
  }
  const selectedPoints = points.filter(function (_, index) {
    return index % Math.max(1, Math.floor(points.length / 9)) === 0 || index === points.length - 1;
  }).map(function (point) {
    const index = points.indexOf(point);
    return '<circle class="rain-point" cx="' + xFor(index).toFixed(1) + '" cy="' + yFor(point.rainfall).toFixed(1) + '" r="2.6"><title>' + point.year + ': ' + formatNumber(point.rainfall, 1) + ' mm</title></circle>';
  }).join("");
  const trendPath = "M " + xFor(0).toFixed(1) + " " + yFor(trendStart).toFixed(1) + " L " + xFor(points.length - 1).toFixed(1) + " " + yFor(trendEnd).toFixed(1);
  const xLabels = [
    { index: 0, anchor: "start" },
    { index: Math.floor((points.length - 1) / 2), anchor: "middle" },
    { index: points.length - 1, anchor: "end" }
  ].map(function (item) {
    return '<text class="axis-label" x="' + xFor(item.index).toFixed(1) + '" y="' + (height - 8) + '" text-anchor="' + item.anchor + '">' + points[item.index].year + '</text>';
  }).join("");

  root.innerHTML = '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Annual monsoon rainfall and Theil-Sen trend">' +
    '<title>Annual June to September rainfall in millimetres</title>' + grid +
    '<path class="trend-line" d="' + trendPath + '"></path>' +
    '<path class="rain-line" d="' + path + '"></path>' + selectedPoints + xLabels +
    '</svg>';
}

function downloadCsv() {
  const rows = [["location", "region", "latitude", "longitude", "year", "monsoon_rainfall_mm", "data_source"]];
  LOCATIONS.forEach(function (location) {
    const result = resultsById[location.id];
    if (!result) return;
    result.seasons.forEach(function (point) {
      rows.push([location.name, location.region, location.lat, location.lon, point.year, point.rainfall.toFixed(2), "NASA POWER PRECTOTCORR / MERRA-2"]);
    });
  });
  const csv = rows.map(function (row) {
    return row.map(function (value) { return '"' + String(value).replace(/"/g, '""') + '"'; }).join(",");
  }).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "astrovanta-monsoon-rainfall-1981-2025.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function formatNumber(value, digits) {
  return Number(value).toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function signed(value, digits) {
  const formatted = formatNumber(Math.abs(value), digits);
  return (value > 0 ? "+" : value < 0 ? "−" : "") + formatted;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function (character) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
  });
}
