// Parses CSV with columns ...Date1,Event1,Price1,Date2,Event2,Price2,... at the end of each row
// Returns [{ priceHistory: [{date, event, price, dom}, ...] }, ...]
let isForSale = false;
function parsePriceHistoryCSV(csvText) {
  // Use PapaParse for robust CSV parsing
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  if (!parsed.data || !parsed.data.length) return [];

  const result = [];
  let countForSale = 0;
  for (const row of parsed.data) {
    const priceHistory = [];
    const livingAreaValue = (row["livingAreaValue"] || "").trim();
    const detailUrl = (row["addressOrUrlFromInput"] || "").trim();
    const status = (row["homeStatus"] || "").trim();
    const stAddress = (row["address.streetAddress"] || ""); 
    const city = (row["address.city"] || ""); 
    const state = (row["address.state"] || ""); 
    const address = `(${stAddress}, ${city}, ${state})`; 
    const imgSrc = (row["imgSrc"] || "").trim();
    if (status.toLowerCase().includes("for_sale")) countForSale++;
    const livingAreaSqFt =
      livingAreaValue && !isNaN(Number(livingAreaValue))
        ? Number(livingAreaValue)
        : null;
    for (let n = 1; ; n++) {
      const dateKey = `Date${n}`;
      const eventKey = `Event${n}`;
      const priceKey = `Price${n}`;
      if (!(dateKey in row) && !(priceKey in row)) break;
      const date = (row[dateKey] || "").trim();
      const event = (row[eventKey] || "").trim();
      let price = (row[priceKey] || "").trim();
      if (date && !isNaN(Date.parse(date))) {
        if (price && !isNaN(Number(price))) {
          price = Number(price);
        } else {
          price = null;
        }
        priceHistory.push({
          date,
          event: event || null,
          price,
          livingAreaSqFt,
          detailUrl,
          address,
          imgSrc
        });
      }
    }
    // Sort by date ascending
    priceHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
    // Fill null prices with previous value (after sorting)
    let lastPrice = null;

    const priceHistoryFiltered = priceHistory.filter(
      (entry) => !(entry.event?.toLowerCase().includes('rent') || (entry.price <= 100000 && !['sale', 'sold'].some(kw => entry.event?.toLowerCase().includes(kw))))
    );
    for (const p of priceHistoryFiltered) { 
      if (p.price != null && !isNaN(p.price)) {
        lastPrice = p.price;
      } else if (lastPrice != null) {
        p.price = lastPrice;
      }
    }
    // Compute Days on Market (DOM)
    if (priceHistoryFiltered.length) {
      const firstDate = new Date(priceHistoryFiltered[0].date);
      const lastDate = new Date(priceHistoryFiltered[priceHistoryFiltered.length - 1].date);
      
      priceHistoryFiltered.forEach((p) => {
        if (status.toLowerCase().includes("for_sale")) {
          p.dom = Math.round(
            (new Date() - new Date(p.date)) / (1000 * 60 * 60 * 24)
          );
        } else {
          // For sold, calculate days relative to the sale date (last date)
          // This makes the sale date 0, and previous dates positive
          p.dom = Math.round(
            (lastDate - new Date(p.date)) / (1000 * 60 * 60 * 24)
          );
        }
      });
      result.push({ priceHistory: priceHistoryFiltered });
    }
  }

  if (countForSale >= (parsed.data.length / 2)) isForSale = true; 
  else isForSale = false;

  // Filter properties when isForSale is true
  let filteredResult = result;
  if (isForSale) {
    // Remove "Listing Removed" events from all properties before filtering
    for (const property of result) {
      if (property.priceHistory) {
        property.priceHistory = property.priceHistory.filter(
          e => !e.event || !e.event.toLowerCase().includes('listing removed')
        );
      }
    }

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    filteredResult = result.filter(property => {
      const priceHistory = property.priceHistory;
      if (!priceHistory.length) return false;
      
      // Check if last entry is "Sold"
      const lastEntry = priceHistory[priceHistory.length - 1];
      if (lastEntry.event && lastEntry.event.toLowerCase().includes("sold")) {
        return false;
      }
      
      // Check if there's no price change in the last year
      const recentEntries = priceHistory.filter(entry => 
        new Date(entry.date) >= oneYearAgo
      );
      
      if (recentEntries.length <= 1) {
        return false; // No changes in the last year
      }
      
      // Check if all recent entries have the same price
      const recentPrices = recentEntries.map(entry => entry.price).filter(price => price != null);
      const uniqueRecentPrices = [...new Set(recentPrices)];
      
      if (uniqueRecentPrices.length <= 1) {
        return false; // No price changes in the last year
      }
      
      return true;
    });
  } else {
    // Filter for Sold properties: keep only data after the previous sale
    for (const property of result) {
      const history = property.priceHistory;
      const soldIndices = [];
      for (let i = 0; i < history.length; i++) {
        if (history[i].event && history[i].event.toLowerCase().includes('sold')) {
          soldIndices.push(i);
        }
      }
      
      if (soldIndices.length >= 2) {
        const previousSaleIndex = soldIndices[soldIndices.length - 2];
        property.priceHistory = history.slice(previousSaleIndex + 1);
        
        // Re-calculate DOM for the new history
        if (property.priceHistory.length > 0) {
           const lastDate = new Date(property.priceHistory[property.priceHistory.length - 1].date);
           property.priceHistory.forEach(p => {
               p.dom = Math.round((lastDate - new Date(p.date)) / (1000 * 60 * 60 * 24));
           });
        }
      }
    }
  }

  const allSoldEntries = [];
  const allDaysOnMarket = [];

  for (const property of filteredResult) {
    for (const entry of property.priceHistory) {
      if (
        entry.event &&
        entry.event.toLowerCase().includes("sold") &&
        entry.price
      ) {
        allSoldEntries.push({
          price: entry.price,
          dom: entry.dom,
          psf: entry.livingAreaSqFt ? entry.price / entry.livingAreaSqFt : null,
        });
      }
    }

    // Add final DOM for each property
    if (property.priceHistory.length > 0) {
      const lastEntry = property.priceHistory[property.priceHistory.length - 1];
      allDaysOnMarket.push(lastEntry.dom);
    }
  }

  function getMedian(arr) {
    const sorted = arr.filter((x) => x != null).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  const metrics = {
    medianDaysOnMarket: getMedian(allDaysOnMarket),
    medianSalePrice: getMedian(allSoldEntries.map((e) => e.price)),
    medianPSF: getMedian(allSoldEntries.map((e) => e.psf)),
  };
  // Remove previous metrics if they exist
  const existingMetrics = document.getElementById("metricsContainer");
  if (existingMetrics) {
    existingMetrics.remove();
  }

  // Render market metrics with improved styling
  const metricsContainer = document.createElement("div");
  metricsContainer.innerHTML = `
    <div style="
      display: flex; 
      justify-content: space-around; 
      margin-top: 2rem; 
      padding: 1.5rem;
      background: linear-gradient(135deg, #f6f9fc 0%, #e9f2ff 100%);
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    ">
      <h3 style="
        font-size: 1.25rem; 
        color: #1e293b; 
        margin-bottom: 0.5rem;
        font-weight: 600;
        letter-spacing: -0.02em;
      ">Market Metrics</h3>
    </div>
    <div style="
      display: flex; 
      justify-content: space-around; 
      flex-wrap: wrap;
      gap: 1.5rem;
      margin-top: -0.5rem;
      padding: 0 1.5rem 1.5rem 1.5rem;
      background: linear-gradient(135deg, #f6f9fc 0%, #e9f2ff 100%);
      border-radius: 0 0 12px 12px;
    ">
      <div style="
        text-align: center;
        background: white;
        padding: 1.5rem 2rem;
        border-radius: 8px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
        min-width: 150px;
        transition: transform 0.2s;
      " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
        <div style="color: #64748b; font-size: 0.875rem; margin-bottom: 0.5rem; font-weight: 500;">
          Median Days on Market
        </div>
        <div style="font-size: 2rem; font-weight: 700; color: #2563eb;">
          ${Math.round(metrics.medianDaysOnMarket) || 'N/A'}
        </div>
      </div>
      <div style="
        text-align: center;
        background: white;
        padding: 1.5rem 2rem;
        border-radius: 8px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
        min-width: 150px;
        transition: transform 0.2s;
      " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
        <div style="color: #64748b; font-size: 0.875rem; margin-bottom: 0.5rem; font-weight: 500;">
          Median Sale Price
        </div>
        <div style="font-size: 2rem; font-weight: 700; color: #16a34a;">
          ${metrics.medianSalePrice ? '$' + metrics.medianSalePrice.toLocaleString() : '$0'}
        </div>
      </div>
      <div style="
        text-align: center;
        background: white;
        padding: 1.5rem 2rem;
        border-radius: 8px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
        min-width: 150px;
        transition: transform 0.2s;
      " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
        <div style="color: #64748b; font-size: 0.875rem; margin-bottom: 0.5rem; font-weight: 500;">
          Median Price/SqFt
        </div>
        <div style="font-size: 2rem; font-weight: 700; color: #9333ea;">
          ${metrics.medianPSF ? '$' + metrics.medianPSF.toFixed(0) : '$0'}
        </div>
      </div>
    </div>
  `;

  // Insert after chartContainer
  const chartContainer = document.getElementById("chartContainer");
  chartContainer.parentNode.insertBefore(
    metricsContainer,
    chartContainer.nextSibling
  );
  // Add the missing ID to the metrics container
  metricsContainer.id = "metricsContainer";
  return filteredResult;
}
function getEventColor(event) {
  if (!event || event.toLowerCase().includes("listed")) return "#2563eb"; // Blue for listed
  if (event.toLowerCase().includes("pending")) return "#f59e0b"; // Amber for pending
  if (event.toLowerCase().includes("sold")) return "#10b981"; // Green for sold
  return "#6b7280"; // Gray for unknown
}

function renderPriceChart(properties) {
  if (!properties.length) return null;
  const header = document.querySelector('#chartCard header'); 
  header.textContent = isForSale ? "Price History Chart (for sale)" : "Price History Chart";
  
  // Add zoom controls to the chart container
  const chartContainer = document.getElementById("chartContainer");
  let zoomControls = document.querySelector('.zoom-controls');
  if (!zoomControls) {
    zoomControls = document.createElement('div');
    zoomControls.className = 'zoom-controls';
    zoomControls.innerHTML = `
      <button class="zoom-btn" id="zoomInBtn" title="Zoom In">🔍+</button>
      <button class="zoom-btn" id="zoomOutBtn" title="Zoom Out">🔍-</button>
      <button class="zoom-btn" id="resetZoomBtn" title="Reset Zoom">⟲ Reset</button>
    `;
    chartContainer.appendChild(zoomControls);
  }
  
  const ctx = document.getElementById("priceChart").getContext("2d");
  // Set canvas height to 750px via element.style
  const priceChartCanvas = document.getElementById("priceChart");
  priceChartCanvas.style.height = '750px';

  // Destroy previous chart instance if it exists
  if (window._chartInstance) {
    window._chartInstance.destroy();
    window._chartInstance = null;
  }

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
  
  // Color palette for multiple properties
  const colorPalette = [
    '#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c',
    '#0891b2', '#be123c', '#4f46e5', '#059669', '#7c2d12'
  ];
  
  const datasets = properties.map((property, i) => {
    const data = property.priceHistory
      .filter((p) => p.price !== null)
      .map((p) => ({
        x: p.dom,
        y: p.price,
        event: p.event,
        date: p.date,
        psf: p.price / p.livingAreaSqFt,
        url: p.detailUrl,
        address: p.address,
        imgSrc: p.imgSrc
      }));

    // For 'For Sale' charts, all lines gray, else use palette
    const baseColor = isForSale ? '#6b7280' : colorPalette[i % colorPalette.length];
    // For hover, blue for For Sale, else palette hover
    const hoverColor = isForSale ? '#2563eb' : adjustColorBrightness(baseColor, -20);
    const pointColors = data.map((p) => isForSale ? '#6b7280' : getEventColor(p.event));

    // Store segment logic
    const segmentBorderColorFn = (ctx) => baseColor;

    return {
      label: `Property ${i + 1}`,
      data,
      borderColor: baseColor,
      originalBorderColor: baseColor,
      hoverColor: hoverColor,
      backgroundColor: hexToRgba(baseColor, 0.1),
      fill: false,
      pointRadius: 5,
      pointHoverRadius: 7,
      pointBackgroundColor: pointColors,
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointHoverBorderWidth: 3,
      tension: 0.1, // Slight curve for smoother lines
      borderWidth: 4,
      hoverBorderWidth: 8, // 2x thickness for hover
      segment: {
        borderColor: segmentBorderColorFn
      },
      _originalSegmentBorderColor: segmentBorderColorFn
    };
  });
  Chart.register(ChartDataLabels);
  const highlightLineOnHoverPlugin = {
    id: 'highlightLineOnHover',
    beforeInit(chart) {
      chart._hoveredDatasetIndex = null;
    },
    afterEvent(chart, args) {
      const { event } = args;
  
      const datasetIndex = chart.getElementsAtEventForMode(
        event, 'dataset', { intersect: true }, true
      )?.[0]?.datasetIndex ?? null;
  
      if (chart._hoveredDatasetIndex === datasetIndex) return;
  
      chart._hoveredDatasetIndex = datasetIndex;
  
      chart.data.datasets.forEach((ds, i) => {
        if (i === datasetIndex) {
          ds.borderColor = ds.hoverColor;
          ds.segment.borderColor = () => ds.hoverColor; // solid color on hover
          if (isForSale) ds.borderWidth = ds.hoverBorderWidth;
        } else {
          ds.borderColor = ds.originalBorderColor;
          ds.segment.borderColor = ds._originalSegmentBorderColor; // restore original segment color
          if (isForSale) ds.borderWidth = 4;
        }
      });
  
      chart.update('none');
    }
  };
  
  const chart = new Chart(ctx, {
    type: "line",
    data: { datasets },
    plugins: [ChartDataLabels, highlightLineOnHoverPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 750,
        easing: 'easeInOutQuart'
      },
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const element = elements[0];
          const dataPoint = element.element.$context.dataset.data[element.index];
          window.open(dataPoint.url, "_blank");
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          mode: "nearest",
          intersect: true,
          external: function(context) {
              // Tooltip Element
              let tooltipEl = document.getElementById('chartjs-tooltip');

              // Create element on first render
              if (!tooltipEl) {
                  tooltipEl = document.createElement('div');
                  tooltipEl.id = 'chartjs-tooltip';
                  document.body.appendChild(tooltipEl);
              }

              // Hide if no tooltip
              const tooltipModel = context.tooltip;
              if (tooltipModel.opacity === 0) {
                  tooltipEl.style.opacity = 0;
                  return;
              }

              // Set Text
              if (tooltipModel.body) {
                  const dataPoints = tooltipModel.dataPoints;
                  const dataPoint = dataPoints[0];
                  const raw = dataPoint.raw;
                  
                  let innerHtml = '';

                  // Image
                  if (raw.imgSrc) {
                      innerHtml += `<img src="${raw.imgSrc}" alt="Property Image" />`;
                  }

                  // Details table
                  innerHtml += '<table>';
                  
                  if (raw.address) innerHtml += `<tr class="tooltip-row"><td class="tooltip-label">Address:</td><td class="tooltip-value">${raw.address}</td></tr>`;
                  if (raw.date) innerHtml += `<tr class="tooltip-row"><td class="tooltip-label">Date:</td><td class="tooltip-value">${raw.date}</td></tr>`;
                  if (raw.event) innerHtml += `<tr class="tooltip-row"><td class="tooltip-label">Event:</td><td class="tooltip-value">${raw.event}</td></tr>`;
                  if (raw.y != null) innerHtml += `<tr class="tooltip-row"><td class="tooltip-label">Price:</td><td class="tooltip-value">$${raw.y.toLocaleString()}</td></tr>`;
                  if (raw.psf != null) innerHtml += `<tr class="tooltip-row"><td class="tooltip-label">PSF:</td><td class="tooltip-value">$${raw.psf.toFixed(2)}</td></tr>`;
                  
                  innerHtml += '</table>';

                  tooltipEl.innerHTML = innerHtml;
              }

              const position = context.chart.canvas.getBoundingClientRect();
              
              // Display, position, and set styles for font
              tooltipEl.style.opacity = 1;
              tooltipEl.style.position = 'absolute';
              tooltipEl.style.left = position.left + window.pageXOffset + tooltipModel.caretX + 'px';
              tooltipEl.style.top = position.top + window.pageYOffset + tooltipModel.caretY + 'px';
              // Shift up to appear above the point by default, or use yAlign logic
              // Simple shift to prevent covering the point
              tooltipEl.style.transform = 'translate(-50%, -100%) translateY(-10px)';
              
              tooltipEl.style.pointerEvents = 'none';
          }
        },
        annotation: { enabled: false },
        zoom: {
          pan: {
            enabled: true,
            mode: "xy",
            // No modifier key, always pan on drag
          },
          zoom: {
            wheel: { 
              enabled: true,
              speed: 0.1
            },
            pinch: { enabled: true },
            mode: "xy",
            drag: {
              enabled: false
            },
          },
          limits: {
            y: { min: 0, max: 'original' },
            x: { min: 'original', max: 'original' },
          },
        },
        datalabels: {
          display: (context) =>
            context.dataset.data[context.dataIndex].event?.toLowerCase().includes("sold")
              ? "auto"
              : false,
          align: "top",
          anchor: "end",
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          borderColor: '#10b981',
          borderRadius: 6,
          borderWidth: 2,
          color: "#333",
          font: { weight: "bold", size: 11 },
          padding: 6,
          formatter: function (value, context) {
            const dataPoint = context.dataset.data[context.dataIndex];
            return [`$${dataPoint.y.toLocaleString()}`, `DOM: ${dataPoint.x}`, `PSF: $${dataPoint.psf.toFixed(0)}`];
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          title: { 
            display: true, 
            text: "Days on Market",
            font: {
              size: 14,
              weight: '500'
            },
            color: '#374151'
          },
          grid: { 
            color: 'rgba(0, 0, 0, 0.05)',
            drawBorder: false,
          },
          ticks: { 
            color: "#6b7280",
            padding: 8,
            font: {
              size: 12
            },
            stepSize: 30
          },
          reverse: true,
          max: isForSale ? 365 : undefined,
        },
        y: {
          title: { 
            display: true, 
            text: "Price (USD)",
            font: {
              size: 14,
              weight: '500'
            },
            color: '#374151'
          },
          grid: { 
            color: 'rgba(0, 0, 0, 0.05)',
            drawBorder: false,
          },
          ticks: { 
            color: "#6b7280",
            padding: 8,
            font: {
              size: 12
            },
            callback: function(value) {
              return '$' + value.toLocaleString();
            }
          },
          position: "right",
        },
      },
      layout: { padding: { top: 40, right: 20, bottom: 20, left: 20 } },
      backgroundColor: "#fff",
      hover: {
        mode: 'dataset',
        intersect: true
      }
    },
  });
  
  // Store chart instance globally
  window._chartInstance = chart;
  
  // Setup zoom control buttons
  document.getElementById('zoomInBtn')?.addEventListener('click', () => {
    chart.zoom(1.1);
  });
  
  document.getElementById('zoomOutBtn')?.addEventListener('click', () => {
    chart.zoom(0.9);
  });
  
  document.getElementById('resetZoomBtn')?.addEventListener('click', () => {
    chart.resetZoom();
  });
  
  // Add keyboard shortcuts for zoom
  document.addEventListener('keydown', (e) => {
    if (!chart) return;
    
    // Ctrl/Cmd + Plus for zoom in
    if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
      e.preventDefault();
      chart.zoom(1.1);
    }
    // Ctrl/Cmd + Minus for zoom out
    else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
      e.preventDefault();
      chart.zoom(0.9);
    }
    // Ctrl/Cmd + 0 for reset zoom
    else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
      e.preventDefault();
      chart.resetZoom();
    }
  });
  
  return chart;
}

