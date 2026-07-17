// =========================================================================
// Proxy Marketing & Tech — Customer Acquisition Targeting Engine
// Demo build: real Maryland ZIP/geo data (619 ZIPs) with modeled demographic
// and channel-signal values. Business-density, WFH, and search-intent scores
// are illustrative proxies — in production these should be sourced from the
// Census Bureau County Business Patterns API, Google Ads Keyword Planner API,
// and LinkedIn Audience Counts API respectively.
// =========================================================================

let currentCenter = { lat: 39.5162, lon: -76.6150, zip: '21131' };
let currentQualifiedNodes = [];
let globalBudgets = { google: 0, meta: 0, linkedin: 0, print: 0, total: 0 };
let currentStep = 1;
let selectedVerticalKey = 'hvac_plumbing_electrical';
let selectedMode = 'b2c';
let selectedRadius = 25;
let selectedCompanySize = 'small';

// ---- Seed derived signals onto the base location data ----
MD_LOCATIONS.forEach(loc => {
  loc.wfhRate = Math.min(85, Math.max(8, Math.round((loc.income / 260000) * 80)));
  loc.bizDensity = Math.min(98, Math.max(15, Math.round((loc.households / 20000) * 55 + (loc.income > 90000 ? 20 : 5))));
  loc.searchVolumeIdx = Math.min(99, Math.max(20, Math.round((loc.households / 25000) * 60 + (loc.income / 200000) * 30)));
  loc.printViability = loc.homeOwnRate;
});

const formatCurrency = (val, decimals = 0) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: decimals }).format(val);
const formatNumber = (val) => new Intl.NumberFormat('en-US').format(Math.round(val));

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function parseNum(str) {
  return parseInt(String(str).replace(/[^0-9-]/g, '')) || 0;
}
function formatFieldNumber(val, isCurrency) {
  return isCurrency ? val.toLocaleString('en-US') : String(val);
}

// =====================================================================
// STEP NAVIGATION
// =====================================================================
function goToStep(step) {
  currentStep = step;
  document.querySelectorAll('.panel-body').forEach(p => {
    p.classList.toggle('hidden', parseInt(p.dataset.panel) !== step);
  });
  document.querySelectorAll('.step-tab').forEach(t => {
    const s = parseInt(t.dataset.step);
    t.classList.toggle('active', s === step);
    t.classList.toggle('complete', s < step);
  });
  if (step === 4) updateDashboard();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.step-tab').forEach(tab => {
  tab.addEventListener('click', () => goToStep(parseInt(tab.dataset.step)));
});
document.getElementById('to-step-2').addEventListener('click', () => goToStep(2));
document.getElementById('to-step-3').addEventListener('click', () => goToStep(3));
document.getElementById('to-step-4').addEventListener('click', () => goToStep(4));
document.querySelectorAll('[data-back]').forEach(btn => {
  btn.addEventListener('click', () => goToStep(parseInt(btn.dataset.back)));
});

// =====================================================================
// STEPPER INPUTS (numeric +/- controls)
// =====================================================================
document.querySelectorAll('.stepper button').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const step = parseInt(btn.dataset.step);
    const input = document.getElementById(targetId);
    const isCurrency = input.closest('.stepper').classList.contains('prefix-dollar');
    let val = parseNum(input.value) + step;
    if (val < 0) val = 0;
    input.value = formatFieldNumber(val, isCurrency);
    onInputsChanged();
  });
});
document.querySelectorAll('.stepper input').forEach(input => {
  input.addEventListener('blur', () => {
    const isCurrency = input.closest('.stepper').classList.contains('prefix-dollar');
    input.value = formatFieldNumber(parseNum(input.value), isCurrency);
    onInputsChanged();
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
});

// =====================================================================
// SEGMENTED CONTROLS
// =====================================================================
document.getElementById('mode-toggle').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  selectedMode = btn.dataset.mode;
  document.querySelectorAll('#mode-toggle button').forEach(b => b.classList.toggle('active', b === btn));
  document.getElementById('b2c-signals').style.display = selectedMode === 'b2c' ? '' : 'none';
  document.getElementById('b2b-signals').style.display = selectedMode === 'b2b' ? '' : 'none';
  document.getElementById('wfh-field').style.display = selectedMode === 'b2c' ? '' : 'none';
  document.getElementById('print-field').style.display = selectedMode === 'b2c' ? '' : 'none';
  onInputsChanged();
});

