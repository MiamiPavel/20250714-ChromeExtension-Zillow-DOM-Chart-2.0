function downloadCSVWithAPI(data, filename = "data.csv") {
  const csvContent = formatArray(data);

  // Create data URL instead of blob URL
  const dataUrl =
    "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);

  chrome.downloads.download(
    {
      url: dataUrl,
      filename: filename,
      saveAs: false,
    },
    (downloadId) => {
      console.log("Download started:", downloadId);
    }
  );
}

function formatArray(array) {
  if (!Array.isArray(array) || array.length === 0) return "";
  
  const prioritizedKeys = [
    "address.streetAddress",
    "address.city", 
    "address.state",
    "address.zipcode",
    "attributionInfo.mlsId",
    "imgSrc",
  ];
  
  function flatten(obj, prefix = "", out = {}) {
    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      if (key === "priceHistory" || (key.toLowerCase().includes("photos") && key !== "primaryPhoto")) continue;
      const value = obj[key];
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        flatten(value, fullKey, out);
      } else if (Array.isArray(value)) {
        if (value.length === 0) {
          out[fullKey] = "";
        } else if (typeof value[0] !== "object") {
          out[fullKey] = value.join("; ");
        } else {
          out[fullKey] = JSON.stringify(value);
        }
      } else {
        out[fullKey] = value == null ? "" : value;
      }
    }
    return out;
  }
  
  // Process price history to keep only events after latest "Listed for sale"
  function filterPriceHistory(priceHistory) {
    if (!Array.isArray(priceHistory)) return [];
    
    // Sort by time
    const sorted = priceHistory.slice().sort((a, b) => {
      if (!a.time || !b.time) return 0;
      return new Date(a.time) - new Date(b.time);
    });
    
    // Find latest "Listed for sale" index
    let latestListedIndex = -1;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].event && sorted[i].event.toLowerCase().includes("listed for sale")) {
        latestListedIndex = i;
        break;
      }
    }
    
    // Return events from latest listing onwards, or all if no listing found
    return latestListedIndex >= 0 ? sorted.slice(latestListedIndex) : sorted;
  }
  
  // Collect all flat keys and max priceHistory length
  let allKeysSet = new Set();
  let maxPriceHistory = 0;
  for (const item of array) {
    let itemToFlatten = item;
    // Polyfill imgSrc if missing but photos exist
    if (!item.imgSrc && item.photos && Array.isArray(item.photos) && item.photos.length > 0) {
        itemToFlatten = { ...item, imgSrc: item.photos[0] };
    } else if (!item.imgSrc && item.primaryPhoto) {
        itemToFlatten = { ...item, imgSrc: item.primaryPhoto };
    }

    const flat = flatten(itemToFlatten);
    Object.keys(flat).forEach(k => allKeysSet.add(k));
    const filteredHistory = filterPriceHistory(item.priceHistory);
    maxPriceHistory = Math.max(maxPriceHistory, filteredHistory.length);
  }
  
  prioritizedKeys.forEach(k => allKeysSet.delete(k));
  const allKeys = Array.from(allKeysSet).sort();
  
  let priceHistoryHeaders = [];
  for (let i = 0; i < maxPriceHistory; i++) {
    priceHistoryHeaders.push(`Date${i + 1}`, `Event${i + 1}`, `Price${i + 1}`);
  }
  
  const headerRow = [
    ...prioritizedKeys.filter(k => array.some(item => flatten(item)[k] !== undefined)),
    ...allKeys,
    ...priceHistoryHeaders
  ];
  
  function esc(val) {
    if (val == null) return "";
    val = String(val);
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return '"' + val.replace(/"/g, '""') + '"';
    }
    return val;
  }
  
  const rows = array.map(item => {
    let itemToFlatten = item;
    // Polyfill imgSrc if missing but photos exist
    if (!item.imgSrc && item.photos && Array.isArray(item.photos) && item.photos.length > 0) {
        itemToFlatten = { ...item, imgSrc: item.photos[0] };
    } else if (!item.imgSrc && item.primaryPhoto) {
        itemToFlatten = { ...item, imgSrc: item.primaryPhoto };
    }

    const flat = flatten(itemToFlatten);
    const rowVals = [];
    
    for (const key of [...prioritizedKeys.filter(k => headerRow.includes(k)), ...allKeys]) {
      rowVals.push(esc(flat[key]));
    }
    
    const filteredHistory = filterPriceHistory(item.priceHistory);
    for (let i = 0; i < maxPriceHistory; i++) {
      const entry = filteredHistory[i];
      if (entry) {
        let date = "";
        if (entry.time) {
          const d = new Date(entry.time);
          if (!isNaN(d)) date = d.toISOString().slice(0, 10);
        }
        rowVals.push(esc(date), esc(entry.event ?? ""), esc(entry.price ?? ""));
      } else {
        rowVals.push("", "", "");
      }
    }
    
    return rowVals.join(",");
  });
  
  return [headerRow.join(","), ...rows].join("\n");
 }

// Helper function to convert array of objects to CSV
function arrayToCSV(data) {
  if (!data.length) return "";

  // Get headers from first object
  const headers = Object.keys(data[0]);

  // Create CSV content
  const csvRows = [
    headers.join(","), // Header row
    ...data.map((row) =>
      headers
        .map((header) => {
          let value = row[header] ?? "";
          // Escape quotes and wrap in quotes if contains comma, quote, or newline
          if (
            typeof value === "string" &&
            (value.includes(",") || value.includes('"') || value.includes("\n"))
          ) {
            value = '"' + value.replace(/"/g, '""') + '"';
          }
          return value;
        })
        .join(",")
    ),
  ];

  return csvRows.join("\n");
}