// Helper functions for color manipulation
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function adjustColorBrightness(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 + 
    (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 + 
    (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
}

window.parsePriceHistoryCSV = parsePriceHistoryCSV;
window.renderPriceChart = renderPriceChart;

window.addEventListener('DOMContentLoaded', () => {
  const minDaysInput = document.getElementById('minDaysInput');
  const maxDaysInput = document.getElementById('maxDaysInput');
  const minPriceCutsInput = document.getElementById('minPriceCutsInput');
  const minDeclineInput = document.getElementById('minDeclineInput');
  const clearFiltersBtn = document.getElementById('clearFiltersBtn');
  
  // Holds the original, full dataset parsed from the CSV
  let originalData = null;
  
  // Make originalData accessible globally if needed
  window.originalData = null;
 
  function applyFiltersAndRender(rawData) {
    if (!rawData) return;
    
    let filtered = rawData;
    const minDays = parseInt(minDaysInput.value, 10) || 0;
    const maxDays = parseInt(maxDaysInput.value, 10) || 0;
    const minPriceCuts = parseInt(minPriceCutsInput.value, 10) || 0;
    const minDecline = parseFloat(minDeclineInput.value) || 0;
    
    if (minDays > 0) {
      filtered = filtered.filter(p => {
        // Use the maximum dom value in the priceHistory array
        const maxDom = Math.max(...p.priceHistory.map(ph => ph.dom || 0));
        return maxDom >= minDays;
      });
    }
    
    if (maxDays > 0) {
      filtered = filtered.filter(p => {
        // Use the maximum dom value in the priceHistory array
        const maxDom = Math.max(...p.priceHistory.map(ph => ph.dom || 0));
        return maxDom <= maxDays;
      });
    }

    if (minPriceCuts > 0 && isForSale) {
      filtered = filtered.filter(p => {
        const hist = p.priceHistory;
        if (hist.length < 2) return false;
        let cuts = 0;
        // Count how many times price decreased compared to the previous event
        // Note: hist is sorted by date ascending (oldest to newest)
        for (let i = 1; i < hist.length; i++) {
          const prevPrice = hist[i - 1].price;
          const currPrice = hist[i].price;
          if (prevPrice != null && currPrice != null && currPrice < prevPrice) {
            cuts++;
          }
        }
        return cuts >= minPriceCuts;
      });
    }

    if (minDecline > 0) {
      filtered = filtered.filter(p => {
        const hist = p.priceHistory;
        if (hist.length < 2) return false;
        const first = hist[0].price;
        const last = hist[hist.length - 1].price;
        if (first == null || last == null || first === 0) return false;
        const decline = ((first - last) / first) * 100;
        return decline >= minDecline;
      });
    }
    // Update the results count
    const countSpan = document.getElementById('filterResultsCount');
    if (countSpan) countSpan.textContent = `${filtered.length} result${filtered.length === 1 ? '' : 's'} after filters`;
    if (window._chartInstance) {
      window._chartInstance.destroy();
      window._chartInstance = null;
    }
    window._chartInstance = window.renderPriceChart(filtered);
  }

  // Export as HTML — produces a single self-contained file (no zip, no eval, no CDN deps).
  // The previous implementation depended on JSZip loaded via eval() from a CDN, which
  // MV3's default CSP blocks (script-src 'self'). The replacement inlines every asset.
  const exportBtn = document.getElementById('exportHtmlBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      const csv = window.uploadedFileContent;
      if (!csv) {
        alert('Please upload a CSV file before exporting.');
        return;
      }
      const originalLabel = exportBtn.textContent;
      try {
        exportBtn.disabled = true;
        exportBtn.textContent = 'Exporting…';
        const html = await generateSelfContainedChartHtml(csv);
        triggerHtmlDownload(html, timestampFilename('chart', 'html'));
      } catch (err) {
        alert('Export failed: ' + (err && err.message ? err.message : err));
      } finally {
        exportBtn.disabled = false;
        exportBtn.textContent = originalLabel;
      }
    });
  }

  // Publish to GitHub Pages — commits the same self-contained HTML to a configured repo.
  // After the first successful publish the settings (PAT, owner, repo, branch, prefix)
  // are cached in chrome.storage.local. Subsequent clicks skip the modal entirely and
  // publish in one click. Shift+click forces the modal open if you need to change settings.
  const publishBtn = document.getElementById('publishGhPagesBtn');
  if (publishBtn) {
    publishBtn.addEventListener('click', async (e) => {
      const csv = window.uploadedFileContent;
      if (!csv) {
        alert('Please upload a CSV file before publishing.');
        return;
      }
      const cfg = await loadGhConfig();
      const forceModal = e.shiftKey;
      const isConfigured = !!(cfg && cfg.ghToken && cfg.ghOwner && cfg.ghRepo);

      if (isConfigured && !forceModal) {
        // One-click publish path: use cached settings, auto-generate filename, no modal.
        const oldLabel = publishBtn.textContent;
        try {
          publishBtn.disabled = true;
          publishBtn.textContent = 'Publishing…';
          const html = await generateSelfContainedChartHtml(csv);
          const result = await publishHtmlToGitHubPages({
            token: cfg.ghToken,
            owner: cfg.ghOwner,
            repo: cfg.ghRepo,
            branch: cfg.ghBranch || 'main',
            pathPrefix: cfg.ghPathPrefix || 'charts',
            filename: timestampFilename('chart', 'html'),
            html
          });
          openGhResultModal(result);
        } catch (err) {
          alert(
            'Publish failed: ' + (err && err.message ? err.message : err) +
            '\n\nShift+click the Publish button to re-open the settings modal.'
          );
        } finally {
          publishBtn.disabled = false;
          publishBtn.textContent = oldLabel;
        }
        return;
      }

      openGhSettingsModal({
        initial: cfg,
        onSubmit: async (values, setStatus, closeModal) => {
          setStatus('Generating chart HTML…');
          const html = await generateSelfContainedChartHtml(csv);
          setStatus('Publishing to GitHub…');
          // Publish first; only persist settings after GitHub accepts the PUT,
          // so a bad PAT/owner/repo doesn't get cached and re-tried.
          const result = await publishHtmlToGitHubPages({
            token: values.ghToken,
            owner: values.ghOwner,
            repo: values.ghRepo,
            branch: values.ghBranch,
            pathPrefix: values.ghPathPrefix,
            filename: values.filename,
            html
          });
          await saveGhConfig({
            ghToken: values.ghToken,
            ghOwner: values.ghOwner,
            ghRepo: values.ghRepo,
            ghBranch: values.ghBranch,
            ghPathPrefix: values.ghPathPrefix
          });
          setStatus('Published.', 'success');
          closeModal();
          openGhResultModal(result);
        }
      });
    });
  }

  // Patch: track uploadedFileContent globally
  window.uploadedFileContent = null;
  const origLoadFileContent = window.loadFileContent;
  window.loadFileContent = function(uploadedFileContent) {
    window.uploadedFileContent = uploadedFileContent;
    const result = origLoadFileContent(uploadedFileContent);
    // Store the parsed data as originalData
    if (result) {
      window.originalData = result;
      originalData = result;
      // Note: We do NOT add listeners here anymore to avoid duplicates
    }
    return result;
  };

  minDaysInput.addEventListener('input', () => {
    if (originalData) applyFiltersAndRender(originalData);
  });
  maxDaysInput.addEventListener('input', () => {
    if (originalData) applyFiltersAndRender(originalData);
  });
  minPriceCutsInput.addEventListener('input', () => {
    if (originalData) applyFiltersAndRender(originalData);
  });
  minDeclineInput.addEventListener('input', () => {
    if (originalData) applyFiltersAndRender(originalData);
  });
  
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
      minDaysInput.value = 0;
      maxDaysInput.value = 0;
      minPriceCutsInput.value = 0;
      minDeclineInput.value = 0;
      if (originalData) applyFiltersAndRender(originalData);
    });
  }
});