document.getElementById('radius-toggle').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  selectedRadius = parseInt(btn.dataset.radius);
  document.querySelectorAll('#radius-toggle button').forEach(b => b.classList.toggle('active', b === btn));
  document.getElementById('radius-val').innerText = selectedRadius >= 100 ? 'Statewide' : `${selectedRadius} miles`;
  onInputsChanged();
});

document.getElementById('company-size-toggle').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  selectedCompanySize = btn.dataset.size;
  document.querySelectorAll('#company-size-toggle button').forEach(b => b.classList.toggle('active', b === btn));
  onInputsChanged();
});

// =====================================================================
// SEARCHABLE VERTICAL SELECT
// =====================================================================
function buildVerticalDropdown(filterText = '') {
  const dropdown = document.getElementById('vertical-dropdown');
  dropdown.innerHTML = '';
  const groups = {};
  Object.entries(VERTICALS).forEach(([key, v]) => {
    if (filterText && !v.label.toLowerCase().includes(filterText.toLowerCase())) return;
    if (!groups[v.group]) groups[v.group] = [];
    groups[v.group].push({ key, ...v });
  });
  Object.entries(groups).forEach(([group, items]) => {
    const groupLabel = document.createElement('div');
    groupLabel.className = 'select-group-label';
    groupLabel.innerText = group;
    dropdown.appendChild(groupLabel);
    items.forEach(item => {
      const opt = document.createElement('div');
      opt.className = 'select-option';
      opt.dataset.key = item.key;
      opt.innerHTML = `${item.label}<div class="opt-sub">${item.mode === 'b2b' ? 'B2B · LinkedIn-relevant' : 'B2C · Local consumer'}</div>`;
      opt.addEventListener('click', () => selectVertical(item.key));
      dropdown.appendChild(opt);
    });
  });
  if (Object.keys(groups).length === 0) {
    dropdown.innerHTML = '<div class="select-option" style="color:var(--text-muted);cursor:default;">No matches</div>';
  }
}

function selectVertical(key) {
  selectedVerticalKey = key;
  const v = VERTICALS[key];
  document.getElementById('vertical-input').value = v.label;
  document.getElementById('vertical-dropdown').classList.remove('open');

  // Apply mode + defaults
  selectedMode = v.mode;
  document.querySelectorAll('#mode-toggle button').forEach(b => b.classList.toggle('active', b.dataset.mode === v.mode));
  document.getElementById('b2c-signals').style.display = v.mode === 'b2c' ? '' : 'none';
  document.getElementById('b2b-signals').style.display = v.mode === 'b2b' ? '' : 'none';
  document.getElementById('wfh-field').style.display = v.mode === 'b2c' ? '' : 'none';
  document.getElementById('print-field').style.display = v.mode === 'b2c' ? '' : 'none';

  document.getElementById('dealsize-input').value = formatFieldNumber(v.defaultDealSize, true);
  document.getElementById('cycle-input').value = v.defaultCycleDays;
  document.getElementById('vertical-note').innerText = `Defaults applied for ${v.label}. Typical deal size ${formatCurrency(v.defaultDealSize)}, ~${v.defaultCycleDays}-day sales cycle.`;
  onInputsChanged();
}

const vertInput = document.getElementById('vertical-input');
vertInput.removeAttribute('readonly');
vertInput.addEventListener('focus', () => { buildVerticalDropdown(); document.getElementById('vertical-dropdown').classList.add('open'); });
vertInput.addEventListener('input', () => { buildVerticalDropdown(vertInput.value); document.getElementById('vertical-dropdown').classList.add('open'); });
document.addEventListener('click', (e) => {
  if (!document.getElementById('vertical-select').contains(e.target)) {
    document.getElementById('vertical-dropdown').classList.remove('open');
  }
});

// =====================================================================
// ZIP INPUT
// =====================================================================
async function handleZipInput() {
  let typedZip = document.getElementById('center-zip').value.trim();
  const errorMsg = document.getElementById('zip-error');
  if (typedZip.length !== 5 || !/^\d{5}$/.test(typedZip)) return;

  let localNode = MD_LOCATIONS.find(l => l.zip === typedZip);
  if (localNode) {
    currentCenter = { lat: localNode.lat, lon: localNode.lon, zip: typedZip };
    errorMsg.style.display = 'none';
    return;
  }
  try {
    const response = await fetch(`https://api.zippopotam.is/us/${typedZip}`);
    if (!response.ok) throw new Error('Zip invalid');
    const data = await response.json();
    const place = data.places[0];
    if (place['state abbreviation'] === 'MD' || place['state'] === 'Maryland') {
      currentCenter = { lat: parseFloat(place.latitude), lon: parseFloat(place.longitude), zip: typedZip };
      errorMsg.style.display = 'none';
    } else {
      errorMsg.innerText = 'This demo dataset only covers Maryland. A production build would support any US ZIP.';
      errorMsg.style.display = 'block';
    }
  } catch (err) {
    errorMsg.innerText = 'Invalid ZIP code.';
    errorMsg.style.display = 'block';
  }
}
document.getElementById('center-zip').addEventListener('input', handleZipInput);

function onInputsChanged() {
  updateRoasNote();
  if (currentStep === 4) updateDashboard();
}

function updateRoasNote() {
  const cpa = parseNum(document.getElementById('cpa-input').value);
  const deal = parseNum(document.getElementById('dealsize-input').value);
  const roas = cpa > 0 ? (deal / cpa) : 0;
  document.getElementById('roas-note').innerHTML = `Implied target ROAS: <strong>${roas.toFixed(1)}x</strong> (spend $${cpa} to acquire a customer worth $${formatFieldNumber(deal, true)})`;
}