// ============================================================
// Self-contained HTML export + GitHub Pages publish
// ============================================================
// Top-level helpers (hoisted via function declarations / const at script
// scope). They're called from the DOMContentLoaded handler above and are
// shipped inline in the exported HTML, where they'll run again standalone.

const EXPORT_ASSETS = [
  { key: 'css',         path: 'chart.css' },
  { key: 'chartLib',    path: 'lib/chart.umd.lib.js' },
  { key: 'hammer',      path: 'lib/hammer.min.js' },
  { key: 'adapter',     path: 'lib/chartjs-adapter-date-fns.bundle.min.js' },
  { key: 'datalabels',  path: 'lib/chartjs-plugin-datalabels.min.js' },
  { key: 'zoom',        path: 'lib/chartjs-plugin-zoom.min.js' },
  { key: 'papaparse',   path: 'lib/papaparse.min.js' },
  { key: 'chartApp',    path: 'chart.js' },
  { key: 'chartUpload', path: 'chart-upload.js' }
];

async function fetchTextRelative(path) {
  // In the extension, resolve via chrome.runtime.getURL so we don't depend on
  // the page's current location. In standalone mode, fall back to a relative
  // fetch (though export/publish buttons are hidden there anyway).
  const url = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
    ? chrome.runtime.getURL(path)
    : path;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Failed to fetch ' + path + ': ' + resp.status);
  return await resp.text();
}