// =====================================================================
// CSV EXPORT
// =====================================================================
function exportToCSV() {
  if (currentQualifiedNodes.length === 0) {
    alert('No qualified ZIP codes to export.');
    return;
  }
  const v = VERTICALS[selectedVerticalKey];
  let csv = 'data:text/csv;charset=utf-8,';
  csv += 'CUSTOMER ACQUISITION TARGETING PLAYBOOK\n';
  csv += `Business Type,${v.label}\n`;
  csv += `Mode,${selectedMode.toUpperCase()}\n`;
  csv += `Center ZIP,${currentCenter.zip}\n`;
  csv += `Radius,${selectedRadius} miles\n\n`;
  csv += 'BUDGET RECOMMENDATION\n';
  csv += `Total Monthly Budget,${formatCurrency(globalBudgets.total)}\n`;
  csv += `Google Ads,${formatCurrency(globalBudgets.google)}\n`;
  csv += `Meta (FB/IG),${formatCurrency(globalBudgets.meta)}\n`;
  csv += `LinkedIn,${formatCurrency(globalBudgets.linkedin)}\n`;
  csv += `Direct Mail,${formatCurrency(globalBudgets.print)}\n\n`;
  csv += 'ZIP Code,City,County,Households,Median Income,Home Value,WFH Rate %,Business Density,Search Intent,Print Viability\n';
  currentQualifiedNodes.forEach(d => {
    csv += `${d.zip},${d.name},${d.county},${d.households},${d.income},${d.homeValue},${d.wfhRate},${d.bizDensity},${d.searchVolumeIdx},${d.printViability}\n`;
  });
  const zipString = currentQualifiedNodes.map(d => d.zip).join(', ');
  csv += `\nGoogle/Meta Ads Location Paste String:\n"${zipString}"\n`;

  const link = document.createElement('a');
  link.setAttribute('href', encodeURI(csv));
  link.setAttribute('download', `Targeting_Playbook_${currentCenter.zip}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
document.getElementById('export-btn').addEventListener('click', exportToCSV);

// =====================================================================
// STRATEGY / RECOMMENDATION ENGINE
// =====================================================================
function generateRecommendation(nodes, v, budgetInputs) {
  const recText = document.getElementById('recommendation-text');
  if (nodes.length === 0) {
    recText.innerHTML = 'No target zones qualify with these filters. Try expanding the radius or lowering thresholds in Step 3.';
    return;
  }

  const { budget, cpa, dealSize, cycleDays } = budgetInputs;
  const lines = [];

  if (selectedMode === 'b2b') {
    const avgBiz = nodes.reduce((s, d) => s + d.bizDensity, 0) / nodes.length;
    if (avgBiz > 55 && v.cpc.linkedin) {
      lines.push(`<strong>LinkedIn firmographic targeting</strong> is well-supported here — business density is strong across qualified ZIPs.`);
    } else if (v.cpc.linkedin) {
      lines.push(`Business density is moderate; LinkedIn will work but expect a smaller reachable audience at these thresholds.`);
    }
    lines.push(`<strong>Google Search</strong> should carry demand-capture for buyers already searching for ${v.label.toLowerCase()}.`);
  } else {
    const avgWfh = nodes.reduce((s, d) => s + d.wfhRate, 0) / nodes.length;
    const avgPrint = nodes.reduce((s, d) => s + d.printViability, 0) / nodes.length;
    if (avgWfh > 35) lines.push(`<strong>Meta (FB/IG)</strong> should overperform during daytime hours given elevated remote-work density.`);
    else lines.push(`Favor <strong>mobile geofencing on Meta</strong> around commuting windows since remote-work density is low.`);
    if (avgPrint > 70) lines.push(`High homeownership makes this zone efficient for <strong>EDDM direct mail</strong> as a supplemental channel.`);
    lines.push(`<strong>Google Search</strong> should anchor spend for high-intent, ready-to-buy demand.`);
  }

  // ROI reality check
  const totalHH = nodes.reduce((s, d) => s + d.households, 0);
  const impliedCustomers = cpa > 0 ? Math.floor(budget / cpa) : 0;
  const roas = cpa > 0 ? (dealSize / cpa) : 0;

  let verdict = '';
  if (roas < 2) {
    verdict = `<strong style="color:#b91c1c">Budget check:</strong> at a $${cpa} target CPA against a $${formatFieldNumber(dealSize, true)} average customer value, your implied ROAS is ${roas.toFixed(1)}x — thin margin for ad spend plus delivery cost. Consider raising target CPA tolerance or focusing on your highest-value segment.`;
  } else if (roas < 4) {
    verdict = `<strong style="color:#b45309">Budget check:</strong> ${roas.toFixed(1)}x implied ROAS is workable but not generous. At $${formatFieldNumber(budget, true)}/mo you can support roughly ${impliedCustomers} new customers/mo at your target CPA — validate this against your actual close rate.`;
  } else {
    verdict = `<strong style="color:#047857">Budget check:</strong> ${roas.toFixed(1)}x implied ROAS gives real room to test channels. At $${formatFieldNumber(budget, true)}/mo you can support roughly ${impliedCustomers} new customers/mo at your target CPA of $${cpa}.`;
  }

  recText.innerHTML = `<ul><li>${lines.join('</li><li>')}</li></ul><p style="margin-top:12px;">${verdict}</p>`;
}

// =====================================================================
// MAIN DASHBOARD UPDATE
// =====================================================================
function updateDashboard() {
  const v = VERTICALS[selectedVerticalKey];

  const incomeThreshold = parseNum(document.getElementById('income-input').value);
  const homeThreshold = parseNum(document.getElementById('home-input').value);
  const ownerThreshold = parseNum(document.getElementById('owner-input').value);
  const ageThreshold = parseNum(document.getElementById('age-input').value);
  const bizThreshold = parseNum(document.getElementById('bizdensity-input').value);
  const wfhThreshold = parseNum(document.getElementById('wfh-input').value);
  const searchThreshold = parseNum(document.getElementById('search-input').value);
  const printThreshold = parseNum(document.getElementById('print-input').value);

  const budget = parseNum(document.getElementById('budget-input').value);
  const cpa = parseNum(document.getElementById('cpa-input').value);
  const dealSize = parseNum(document.getElementById('dealsize-input').value);
  const cycleDays = parseNum(document.getElementById('cycle-input').value);

  const centerLat = currentCenter.lat, centerLon = currentCenter.lon;

  const processed = MD_LOCATIONS.map(loc => {
    const distance = calculateDistance(centerLat, centerLon, loc.lat, loc.lon);
    const inRadius = distance <= selectedRadius;
    let meetsCriteria;
    if (selectedMode === 'b2b') {
      meetsCriteria = loc.bizDensity >= bizThreshold && loc.searchVolumeIdx >= searchThreshold;
    } else {
      meetsCriteria = loc.income >= incomeThreshold &&
        loc.homeValue >= homeThreshold &&
        loc.homeOwnRate >= ownerThreshold &&
        loc.medianAge >= ageThreshold &&
        loc.wfhRate >= wfhThreshold &&
        loc.searchVolumeIdx >= searchThreshold &&
        loc.printViability >= printThreshold;
    }
    return { ...loc, distance, visible: inRadius, qualified: inRadius && meetsCriteria };
  });

  const visibleNodes = processed.filter(d => d.visible);
  currentQualifiedNodes = visibleNodes.filter(d => d.qualified);

  const qualifiedHouseholds = currentQualifiedNodes.reduce((s, d) => s + d.households, 0);
  document.getElementById('zone-count').innerText = currentQualifiedNodes.length;
  document.getElementById('match-count').innerText = formatNumber(qualifiedHouseholds);
  document.getElementById('match-label').innerText = selectedMode === 'b2b' ? 'Reachable Businesses (est.)' : 'Prospective Households';

  const countQualified = currentQualifiedNodes.length;
  let avgIncome = 0, avgValue = 0, avgWfh = 0, avgBiz = 0, avgSearch = 0, avgPrint = 0;
  if (countQualified > 0) {
    avgIncome = currentQualifiedNodes.reduce((s, d) => s + d.income, 0) / countQualified;
    avgValue = currentQualifiedNodes.reduce((s, d) => s + d.homeValue, 0) / countQualified;
    avgWfh = currentQualifiedNodes.reduce((s, d) => s + d.wfhRate, 0) / countQualified;
    avgBiz = currentQualifiedNodes.reduce((s, d) => s + d.bizDensity, 0) / countQualified;
    avgSearch = currentQualifiedNodes.reduce((s, d) => s + d.searchVolumeIdx, 0) / countQualified;
    avgPrint = currentQualifiedNodes.reduce((s, d) => s + d.printViability, 0) / countQualified;
  }

  // ---- BUDGET ALLOCATION: driven by vertical-specific CPC benchmarks, not a flat rate ----
  // Weight channel viability by signal strength AND whether the vertical even uses that channel (cpc != null)
  const channelWeights = {
    google: v.cpc.google ? (avgSearch / 100) : 0,
    meta: v.cpc.meta ? (avgWfh / 100 + 0.3) : 0,
    linkedin: v.cpc.linkedin ? (avgBiz / 100) : 0,
    print: v.cpc.print === null && selectedMode === 'b2c' ? (avgPrint / 100) * 0.4 : 0,
  };
  // Always allow print for B2C as a minor channel even without explicit cpc entry
  if (selectedMode === 'b2c') channelWeights.print = (avgPrint / 100) * 0.35;

  const totalWeight = Object.values(channelWeights).reduce((s, w) => s + w, 0) || 1;
  globalBudgets.google = budget * (channelWeights.google / totalWeight);
  globalBudgets.meta = budget * (channelWeights.meta / totalWeight);
  globalBudgets.linkedin = budget * (channelWeights.linkedin / totalWeight);
  globalBudgets.print = budget * (channelWeights.print / totalWeight);
  globalBudgets.total = budget;

  // Render budget rows (only show channels relevant to vertical/mode)
  const budgetRowsEl = document.getElementById('budget-rows');
  let rowsHtml = '';
  rowsHtml += `<div class="budget-row"><span class="plat-google">Google Search/Display</span><strong>${formatCurrency(globalBudgets.google)}</strong></div>`;
  if (selectedMode === 'b2c') rowsHtml += `<div class="budget-row"><span class="plat-meta">Meta (FB/IG)</span><strong>${formatCurrency(globalBudgets.meta)}</strong></div>`;
  if (v.cpc.linkedin) rowsHtml += `<div class="budget-row"><span class="plat-linkedin">LinkedIn (B2B)</span><strong>${formatCurrency(globalBudgets.linkedin)}</strong></div>`;
  if (selectedMode === 'b2c') rowsHtml += `<div class="budget-row"><span class="plat-print">Direct Mail (Print)</span><strong>${formatCurrency(globalBudgets.print)}</strong></div>`;
  budgetRowsEl.innerHTML = rowsHtml;
  document.getElementById('bud-total').innerText = formatCurrency(globalBudgets.total);

  // Budget vs. target CPA feasibility
  const estCpcBlend = (
    (v.cpc.google || 0) * (channelWeights.google / totalWeight) +
    (v.cpc.meta || 0) * (channelWeights.meta / totalWeight) +
    (v.cpc.linkedin || 0) * (channelWeights.linkedin / totalWeight)
  ) || 5;
  const roas = cpa > 0 ? dealSize / cpa : 0;
  const vsTargetEl = document.getElementById('budget-vs-target');
  const impliedCustomers = cpa > 0 ? Math.floor(budget / cpa) : 0;
  if (roas < 2) {
    vsTargetEl.className = 'budget-vs-target bad';
    vsTargetEl.innerText = `⚠ ${roas.toFixed(1)}x implied ROAS is tight — target CPA may be unrealistic for this deal size.`;
  } else if (roas < 4) {
    vsTargetEl.className = 'budget-vs-target warn';
    vsTargetEl.innerText = `${roas.toFixed(1)}x implied ROAS · ~${impliedCustomers} customers/mo at target CPA of $${cpa}`;
  } else {
    vsTargetEl.className = 'budget-vs-target ok';
    vsTargetEl.innerText = `${roas.toFixed(1)}x implied ROAS · ~${impliedCustomers} customers/mo at target CPA of $${cpa}`;
  }

  // Stats
  const statsEl = document.getElementById('stats-container');
  if (selectedMode === 'b2b') {
    statsEl.innerHTML = `
      <div class="stat-box"><div class="stat-label">Qualified Zones</div><div class="stat-value">${countQualified}</div></div>
      <div class="stat-box"><div class="stat-label">Avg Business Density</div><div class="stat-value">${countQualified ? avgBiz.toFixed(0) : '—'}</div></div>
      <div class="stat-box"><div class="stat-label">Avg Search Intent</div><div class="stat-value">${countQualified ? avgSearch.toFixed(0) : '—'}</div></div>
      <div class="stat-box"><div class="stat-label">Est. Reachable Businesses</div><div class="stat-value">${formatNumber(qualifiedHouseholds)}</div></div>
    `;
  } else {
    statsEl.innerHTML = `
      <div class="stat-box"><div class="stat-label">Qualified Zones</div><div class="stat-value">${countQualified}</div></div>
      <div class="stat-box"><div class="stat-label">Avg HH Income</div><div class="stat-value">${countQualified ? formatCurrency(avgIncome) : '—'}</div></div>
      <div class="stat-box"><div class="stat-label">Avg Home Value</div><div class="stat-value">${countQualified ? formatCurrency(avgValue) : '—'}</div></div>
      <div class="stat-box"><div class="stat-label">Total Reachable Homes</div><div class="stat-value">${formatNumber(qualifiedHouseholds)}</div></div>
    `;
  }

  generateRecommendation(currentQualifiedNodes, v, { budget, cpa, dealSize, cycleDays });

  // ---- Scatter plot ----
  const yField = selectedMode === 'b2b' ? 'bizDensity' : 'homeValue';
  const yLabel = selectedMode === 'b2b' ? 'Business Density Index' : 'Median Home Value ($)';
  const xThreshold = selectedMode === 'b2b' ? bizThreshold : incomeThreshold;
  const yThreshold = selectedMode === 'b2b' ? searchThreshold : homeThreshold;
  const xField = selectedMode === 'b2b' ? 'searchVolumeIdx' : 'income';
  const xLabel = selectedMode === 'b2b' ? 'Search Intent Index' : 'Median Household Income ($)';

  const hoverLabels = visibleNodes.map(d => {
    const status = d.qualified ? '<b>🔥 QUALIFIED TARGET</b>' : '⚪ Screened Out';
    return `${status}<br><b>${d.name} (${d.zip})</b>, ${d.county} County<br>${selectedMode === 'b2b' ? 'Est. Businesses' : 'Households'}: ${d.qualified ? formatNumber(d.households) : 0}<br>Income: ${formatCurrency(d.income)} | Biz Density: ${d.bizDensity}`;
  });

  const scatterColors = visibleNodes.map(d => d.qualified ? '#7c4fe0' : '#cbd5e1');
  const scatterOpacities = visibleNodes.map(d => d.qualified ? 1.0 : 0.4);
  const scatterSizes = visibleNodes.map(d => d.qualified ? Math.min((d.households / 1000) * 1.6, 32) : 9);

  const scatterTrace = {
    x: visibleNodes.map(d => d[xField]), y: visibleNodes.map(d => d[yField]),
    mode: 'markers+text', type: 'scatter', text: visibleNodes.map(d => d.zip),
    textposition: 'top center', hoverinfo: 'text', hovertext: hoverLabels,
    textfont: { family: 'Segoe UI', size: 9, color: '#334155' },
    marker: { size: scatterSizes, color: scatterColors, opacity: scatterOpacities, line: { color: visibleNodes.map(d => d.qualified ? '#5b21b6' : '#94a3b8'), width: 1.2 } }
  };

  const xMax = selectedMode === 'b2b' ? 100 : Math.max(xThreshold + 25000, 250000);
  const yMax = selectedMode === 'b2b' ? 100 : 1400000;
  const yMin = selectedMode === 'b2b' ? 0 : 100000;
  const xMin = selectedMode === 'b2b' ? 0 : 35000;

  const scatterLayout = {
    xaxis: { title: xLabel, range: [xMin, xMax], tickformat: selectedMode === 'b2b' ? '' : '$,', gridcolor: '#f1f5f9', zeroline: false },
    yaxis: { title: yLabel, range: [yMin, yMax], tickformat: selectedMode === 'b2b' ? '' : '$,', gridcolor: '#f1f5f9', zeroline: false },
    shapes: [
      { type: 'rect', x0: xThreshold, y0: yThreshold, x1: xMax, y1: yMax, fillcolor: 'rgba(124, 79, 224, 0.05)', line: { width: 0 } },
      { type: 'line', x0: xThreshold, y0: yMin, x1: xThreshold, y1: yMax, line: { color: '#e74c3c', width: 1.5, dash: 'dash' } },
      { type: 'line', x0: xMin, y0: yThreshold, x1: xMax, y1: yThreshold, line: { color: '#e74c3c', width: 1.5, dash: 'dash' } }
    ],
    plot_bgcolor: '#ffffff', paper_bgcolor: '#ffffff', hovermode: 'closest',
    margin: { t: 15, b: 50, l: 70, r: 20 }, font: { family: 'Segoe UI, sans-serif' }
  };
  Plotly.react('plot-scatter', [scatterTrace], scatterLayout, { responsive: true, displayModeBar: false });
  document.getElementById('matrix-subtitle').innerText = selectedMode === 'b2b' ? 'Business Density vs. Search Intent' : 'Income vs. Home Value';

  // ---- Map ----
  const densityTrace = {
    type: 'densitymapbox', lat: currentQualifiedNodes.map(d => d.lat), lon: currentQualifiedNodes.map(d => d.lon),
    z: currentQualifiedNodes.map(d => d.households), radius: 40, colorscale: 'YlOrRd', opacity: 0.65, showscale: false, hoverinfo: 'skip'
  };
  const mapScatterTrace = {
    type: 'scattermapbox', lat: visibleNodes.map(d => d.lat), lon: visibleNodes.map(d => d.lon),
    mode: 'markers', hoverinfo: 'text', hovertext: hoverLabels,
    marker: { size: visibleNodes.map(d => d.qualified ? 7 : 5), color: visibleNodes.map(d => d.qualified ? '#d97706' : '#cbd5e1'), opacity: 0.8 }
  };
  let mapZoom = 9.8;
  if (selectedRadius > 60) mapZoom = 7.6;
  else if (selectedRadius > 35) mapZoom = 8.4;
  else if (selectedRadius > 15) mapZoom = 9.2;
  const mapLayout = { mapbox: { style: 'carto-positron', center: { lat: centerLat, lon: centerLon }, zoom: mapZoom }, margin: { t: 0, b: 0, l: 0, r: 0 }, showlegend: false, paper_bgcolor: '#ffffff' };
  Plotly.react('plot-map', [densityTrace, mapScatterTrace], mapLayout, { responsive: true, displayModeBar: false });
}

// =====================================================================
// INIT
// =====================================================================
selectVertical('hvac_plumbing_electrical');
updateRoasNote();