function escapeForScriptTag(js) {
  // Stops a premature </script> inside an inlined script body from closing the tag.
  return js.replace(/<\/(script)/gi, '<\\/$1');
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function generateSelfContainedChartHtml(csvText) {
  if (!csvText) throw new Error('No CSV data to export.');
  const fetched = await Promise.all(
    EXPORT_ASSETS.map(async (asset) => ({ key: asset.key, body: await fetchTextRelative(asset.path) }))
  );
  const get = (key) => {
    const a = fetched.find((x) => x.key === key);
    if (!a) throw new Error('Missing asset: ' + key);
    return a.body;
  };
  // JSON.stringify alone does not escape </script>. Without escapeForScriptTag,
  // a CSV cell containing the literal "</script>" would close the inline script
  // and break the export (and could inject HTML).
  const safeCsv = escapeForScriptTag(JSON.stringify(csvText));
  const generatedAt = new Date().toISOString();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Price History Chart</title>
  <meta name="generated-at" content="${escapeHtml(generatedAt)}">
  <style>
${get('css')}
  </style>
</head>
<body>
  <div id="chartPageWrapper">
    <div id="chartCard">
      <div id="headerSection">
        <header style="color: #222;">Price History Chart</header>
        <!-- Hidden upload UI: kept in the DOM so chart-upload.js can wire its
             listeners without null-derefs at script load. Data is provided via
             window._injectedCSV, so these controls are never shown to the
             viewer of the exported file. -->
        <div id="uploadSection" style="display:none;">
          <input type="file" id="fileUpload" accept=".csv" />
          <button id="uploadBtn"></button>
          <span id="uploadMsg"></span>
        </div>
      </div>
      <div id="filterSection" style="display: flex; gap: 1.5rem; align-items: center; margin-bottom: 1rem; flex-wrap: wrap;">
        <label for="minDaysInput">Min Days on Market:</label>
        <input type="number" id="minDaysInput" min="0" value="0" style="width: 80px; margin-right: 1.5rem;" />
        <label for="maxDaysInput">Max Days on Market:</label>
        <input type="number" id="maxDaysInput" min="0" value="0" style="width: 80px; margin-right: 1.5rem;" />
        <label for="minPriceCutsInput">Min Price Cuts:</label>
        <input type="number" id="minPriceCutsInput" min="0" value="0" style="width: 80px; margin-right: 1.5rem;" />
        <label for="minDeclineInput">Min % Decline (oldest to newest):</label>
        <input type="number" id="minDeclineInput" min="0" max="100" value="0" style="width: 80px;" />
        <button id="clearFiltersBtn" style="margin-left: 1.5rem; padding: 0.3rem 0.8rem; cursor: pointer; background-color: #f3f4f6; border: 1px solid #d1d5db; border-radius: 4px; font-size: 0.9rem;">Clear Filters</button>
        <span id="filterResultsCount" style="margin-left: 2rem; font-weight: 500;"></span>
      </div>
      <div id="chartContainer" style="display: none;">
        <canvas id="priceChart"></canvas>
      </div>
    </div>
  </div>
  <script>window._injectedCSV = ${safeCsv};</script>
  <script>${escapeForScriptTag(get('chartLib'))}</script>
  <script>${escapeForScriptTag(get('hammer'))}</script>
  <script>${escapeForScriptTag(get('adapter'))}</script>
  <script>${escapeForScriptTag(get('datalabels'))}</script>
  <script>${escapeForScriptTag(get('zoom'))}</script>
  <script>${escapeForScriptTag(get('papaparse'))}</script>
  <script>${escapeForScriptTag(get('chartApp'))}</script>
  <script>${escapeForScriptTag(get('chartUpload'))}</script>
</body>
</html>`;
}

function timestampFilename(prefix, ext) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${prefix}-${date}-${time}.${ext}`;
}

function triggerHtmlDownload(htmlString, filename) {
  const blob = new Blob([htmlString], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// ----- GitHub Pages publish -----

const GH_STORAGE_KEYS = ['ghToken', 'ghOwner', 'ghRepo', 'ghBranch', 'ghPathPrefix'];

// Persisted in chrome.storage.LOCAL (per-device) rather than sync, so the PAT
// doesn't propagate across the user's Chrome instances over Google account sync.
async function loadGhConfig() {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      resolve({});
      return;
    }
    chrome.storage.local.get(GH_STORAGE_KEYS, (items) => resolve(items || {}));
  });
}

async function saveGhConfig(cfg) {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      reject(new Error('chrome.storage unavailable in this context.'));
      return;
    }
    chrome.storage.local.set(cfg, () => {
      const err = chrome.runtime && chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

function utf8ToBase64(str) {
  // TextEncoder handles lone surrogates and malformed Unicode safely; the older
  // btoa(unescape(encodeURIComponent(...))) chain throws on those.
  const bytes = new TextEncoder().encode(str);
  // Chunked so very large CSV exports don't blow String.fromCharCode.apply's
  // argument limit (varies by engine, ~125K is broadly safe).
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function validatePathSegments(segments) {
  for (const seg of segments) {
    if (!seg) throw new Error('Path segment cannot be empty.');
    if (seg === '.' || seg === '..') throw new Error(`Path segment "${seg}" is not allowed.`);
    if (/[\x00-\x1f<>:"|?*\\]/.test(seg)) throw new Error(`Path segment "${seg}" contains forbidden characters.`);
  }
}

async function publishHtmlToGitHubPages({ token, owner, repo, branch, pathPrefix, filename, html }) {
  if (!token || !owner || !repo) throw new Error('Missing GitHub token, owner, or repo.');

  const cleanPrefix = (pathPrefix || '').replace(/^\/+|\/+$/g, '');
  const safeFilename = (filename || '').replace(/^\/+|\/+$/g, '');
  const segments = (cleanPrefix ? cleanPrefix.split('/') : []).concat(safeFilename.split('/'));
  validatePathSegments(segments);
  const path = segments.join('/');
  const encodedPath = segments.map(encodeURIComponent).join('/');
  const apiBase = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`;
  const ghBranch = branch || 'main';

  // Look up the existing SHA so we can update an existing file (PUT 422s otherwise).
  let sha = null;
  const head = await fetch(`${apiBase}?ref=${encodeURIComponent(ghBranch)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
  });
  if (head.ok) {
    const headJson = await head.json();
    sha = headJson.sha || null;
  } else if (head.status !== 404) {
    const text = await head.text();
    throw new Error(`GitHub lookup failed (${head.status}): ${text}`);
  }

  const body = {
    message: `Publish ${safeFilename}`,
    content: utf8ToBase64(html),
    branch: ghBranch
  };
  if (sha) body.sha = sha;

  const put = await fetch(apiBase, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!put.ok) {
    const text = await put.text();
    // Empty repos and missing branches return distinctive messages — surface a hint.
    if (/repository is empty|Reference does not exist|Branch \S+ not found/i.test(text)) {
      throw new Error(
        `GitHub rejected the publish (${put.status}). If this is a brand-new repo, ` +
        `add at least one commit on "${ghBranch}" (e.g. create a README) then try again. ` +
        `Raw: ${text}`
      );
    }
    throw new Error(`GitHub PUT failed (${put.status}): ${text}`);
  }
  const putJson = await put.json();

  // User/org Pages sites (repo literally named "<owner>.github.io") publish at the
  // bare root, not under /<repo>/. Detect that case to avoid handing the user a 404 URL.
  const ownerLc = owner.toLowerCase();
  const isUserSite = repo.toLowerCase() === `${ownerLc}.github.io`;
  const pagesUrl = isUserSite
    ? `https://${ownerLc}.github.io/${encodedPath}`
    : `https://${ownerLc}.github.io/${encodeURIComponent(repo)}/${encodedPath}`;
  return {
    commitUrl: putJson.commit && putJson.commit.html_url,
    fileUrl: putJson.content && putJson.content.html_url,
    pagesUrl,
    rawPath: path
  };
}

// ----- Modals (settings + result) -----

function ensureModalStyles() {
  if (document.getElementById('gh-modal-styles')) return;
  const style = document.createElement('style');
  style.id = 'gh-modal-styles';
  style.textContent = `
    .gh-modal-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,0.55); z-index: 10000; display: flex; align-items: center; justify-content: center; }
    .gh-modal { background: white; border-radius: 12px; max-width: 540px; width: calc(100% - 2rem); padding: 1.5rem; box-shadow: 0 20px 50px rgba(0,0,0,0.25); font-family: 'Segoe UI', Roboto, sans-serif; color: #0f172a; max-height: 90vh; overflow-y: auto; }
    .gh-modal h2 { margin: 0 0 0.5rem 0; font-size: 1.15rem; color: #0f172a; }
    .gh-modal .gh-hint { margin: 0 0 1rem 0; color: #475569; font-size: 0.875rem; line-height: 1.45; }
    .gh-modal .gh-hint code { background: #f1f5f9; padding: 0.05rem 0.3rem; border-radius: 3px; }
    .gh-field { display: block; margin-bottom: 0.75rem; }
    .gh-field > label { display: block; font-size: 0.82rem; color: #1e293b; margin-bottom: 0.25rem; font-weight: 500; }
    .gh-field input { width: 100%; padding: 0.45rem 0.65rem; font-size: 0.95rem; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; font-family: inherit; color: #0f172a; background: white; }
    .gh-field input:focus { outline: 2px solid rgb(0,106,255); outline-offset: -1px; }
    .gh-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
    .gh-btn { padding: 0.55rem 1.1rem; border-radius: 6px; border: none; cursor: pointer; font-size: 0.92rem; font-weight: 500; box-shadow: none; min-width: 0; margin: 0; }
    .gh-btn-primary { background: rgb(0,106,255); color: white; }
    .gh-btn-primary:disabled { background: #94a3b8; cursor: not-allowed; }
    .gh-btn-secondary { background: #f1f5f9; color: #334155; }
    .gh-status { margin-top: 0.5rem; min-height: 1.2em; font-size: 0.88rem; color: #475569; }
    .gh-status.error { color: #b91c1c; }
    .gh-status.success { color: #047857; }
    .gh-result-url { display: block; word-break: break-all; padding: 0.6rem 0.75rem; background: #f1f5f9; border-radius: 6px; font-family: monospace; font-size: 0.85rem; margin-top: 0.5rem; color: #0f172a; }
  `;
  document.head.appendChild(style);
}

function openGhSettingsModal({ initial, onSubmit, onCancel } = {}) {
  ensureModalStyles();
  const backdrop = document.createElement('div');
  backdrop.className = 'gh-modal-backdrop';
  backdrop.innerHTML = `
    <div class="gh-modal" role="dialog" aria-modal="true" aria-labelledby="gh-modal-title">
      <h2 id="gh-modal-title">Publish to GitHub Pages</h2>
      <p class="gh-hint">
        Commits a self-contained chart HTML file to your GitHub repo so anyone with the URL can view it.
        Quickest token: run <code>gh auth token</code> in a terminal and paste the result. Or mint a
        <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">fine-grained PAT</a>
        with <code>Contents: Read and write</code> on the target repo. Pages must be enabled in repo Settings &raquo; Pages.
        Settings cache in <code>chrome.storage.local</code> (per-device). After you save once, future Publish
        clicks skip this modal — Shift+click Publish to re-open it.
      </p>
      <div class="gh-field"><label for="gh-in-token">Personal access token</label><input id="gh-in-token" type="password" data-k="ghToken" autocomplete="off" placeholder="github_pat_… or ghp_…" /></div>
      <div class="gh-field"><label for="gh-in-owner">Owner (user or org)</label><input id="gh-in-owner" type="text" data-k="ghOwner" placeholder="your-github-username" /></div>
      <div class="gh-field"><label for="gh-in-repo">Repository</label><input id="gh-in-repo" type="text" data-k="ghRepo" placeholder="zillow-charts" /></div>
      <div class="gh-field"><label for="gh-in-branch">Branch</label><input id="gh-in-branch" type="text" data-k="ghBranch" placeholder="main" /></div>
      <div class="gh-field"><label for="gh-in-prefix">Path prefix (folder inside the repo)</label><input id="gh-in-prefix" type="text" data-k="ghPathPrefix" placeholder="charts" /></div>
      <div class="gh-field"><label for="gh-in-filename">Filename</label><input id="gh-in-filename" type="text" data-k="filename" /></div>
      <div class="gh-status" role="status"></div>
      <div class="gh-actions">
        <button type="button" class="gh-btn gh-btn-secondary" data-action="cancel">Cancel</button>
        <button type="button" class="gh-btn gh-btn-primary" data-action="submit">Save &amp; Publish</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const inputs = backdrop.querySelectorAll('input[data-k]');
  const defaults = Object.assign({
    ghToken: '',
    ghOwner: '',
    ghRepo: '',
    ghBranch: 'main',
    ghPathPrefix: 'charts',
    filename: timestampFilename('chart', 'html')
  }, initial || {});

  inputs.forEach((inp) => {
    const k = inp.dataset.k;
    if (defaults[k] != null) inp.value = defaults[k];
  });

  const statusEl = backdrop.querySelector('.gh-status');
  const submitBtn = backdrop.querySelector('[data-action=submit]');

  function values() {
    const out = {};
    inputs.forEach((inp) => { out[inp.dataset.k] = inp.value.trim(); });
    return out;
  }

  function setStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.className = 'gh-status' + (kind ? ' ' + kind : '');
  }

  function close() {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      close();
      if (onCancel) onCancel();
    }
  }
  document.addEventListener('keydown', onKey);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      close();
      if (onCancel) onCancel();
    }
  });

  backdrop.querySelector('[data-action=cancel]').addEventListener('click', () => {
    close();
    if (onCancel) onCancel();
  });

  submitBtn.addEventListener('click', async () => {
    const v = values();
    if (!v.ghToken || !v.ghOwner || !v.ghRepo) {
      setStatus('Token, owner, and repository are required.', 'error');
      return;
    }
    if (!v.ghBranch) v.ghBranch = 'main';
    if (!v.filename) v.filename = timestampFilename('chart', 'html');
    if (!/\.html$/i.test(v.filename)) v.filename = v.filename + '.html';
    submitBtn.disabled = true;
    try {
      await onSubmit(v, setStatus, close);
    } catch (err) {
      setStatus('Failed: ' + (err && err.message ? err.message : err), 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  return { close, setStatus };
}

function safeHttpsUrl(u) {
  if (!u) return null;
  try {
    const p = new URL(u);
    return (p.protocol === 'https:' || p.protocol === 'http:') ? u : null;
  } catch (_) {
    return null;
  }
}

async function pollUrlUntilLive(url, { timeoutMs = 120000, intervalMs = 3000, onTick } = {}) {
  // GitHub Pages takes 10-60s to build a new file after a commit. Poll the URL
  // (cache-busted) until it returns 200, so the Open button isn't enabled too early.
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    if (onTick) onTick(attempt);
    try {
      const bust = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
      const resp = await fetch(bust, { method: 'GET', cache: 'no-store', redirect: 'follow' });
      if (resp.ok) return { ok: true, attempt };
    } catch (_) {
      // Network/CORS errors — keep trying.
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { ok: false, attempt };
}

function openGhResultModal({ pagesUrl, fileUrl, commitUrl }) {
  ensureModalStyles();
  const backdrop = document.createElement('div');
  backdrop.className = 'gh-modal-backdrop';
  // Defense-in-depth: refuse non-http(s) URLs even though they come from GitHub's API.
  const safePages = escapeHtml(safeHttpsUrl(pagesUrl) || '');
  const safeFile = escapeHtml(safeHttpsUrl(fileUrl) || '');
  const safeCommit = escapeHtml(safeHttpsUrl(commitUrl) || '');
  backdrop.innerHTML = `
    <div class="gh-modal" role="dialog" aria-modal="true">
      <h2>Published</h2>
      <p class="gh-hint">The commit landed. Now waiting for GitHub Pages to build (10–60 s, first-time can be longer).</p>
      <div class="gh-field">
        <label>Public Pages URL</label>
        <code class="gh-result-url">${safePages}</code>
      </div>
      <p class="gh-hint" style="margin-top: 0.5rem;">
        ${safeFile ? `<a href="${safeFile}" target="_blank" rel="noopener">View source on GitHub</a>` : ''}
        ${safeFile && safeCommit ? ' &middot; ' : ''}
        ${safeCommit ? `<a href="${safeCommit}" target="_blank" rel="noopener">View commit</a>` : ''}
      </p>
      <div class="gh-status" data-role="poll-status">Verifying Pages…</div>
      <div class="gh-actions">
        <button type="button" class="gh-btn gh-btn-secondary" data-action="copy">Copy URL</button>
        <button type="button" class="gh-btn gh-btn-primary" data-action="open" disabled>Open page (verifying…)</button>
        <button type="button" class="gh-btn gh-btn-secondary" data-action="close">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const statusEl = backdrop.querySelector('[data-role=poll-status]');
  const openBtn = backdrop.querySelector('[data-action=open]');

  function close() { backdrop.remove(); }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelector('[data-action=close]').addEventListener('click', close);

  backdrop.querySelector('[data-action=copy]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pagesUrl);
      backdrop.querySelector('[data-action=copy]').textContent = 'Copied!';
    } catch (err) {
      alert('Copy failed: ' + (err && err.message ? err.message : err));
    }
  });

  openBtn.addEventListener('click', () => {
    if (openBtn.disabled) return;
    window.open(pagesUrl, '_blank', 'noopener');
  });

  // Kick off the poll asynchronously so the modal renders first.
  (async () => {
    const t0 = Date.now();
    const result = await pollUrlUntilLive(pagesUrl, {
      timeoutMs: 120000,
      intervalMs: 3000,
      onTick: (n) => {
        const elapsedS = Math.round((Date.now() - t0) / 1000);
        statusEl.textContent = `Waiting for Pages… ${elapsedS}s (attempt ${n})`;
      }
    });
    if (result.ok) {
      statusEl.textContent = `Live (built in ~${Math.round((Date.now() - t0) / 1000)}s).`;
      statusEl.className = 'gh-status success';
      openBtn.disabled = false;
      openBtn.textContent = 'Open page';
    } else {
      statusEl.textContent = 'Pages still not live after 2 minutes. The URL should work soon — try Open in a moment.';
      statusEl.className = 'gh-status error';
      openBtn.disabled = false;
      openBtn.textContent = 'Open page (may 404)';
    }
  })();
}
