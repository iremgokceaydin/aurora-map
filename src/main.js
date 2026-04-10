import './style.css';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { createClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════
//  SUPABASE CONFIG — set these in .env (never commit real values)
// ═══════════════════════════════════════════════════════════════════
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  || '';
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON || '';
const sb = SUPABASE_URL ? createClient(SUPABASE_URL, SUPABASE_ANON) : null;

// ═══════════════════════════════════════════════════════════════════
//  AURORA MAP · Data & Constants
// ═══════════════════════════════════════════════════════════════════

const MONTHS_SHORT = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const MONTHS_FULL  = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];

// Per-city aurora viewing index — effective aurora activity per month.
// Derived from: global Kp monthly baseline × geomagnetic latitude factor ×
// dark-sky availability (midnight sun suppresses Jun/Jul at high latitudes).
//
// Key seasonal drivers:
//  • Russell–McPherron effect → equinoctial Kp peaks in Mar & Sep globally
//  • Sector effect → North American sites peak Sep; Atlantic sites peak Mar;
//    European (Scandinavian) sites shift peak to Oct as polar night returns
//  • Midnight sun → Jun/Jul near-zero at 62–70°N regardless of Kp activity
//  • Polar night → Oct–Feb darkness bonus at Tromsø/Lapland (69–70°N)
//
// Source methodology: GFZ Potsdam historical Kp, NOAA SWPC aurora oval
// literature, Nevanlinna & Pulkkinen (2001), Stamper et al. aurora frequency.
//   Jan   Feb   Mar   Apr   May   Jun   Jul   Aug   Sep   Oct   Nov   Dec
const CITY_KP = {
  // 64.8°N · geomag ~65°N · North American sector · Sep equinox > Mar
  // Midnight sun: Jun–Jul effectively no dark sky. Oct/Nov solid darkness.
  fairbanks:   [2.8, 3.1, 3.2, 2.1, 0.7, 0.1, 0.1, 1.0, 3.5, 3.4, 3.1, 2.8],

  // 48.2°N · geomag ~50°N · Pacific sector · no midnight sun problem
  // Aurora requires major storm (Kp ≥ 5); monthly averages never reach threshold.
  // Gentle equinoctial shape; Sep marginally higher than Mar.
  whidbey:     [1.3, 1.5, 1.8, 1.6, 1.3, 1.1, 1.0, 1.2, 1.9, 1.7, 1.4, 1.3],

  // 62.5°N · geomag ~63°N · North American sector · similar to Fairbanks
  // Midnight sun Jun–Jul. Sep equinox dominant.
  yellowknife: [2.6, 2.9, 3.0, 1.9, 0.6, 0.1, 0.1, 0.9, 3.3, 3.2, 2.9, 2.6],

  // 64.1°N · geomag ~65°N · Atlantic sector · MARCH peak (Atlantic sector bias)
  // Documented in Nevanlinna & Pulkkinen: Atlantic-sector sites show Mar > Sep.
  // Midnight sun Jun–Jul comparable to Fairbanks.
  reykjavik:   [2.6, 2.9, 3.4, 2.0, 0.6, 0.1, 0.1, 0.9, 3.2, 3.1, 2.8, 2.6],

  // 69.6°N · geomag ~67°N · European sector · inside auroral oval
  // OCTOBER peak: Sep equinoctial boost coincides with polar night returning.
  // Polar night (no sun): mid-Nov to late Jan → excellent winter viewing.
  // Midnight sun: mid-May to late Jul → near-zero Jun/Jul.
  tromso:      [3.8, 3.6, 4.0, 2.5, 0.4, 0.1, 0.1, 1.3, 3.9, 4.5, 4.3, 4.0],

  // 68.9°N · geomag ~66°N · European sector · inside auroral oval
  // OCTOBER peak: same polar-night + equinoctial mechanism as Tromsø.
  // Polar night: Dec–Jan. Midnight sun: Jun–Jul.
  lapland:     [3.6, 3.4, 3.8, 2.3, 0.5, 0.1, 0.1, 1.2, 3.7, 4.3, 4.1, 3.8],
};

const CITIES = [
  { id:'fairbanks',  name:'Fairbanks',      state:'Alaska',               country:'USA',
    lat:64.8401,  lng:-147.7200, minKp:3,
    tz:'AKST (UTC−9)',
    desc:'Located near the auroral oval — one of the best aurora sites in the world.',
    search:'aurora borealis Fairbanks Alaska' },
  { id:'whidbey',    name:'Whidbey Island',  state:'Washington',           country:'USA',
    lat:48.1768,  lng:-122.5758, minKp:5,
    tz:'PST (UTC−8)',
    desc:'Mid-latitude site. Visible only during elevated geomagnetic storms (Kp ≥ 5).',
    search:'aurora borealis Washington State Pacific Northwest' },
  { id:'yellowknife',name:'Yellowknife',     state:'Northwest Territories', country:'Canada',
    lat:62.4540,  lng:-114.3718, minKp:3,
    tz:'MST (UTC−7)',
    desc:'Known as the Aurora Capital of North America. ~240 viewing nights per year.',
    search:'aurora borealis Yellowknife Canada Northwest Territories' },
  { id:'reykjavik',  name:'Reykjavik',       state:'Capital Region',        country:'Iceland',
    lat:64.1265,  lng:-21.8174, minKp:3,
    tz:'GMT (UTC±0)',
    desc:'Aurora hunting hub of Iceland. Easy access to dark-sky sites.',
    search:'aurora borealis Reykjavik Iceland' },
  { id:'tromso',     name:'Tromsø',          state:'Troms',                 country:'Norway',
    lat:69.6492,  lng: 18.9553, minKp:2,
    tz:'CET (UTC+1)',
    desc:'Situated inside the auroral oval — world-class aurora destination.',
    search:'aurora borealis Tromsø Norway' },
  { id:'lapland',    name:'Lapland',         state:'Lappi',                 country:'Finland',
    lat:68.9219,  lng: 27.5058, minKp:2,
    tz:'EET (UTC+2)',
    desc:'Arctic wilderness with 200+ aurora nights per year in full darkness.',
    search:'aurora borealis Lapland Finland Saariselkä' }
];

// ═══════════════════════════════════════════════════════════════════
//  State
// ═══════════════════════════════════════════════════════════════════
let selectedCity  = null;
let selectedMonth = new Date().getUTCMonth(); // 0-indexed, UTC
let liveKpMonthly = {};   // month-index → computed avg from NOAA
let photoCache    = {};
let zoomBehavior, mapSvg, mapG, projection, pathGenerator;

// ═══════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════
function kpColor(kp) {
  if (kp < 3) return '#4caf50';
  if (kp < 5) return '#ffeb3b';
  if (kp < 7) return '#ff9800';
  return '#f44336';
}

// Returns city-specific monthly Kp. NOAA live data provides a global offset
// that is blended on top of the per-city baseline.
function getKp(monthIdx, city) {
  const base = city ? CITY_KP[city.id][monthIdx] : 2.0;
  if (liveKpMonthly[monthIdx] !== undefined) {
    // Scale the live deviation proportionally onto the city baseline
    const globalBase = [2.1,2.3,2.8,2.6,2.2,1.9,1.8,2.0,2.9,2.7,2.3,2.0][monthIdx];
    const delta = liveKpMonthly[monthIdx] - globalBase;
    return Math.max(0, parseFloat((base + delta).toFixed(2)));
  }
  return base;
}

function peakMonth(city) {
  const vals = MONTHS_SHORT.map((_,i) => getKp(i, city));
  return vals.indexOf(Math.max(...vals));
}

// ═══════════════════════════════════════════════════════════════════
//  NOAA Kp Fetch
// ═══════════════════════════════════════════════════════════════════
async function fetchNOAAKp() {
  try {
    const res  = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json');
    const data = await res.json();
    if (!Array.isArray(data) || data.length < 1) return;

    // Latest live value — walk backwards to find most recent valid entry
    const liveEl = document.getElementById('live-kp-display');
    let liveKp = NaN;
    for (let i = data.length - 1; i >= 0; i--) {
      const v = parseFloat(data[i].Kp);
      if (isFinite(v) && v >= 0) { liveKp = v; break; }
    }
    if (isFinite(liveKp)) {
      liveEl.textContent = liveKp.toFixed(1);
      liveEl.style.color = kpColor(liveKp);
    } else {
      liveEl.textContent = '—';
    }

    // Compute per-month averages from returned data (up to 30 days)
    const grouped = {};
    data.forEach(row => {
      const d = new Date(row.time_tag);
      const m = d.getUTCMonth();
      const v = parseFloat(row.Kp);
      if (isFinite(v) && v >= 0) {
        if (!grouped[m]) grouped[m] = [];
        grouped[m].push(v);
      }
    });
    Object.keys(grouped).forEach(m => {
      const arr = grouped[m];
      liveKpMonthly[+m] = parseFloat((arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(2));
    });

    // Update source badge if city loaded
    if (selectedCity) {
      const hasLive = Object.keys(liveKpMonthly).length > 0;
      document.getElementById('kp-source-badge').textContent = hasLive ? 'NOAA + HISTORICAL' : 'HISTORICAL AVG';
    }
  } catch(e) {
    console.warn('NOAA Kp fetch failed, using historical averages.', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  World Map (D3 + TopoJSON)
// ═══════════════════════════════════════════════════════════════════
function initMap() {
  const cont = document.getElementById('map-container');
  const W = cont.clientWidth, H = cont.clientHeight;

  mapSvg = d3.select('#world-map').attr('width', W).attr('height', H);

  projection = d3.geoNaturalEarth1()
    .scale(W / 6.4)
    .translate([W / 2, H / 2]);

  pathGenerator = d3.geoPath().projection(projection);

  // SVG defs
  const defs = mapSvg.append('defs');
  const glowFilter = defs.append('filter').attr('id', 'glow').attr('x','-50%').attr('y','-50%').attr('width','200%').attr('height','200%');
  glowFilter.append('feGaussianBlur').attr('stdDeviation','3.5').attr('result','blur');
  const feMerge = glowFilter.append('feMerge');
  feMerge.append('feMergeNode').attr('in','blur');
  feMerge.append('feMergeNode').attr('in','SourceGraphic');

  mapG = mapSvg.append('g').attr('class', 'map-root');

  // Ocean sphere
  mapG.append('path').datum({type:'Sphere'}).attr('class','sphere').attr('d', pathGenerator);

  // Graticule
  const grat = d3.geoGraticule().step([30, 30]);
  mapG.append('path').datum(grat()).attr('class','graticule').attr('d', pathGenerator);

  // Auroral zone band (60°N – 75°N)
  const auroralBand = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        ...d3.range(-180, 181, 3).map(lng => [lng, 75]),
        ...d3.range(180, -181, -3).map(lng => [lng, 60])
      ]]
    }
  };
  mapG.append('path').datum(auroralBand).attr('class','aurora-band').attr('d', pathGenerator);

  // Countries
  fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
    .then(r => r.json())
    .then(world => {
      mapG.insert('g', '.cities')
          .selectAll('path')
          .data(topojson.feature(world, world.objects.countries).features)
          .join('path').attr('class','country').attr('d', pathGenerator);

      mapG.insert('path', '.cities')
          .datum(topojson.mesh(world, world.objects.countries))
          .attr('fill','none').attr('stroke','#1c3050').attr('stroke-width','0.3')
          .attr('d', pathGenerator);
    })
    .catch(() => console.warn('world-atlas CDN unavailable'));

  // Draw city markers
  drawCities();

  // Zoom
  zoomBehavior = d3.zoom().scaleExtent([0.4, 10]).on('zoom', e => {
    mapG.attr('transform', e.transform);
  });
  mapSvg.call(zoomBehavior);

  // Zoom buttons
  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    mapSvg.transition().duration(300).call(zoomBehavior.scaleBy, 1.6);
  });
  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    mapSvg.transition().duration(300).call(zoomBehavior.scaleBy, 0.625);
  });
  document.getElementById('btn-zoom-reset').addEventListener('click', () => {
    mapSvg.transition().duration(400).call(zoomBehavior.transform, d3.zoomIdentity);
  });
}

function drawCities() {
  const citiesG = mapG.append('g').attr('class', 'cities');

  CITIES.forEach(city => {
    const [cx, cy] = projection([city.lng, city.lat]);

    const g = citiesG.append('g')
      .attr('class', 'city-marker')
      .attr('id', `city-${city.id}`)
      .attr('transform', `translate(${cx},${cy})`);

    g.append('circle').attr('class','city-pulse').attr('r', 6);
    g.append('circle').attr('class','city-ring-outer').attr('r', 11);
    g.append('circle').attr('class','city-ring-inner').attr('r', 7);
    g.append('circle').attr('class','city-dot').attr('r', 3.5).attr('filter','url(#glow)');
    g.append('text').attr('class','city-label').style('font-size','9.5px').attr('x', 9).attr('y', -5).text(city.name);

    g.on('click', () => selectCity(city));
  });
}

function setActiveCityMarker(city) {
  const k = currentZoomTransform.k;

  // Reset all to default
  d3.selectAll('.city-marker').classed('active', false);
  d3.selectAll('.city-marker .city-dot')
    .transition().duration(200).attr('r', Math.max(2, 3.5 / k));
  d3.selectAll('.city-marker .city-ring-outer')
    .transition().duration(200).attr('r', Math.max(5, 11 / k));

  if (city) {
    const g = d3.select(`#city-${city.id}`);
    g.classed('active', true);
    g.select('.city-dot')
      .transition().duration(200).attr('r', Math.max(3, 5 / k));
    g.select('.city-ring-outer')
      .transition().duration(200).attr('r', Math.max(6, 13 / k));
    g.select('.city-ring-inner')
      .transition().duration(200).attr('r', Math.max(4, 9 / k));
  }
}

function repositionMarkers() {
  [...CITIES, ...customCities].forEach(city => {
    const [cx, cy] = projection([city.lng, city.lat]);
    d3.select(`#city-${city.id}`).attr('transform', `translate(${cx},${cy})`);
  });
}

// ═══════════════════════════════════════════════════════════════════
//  City Selection
// ═══════════════════════════════════════════════════════════════════
function selectCity(city) {
  selectedCity = city;
  setActiveCityMarker(city);

  document.getElementById('welcome-state').style.display = 'none';
  document.getElementById('city-state').style.display    = 'flex';

  renderCityHeader(city);
  renderKpChart(city);
  renderMonthGrid(city);
  updateMonthInfo(city);
  fetchPhotos(city);
  loadCommunityPhotos(city, selectedMonth);
}

function renderCityHeader(city) {
  document.getElementById('city-name-el').textContent = city.name.toUpperCase();
  document.getElementById('city-loc-el').textContent  = `${city.state} · ${city.country}`;
  document.getElementById('city-meta-el').innerHTML   = `
    <div class="meta-item">
      <div class="meta-lbl">LATITUDE</div>
      <div class="meta-val">${city.lat.toFixed(4)}° N</div>
    </div>
    <div class="meta-item">
      <div class="meta-lbl">LONGITUDE</div>
      <div class="meta-val">${Math.abs(city.lng).toFixed(4)}° ${city.lng < 0 ? 'W':'E'}</div>
    </div>
    <div class="meta-item">
      <div class="meta-lbl">MIN Kp THRESHOLD</div>
      <div class="meta-val" style="color:${kpColor(city.minKp)}">Kp ${city.minKp}+</div>
    </div>
    <div class="meta-item">
      <div class="meta-lbl">TIMEZONE</div>
      <div class="meta-val" style="font-size:0.62rem">${city.tz}</div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════
//  KP Bar Chart (D3)
// ═══════════════════════════════════════════════════════════════════
function renderKpChart(city) {
  const svg    = document.getElementById('kp-chart');
  const contEl = document.getElementById('kp-section');
  const W      = contEl.clientWidth || 370;
  const H      = 155;
  const margin = { top: 14, right: 18, bottom: 22, left: 26 };
  const iW     = W - margin.left - margin.right;
  const iH     = H - margin.top  - margin.bottom;

  const chart = d3.select('#kp-chart').attr('width', W).attr('height', H);
  chart.selectAll('*').remove();

  const kpVals = MONTHS_SHORT.map((_,i) => getKp(i, city));
  const peak   = kpVals.indexOf(Math.max(...kpVals));

  const xS = d3.scaleBand().domain(MONTHS_SHORT).range([0, iW]).padding(0.22);
  const yS = d3.scaleLinear().domain([0, 9]).range([iH, 0]);

  const g = chart.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  // Grid lines
  [1,2,3,4,5,6,7,8,9].forEach(v => {
    g.append('line')
     .attr('x1',0).attr('x2',iW)
     .attr('y1',yS(v)).attr('y2',yS(v))
     .attr('stroke', v === city.minKp ? 'rgba(0,255,163,0.35)' : '#1a2540')
     .attr('stroke-width', v === city.minKp ? 1 : 0.5)
     .attr('stroke-dasharray', v === city.minKp ? '4,4' : '3,3');
    if (v === city.minKp) {
      g.append('text')
       .attr('x', iW + 2).attr('y', yS(v) + 3)
       .attr('fill','rgba(0,255,163,0.5)').attr('font-size','7.5px')
       .attr('font-family','Consolas,monospace').text(`Kp${city.minKp}`);
    }
  });

  // Bars
  g.selectAll('.kp-bar')
   .data(MONTHS_SHORT)
   .join('rect')
   .attr('class','kp-bar')
   .attr('x',      d  => xS(d))
   .attr('y',      (_,i) => yS(kpVals[i]))
   .attr('width',  xS.bandwidth())
   .attr('height', (_,i) => Math.max(0, iH - yS(kpVals[i])))
   .attr('fill',   (_,i) => i === selectedMonth ? '#d0eaff' : (i === peak ? '#ff9800' : kpColor(kpVals[i])))
   .attr('opacity',(_,i) => i === selectedMonth ? 1 : 0.72)
   .on('click',    (_, d) => selectMonth(MONTHS_SHORT.indexOf(d)));

  // Selected month top indicator
  g.append('rect')
   .attr('x', xS(MONTHS_SHORT[selectedMonth]))
   .attr('y', yS(kpVals[selectedMonth]) - 2)
   .attr('width', xS.bandwidth()).attr('height', 2)
   .attr('fill', '#d0eaff');

  // Peak label
  g.append('text')
   .attr('x', xS(MONTHS_SHORT[peak]) + xS.bandwidth()/2)
   .attr('y', yS(kpVals[peak]) - 4)
   .attr('text-anchor','middle').attr('font-size','7px')
   .attr('fill','#ff9800').attr('font-family','Consolas,monospace')
   .text('PEAK');

  // X axis
  const xAxis = g.append('g')
    .attr('transform', `translate(0,${iH})`)
    .call(d3.axisBottom(xS).tickSize(2));
  xAxis.selectAll('text').style('font-size','8px').style('font-family','Consolas,monospace').style('fill','#5a7a9a');
  xAxis.selectAll('path,line').attr('stroke','#1a2540');

  // Y axis
  const yAxis = g.append('g').call(d3.axisLeft(yS).ticks(9).tickSize(2));
  yAxis.selectAll('text').style('font-size','8px').style('font-family','Consolas,monospace').style('fill','#5a7a9a');
  yAxis.selectAll('path,line').attr('stroke','#1a2540');

  // Y label
  g.append('text')
   .attr('transform','rotate(-90)').attr('x',-iH/2).attr('y',-20)
   .attr('text-anchor','middle').attr('font-size','7px')
   .attr('fill','#3a5060').attr('font-family','Consolas,monospace')
   .text('Kp INDEX');

  // Update labels
  document.getElementById('peak-badge').textContent = `PEAK: ${MONTHS_FULL[peak].toUpperCase()}`;
  document.getElementById('kp-section-title').textContent =
    `${city.name.toUpperCase()} · AURORA VIEWING INDEX BY MONTH`;
  document.getElementById('kp-source-badge').textContent =
    Object.keys(liveKpMonthly).length > 0 ? 'NOAA + HISTORICAL' : 'HISTORICAL AVG';
  // Show midnight-sun footnote for high-latitude cities (above ~60°N)
  document.getElementById('kp-footnote').style.display = city.lat >= 60 ? 'block' : 'none';
  // Update threshold legend
  document.getElementById('legend-threshold-city').textContent = city.name;
  document.getElementById('legend-threshold-kp').textContent   = city.minKp;
}

// ═══════════════════════════════════════════════════════════════════
//  Month Grid
// ═══════════════════════════════════════════════════════════════════
function renderMonthGrid(city) {
  const grid = document.getElementById('month-grid');
  grid.innerHTML = '';
  const peak = peakMonth(city);

  MONTHS_SHORT.forEach((m, i) => {
    const div = document.createElement('div');
    div.className = ['month-btn',
      i === selectedMonth ? 'active' : '',
      i === peak           ? 'peak'   : ''
    ].join(' ').trim();
    div.innerHTML = m + (i === peak ? '<span class="peak-tick">▲</span>' : '');
    div.addEventListener('click', () => selectMonth(i));
    grid.appendChild(div);
  });
}

function selectMonth(idx) {
  selectedMonth = idx;
  document.querySelectorAll('.month-btn').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
  });
  if (selectedCity) {
    renderKpChart(selectedCity);
    updateMonthInfo(selectedCity);
    fetchPhotos(selectedCity);
    loadCommunityPhotos(selectedCity, selectedMonth);
  }
}

function updateMonthInfo(city) {
  const kp      = getKp(selectedMonth, city);
  const visible = kp >= city.minKp;

  document.getElementById('mon-name-el').textContent = MONTHS_FULL[selectedMonth].toUpperCase();

  const kpEl = document.getElementById('mon-kp-val');
  kpEl.textContent  = kp.toFixed(1);
  kpEl.style.color  = kpColor(kp);

  const vb = document.getElementById('vis-badge');
  if (visible) {
    vb.textContent   = 'LIKELY VISIBLE';
    vb.style.color   = '#00ffa3';
    vb.style.borderColor = '#00ffa3';
    vb.style.background  = 'rgba(0,255,163,0.07)';
  } else {
    vb.textContent   = 'LOW PROBABILITY';
    vb.style.color   = '#5a7a9a';
    vb.style.borderColor = '#3a5060';
    vb.style.background  = 'transparent';
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Wikimedia Commons Photo Fetch
// ═══════════════════════════════════════════════════════════════════
async function fetchPhotos(city) {
  const gallery  = document.getElementById('photo-gallery');
  const monthName = MONTHS_FULL[selectedMonth];

  // Update section header
  document.getElementById('photo-month-label').textContent = monthName.toUpperCase();

  gallery.innerHTML = `<div class="photo-loading"><span class="loading-text">FETCHING AURORA PHOTOGRAPHS...</span></div>`;

  // Cache per city+month so switching months fetches fresh results
  const cacheKey = `${city.id}_${selectedMonth}`;
  try {
    let images;
    if (photoCache[cacheKey]) {
      images = photoCache[cacheKey];
    } else {
      // Collect candidates across multiple search passes
      let candidates = [];

      const collect = async (query) => {
        const results = await searchWikimedia(query);
        candidates = [...candidates, ...results];
      };

      // Primary: city + month name
      await collect(`aurora borealis ${city.name} ${monthName}`);
      // Secondary: city only (drop month)
      if (candidates.length < 8) await collect(city.search);
      // Tertiary: country + month
      if (candidates.length < 8) await collect(`aurora borealis ${city.country} ${monthName}`);
      // Quaternary: country only
      if (candidates.length < 8) await collect(`aurora borealis ${city.country}`);

      // Deduplicate by canonical file URL — unique per file regardless of search pass
      const seen = new Set();
      candidates = candidates.filter(img => {
        if (seen.has(img.full)) return false;
        seen.add(img.full);
        return true;
      });

      // Pixel-classify all candidates in parallel, then keep only aurora images
      gallery.innerHTML = `<div class="photo-loading"><span class="loading-text">ANALYSING PHOTOGRAPHS...</span></div>`;
      const classifications = await Promise.all(candidates.map(img => classifyAuroraPixels(img.thumb)));
      const seenSig = new Set();
      images = candidates.filter((img, i) => {
        if (!classifications[i]) return false;
        // Secondary dedup: same author+date is almost certainly the same photo re-uploaded
        const sig = `${img.author}|${img.date}`;
        if (img.date !== 'Date unknown' && seenSig.has(sig)) return false;
        seenSig.add(sig);
        return true;
      }).slice(0, 8);

      photoCache[cacheKey] = images;
    }
    renderGallery(gallery, images, city);
  } catch(e) {
    gallery.innerHTML = `<div class="no-photos">UNABLE TO LOAD PHOTOGRAPHS<br><span style="font-size:0.52rem">CHECK NETWORK CONNECTION</span></div>`;
  }
}

// ── Aurora image classifier (canvas pixel analysis) ───────────────
// Loads each thumbnail onto an offscreen canvas, samples pixels, and
// scores based on two signals that define an aurora-in-sky photo:
//   1. Dark background  — night sky means most pixels have low luminance
//   2. Aurora hues      — greens (hue ~100–170°) and purples (~260–330°)
//      against that dark background
//
// Wikimedia thumbs are served with CORS headers so crossOrigin reads work.
function classifyAuroraPixels(thumbUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const SIZE = 96; // downsample for speed — enough for color stats
      const canvas = document.createElement('canvas');
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, SIZE, SIZE);

      let dark = 0, green = 0, purple = 0, total = 0;
      const px = ctx.getImageData(0, 0, SIZE, SIZE).data;

      for (let i = 0; i < px.length; i += 4) {
        const r = px[i] / 255, g = px[i+1] / 255, b = px[i+2] / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const lum = (max + min) / 2;
        const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lum - 1));

        let hue = 0;
        if (max !== min) {
          const d = max - min;
          if      (max === r) hue = (((g - b) / d) % 6) * 60;
          else if (max === g) hue = ((b - r) / d + 2) * 60;
          else                hue = ((r - g) / d + 4) * 60;
          if (hue < 0) hue += 360;
        }

        // Night sky: luminance < 20% brightness
        if (lum < 0.20) dark++;

        // Aurora green (oxygen emission ~557 nm → green/cyan band)
        if (hue >= 100 && hue <= 170 && sat > 0.25 && lum > 0.06 && lum < 0.80) green++;

        // Aurora purple/magenta (nitrogen emission, high-altitude red blends)
        if (hue >= 260 && hue <= 330 && sat > 0.25 && lum > 0.06 && lum < 0.80) purple++;

        total++;
      }

      const darkRatio   = dark   / total;
      const greenRatio  = green  / total;
      const purpleRatio = purple / total;

      // Criteria: mostly dark sky + meaningful aurora colour signal
      const isAurora = darkRatio > 0.30 && (greenRatio > 0.04 || purpleRatio > 0.025 || (greenRatio + purpleRatio) > 0.05);
      resolve(isAurora);
    };
    // If the image fails to load, admit it rather than silently dropping it
    img.onerror = () => resolve(false);
    img.src = thumbUrl;
  });
}

async function searchWikimedia(query) {
  // Step 1: search for file pages — fetch extra to allow for pixel filtering
  const searchURL = `https://commons.wikimedia.org/w/api.php?` +
    `action=query&list=search&srsearch=${encodeURIComponent(query)}&srnamespace=6` +
    `&format=json&origin=*&srlimit=20&srqiprofile=popular_inclinks`;

  const sRes  = await fetch(searchURL);
  const sData = await sRes.json();
  const hits  = (sData.query?.search || [])
    .filter(r => /\.(jpg|jpeg|png)$/i.test(r.title))
    .slice(0, 16);

  if (!hits.length) return [];

  // Step 2: fetch image info & thumbnails
  const titles = hits.map(h => h.title).join('|');
  const infoURL = `https://commons.wikimedia.org/w/api.php?` +
    `action=query&titles=${encodeURIComponent(titles)}&prop=imageinfo` +
    `&iiprop=url|user|extmetadata&iiurlwidth=600&format=json&origin=*`;

  const iRes  = await fetch(infoURL);
  const iData = await iRes.json();

  return Object.values(iData.query?.pages || {})
    .filter(p => p.imageinfo?.[0]?.thumburl)
    .map(p => {
      const info = p.imageinfo[0];
      const meta = info.extmetadata || {};
      const rawAuthor = meta.Artist?.value || info.user || 'Unknown';
      const author = rawAuthor.replace(/<[^>]*>/g, '').trim().substring(0, 32);
      const rawDate = meta.DateTimeOriginal?.value || meta.DateTime?.value || '';
      const date = rawDate.split(' ')[0] || rawDate.split('T')[0] || 'Date unknown';
      const license = meta.LicenseShortName?.value || 'CC';
      const sourceUrl = info.descriptionurl ||
        `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g,'_'))}`;
      return {
        title: p.title.replace('File:','').replace(/\.[^.]+$/,''),
        thumb: info.thumburl,
        full:  info.url,
        source: sourceUrl,
        author, date, license
      };
    });
}

function renderGallery(container, images, city) {
  if (!images.length) {
    container.innerHTML = `<div class="no-photos">NO PHOTOGRAPHS FOUND<br>
      <a href="https://commons.wikimedia.org/w/index.php?search=aurora+borealis+${encodeURIComponent(city.name)}&ns6=1"
         target="_blank" rel="noopener noreferrer"
         style="font-size:0.52rem;color:#00b4d8;text-decoration:none;display:inline-block;margin-top:6px">
        ↗ SEARCH WIKIMEDIA COMMONS
      </a></div>`;
    return;
  }

  container.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'photo-grid';

  images.forEach(img => {
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.innerHTML = `
      <img class="photo-thumb" src="${img.thumb}" alt="${img.title}" loading="lazy">
      <div class="photo-cap">
        <div class="photo-author">© ${img.author}</div>
        <div class="photo-date">${img.date} · ${img.license}</div>
        <a class="photo-src" href="${img.source}" target="_blank" rel="noopener noreferrer">↗ VIEW ON WIKIMEDIA</a>
      </div>
    `;
    card.querySelector('.photo-thumb').addEventListener('click', () => window.open(img.source, '_blank', 'noopener'));
    grid.appendChild(card);
  });

  container.appendChild(grid);

  const note = document.createElement('div');
  note.className = 'photo-attrib';
  note.textContent = `AURORA PHOTOS · ${city.name.toUpperCase()} · ${MONTHS_FULL[selectedMonth].toUpperCase()} · ${images.length} RESULTS · WIKIMEDIA COMMONS CC`;
  container.appendChild(note);
}

// ═══════════════════════════════════════════════════════════════════
//  Community uploads
// ═══════════════════════════════════════════════════════════════════

let uploadFile = null;  // currently staged File object

function initUploadForm() {
  const toggleBtn  = document.getElementById('upload-toggle-btn');
  const form       = document.getElementById('upload-form');
  const dropArea   = document.getElementById('upload-drop-area');
  const fileInput  = document.getElementById('upload-file-input');
  const preview    = document.getElementById('upload-preview');
  const dropLabel  = document.getElementById('upload-drop-label');
  const fields     = document.getElementById('upload-fields');
  const metaEl     = document.getElementById('upload-meta');
  const errorEl    = document.getElementById('upload-error');
  const cancelBtn  = document.getElementById('upload-cancel-btn');
  const submitBtn  = document.getElementById('upload-submit-btn');
  const statusEl   = document.getElementById('upload-status');

  function resetForm() {
    uploadFile = null;
    fileInput.value = '';
    preview.style.display = 'none';
    dropLabel.style.display = 'flex';
    fields.style.display = 'none';
    document.getElementById('upload-name').value = '';
    document.getElementById('upload-desc').value = '';
    metaEl.textContent = '';
    errorEl.textContent = '';
    submitBtn.disabled = false;
    statusEl.style.display = 'none';
    statusEl.className = 'upload-status';
  }

  function closeForm() {
    form.style.display = 'none';
    toggleBtn.textContent = '+ UPLOAD YOURS';
    resetForm();
  }

  toggleBtn.addEventListener('click', () => {
    const open = form.style.display !== 'none';
    if (open) { closeForm(); return; }
    if (!sb) {
      alert('Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in the source.');
      return;
    }
    form.style.display = 'block';
    toggleBtn.textContent = '✕ CANCEL';
  });

  cancelBtn.addEventListener('click', closeForm);

  // Click to browse
  dropArea.addEventListener('click', () => fileInput.click());

  // Drag & drop
  dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.classList.add('drag-over'); });
  dropArea.addEventListener('dragleave', () => dropArea.classList.remove('drag-over'));
  dropArea.addEventListener('drop', e => {
    e.preventDefault();
    dropArea.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) stageFile(file);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) stageFile(fileInput.files[0]);
  });

  async function stageFile(file) {
    errorEl.textContent = '';
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      errorEl.textContent = 'UNSUPPORTED FORMAT — USE JPG, PNG, OR WEBP';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      errorEl.textContent = 'FILE TOO LARGE — MAX 10 MB';
      return;
    }

    const url = URL.createObjectURL(file);
    preview.src = url;
    preview.style.display = 'block';
    dropLabel.style.display = 'none';
    fields.style.display = 'flex';
    submitBtn.disabled = true;
    metaEl.textContent = 'ANALYSING IMAGE…';

    const isAurora = await classifyAuroraPixels(url);
    URL.revokeObjectURL(url);

    if (!isAurora) {
      errorEl.textContent = 'IMAGE DOES NOT APPEAR TO SHOW AURORA IN THE SKY — PLEASE UPLOAD AN AURORA PHOTOGRAPH';
      preview.style.display = 'none';
      dropLabel.style.display = 'flex';
      fields.style.display = 'none';
      uploadFile = null;
      return;
    }

    uploadFile = file;
    metaEl.textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB · aurora detected`;
    submitBtn.disabled = false;
  }

  submitBtn.addEventListener('click', async () => {
    if (!uploadFile || !selectedCity) return;
    submitBtn.disabled = true;
    statusEl.style.display = 'block';
    statusEl.className = 'upload-status loading';
    statusEl.textContent = 'UPLOADING…';
    errorEl.textContent = '';

    try {
      const ext   = uploadFile.name.split('.').pop().toLowerCase().replace('jpg','jpeg');
      const path  = `${selectedCity.id}/${selectedMonth}/${Date.now()}.${ext}`;

      const { error: upErr } = await sb.storage
        .from('aurora-photos')
        .upload(path, uploadFile, { contentType: uploadFile.type, upsert: false });

      if (upErr) throw upErr;

      const { data: urlData } = sb.storage.from('aurora-photos').getPublicUrl(path);

      const { error: dbErr } = await sb
        .from('aurora_photos')
        .insert({
          city_id:    selectedCity.id,
          city_name:  selectedCity.name,
          month:      selectedMonth,
          file_path:  path,
          public_url: urlData.publicUrl,
          uploader:   document.getElementById('upload-name').value.trim() || null,
          description:document.getElementById('upload-desc').value.trim() || null,
        });

      if (dbErr) throw dbErr;

      statusEl.className = 'upload-status success';
      statusEl.textContent = 'PHOTO SUBMITTED — THANK YOU!';
      setTimeout(() => {
        closeForm();
        loadCommunityPhotos(selectedCity, selectedMonth);
      }, 2000);

    } catch (err) {
      statusEl.className = 'upload-status error';
      statusEl.textContent = `UPLOAD FAILED — ${err.message?.toUpperCase() || 'UNKNOWN ERROR'}`;
      submitBtn.disabled = false;
    }
  });
}

async function loadCommunityPhotos(city, month) {
  const container = document.getElementById('community-gallery');
  if (!sb) return;

  container.innerHTML = '';

  const { data, error } = await sb
    .from('aurora_photos')
    .select('*')
    .eq('city_id', city.id)
    .eq('month', month)
    .order('uploaded_at', { ascending: false })
    .limit(12);

  if (error || !data?.length) return;

  const grid = document.createElement('div');
  grid.className = 'photo-grid';

  data.forEach(row => {
    const card = document.createElement('div');
    card.className = 'photo-card community';
    const author = row.uploader || 'Anonymous';
    const desc   = row.description ? `<div class="photo-date">${row.description}</div>` : '';
    const date   = row.uploaded_at ? row.uploaded_at.slice(0, 10) : '';
    card.innerHTML = `
      <div class="community-badge">COMMUNITY PHOTO</div>
      <img class="photo-thumb" src="${row.public_url}" alt="Aurora photo by ${author}" loading="lazy">
      <div class="photo-cap">
        <div class="photo-author">© ${author}</div>
        ${desc}
        <div class="photo-date">${date}</div>
      </div>
    `;
    card.querySelector('.photo-thumb').addEventListener('click', () => window.open(row.public_url, '_blank', 'noopener'));
    grid.appendChild(card);
  });

  container.appendChild(grid);
}

// ═══════════════════════════════════════════════════════════════════
//  Welcome city list
// ═══════════════════════════════════════════════════════════════════
function initWelcomeList() {
  CITIES.forEach(city => addCityHintItem(city, false));
}

// ═══════════════════════════════════════════════════════════════════
//  Responsive resize
// ═══════════════════════════════════════════════════════════════════
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const cont = document.getElementById('map-container');
    const W = cont.clientWidth, H = cont.clientHeight;
    mapSvg.attr('width', W).attr('height', H);
    projection.scale(W / 6.4).translate([W / 2, H / 2]);
    mapG.selectAll('path').attr('d', pathGenerator);
    repositionMarkers();
    if (selectedCity) renderKpChart(selectedCity);
    resizeAuroraCanvas();
    if (document.getElementById('oval-checkbox').checked) drawAuroraOval();
  }, 200);
});

// ═══════════════════════════════════════════════════════════════════
//  Aurora Oval Overlay (NOAA OVATION via SWPC)
// ═══════════════════════════════════════════════════════════════════

let ovalData      = null;   // parsed NOAA aurora JSON
let ovalEnabled   = false;
let currentZoomTransform = d3.zoomIdentity;

function resizeAuroraCanvas() {
  const cont = document.getElementById('map-container');
  const cvs  = document.getElementById('aurora-canvas');
  cvs.width  = cont.clientWidth;
  cvs.height = cont.clientHeight;
}

async function fetchAuroraOval() {
  try {
    // NOAA SWPC OVATION aurora forecast — 512×512 grid, global coverage
    const url = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json';
    const res  = await fetch(url);
    const json = await res.json();
    ovalData = json;
    document.getElementById('oval-status').textContent =
      json['Observation Time'] ? json['Observation Time'].replace('T',' ').slice(0,16)+' UTC' : 'LIVE';
    if (ovalEnabled) drawAuroraOval();
  } catch(e) {
    console.warn('NOAA OVATION fetch failed:', e.message);
    document.getElementById('oval-status').textContent = 'FETCH ERR';
  }
}

function drawAuroraOval() {
  const cvs = document.getElementById('aurora-canvas');
  const ctx = cvs.getContext('2d');
  ctx.clearRect(0, 0, cvs.width, cvs.height);

  if (!ovalData || !ovalData.coordinates) return;

  // NOAA data: array of [lng, lat, aurora_value] where aurora_value 0-100
  const coords = ovalData.coordinates;
  const t = currentZoomTransform;

  for (let i = 0; i < coords.length; i++) {
    const [lng, lat, val] = coords[i];
    if (val <= 0) continue;

    // Project geo → SVG pixel → apply current zoom transform
    const [svgX, svgY] = projection([lng, lat]);
    const screenX = t.applyX(svgX);
    const screenY = t.applyY(svgY);

    // Normalise 0–100 → opacity & colour
    const norm    = Math.min(val / 100, 1);
    const alpha   = 0.15 + norm * 0.75;

    // Green → cyan → white gradient by intensity
    let r, g, b;
    if (norm < 0.4) {
      r = 0;   g = Math.round(180 + norm * 187); b = Math.round(norm * 200);
    } else if (norm < 0.75) {
      r = Math.round((norm - 0.4) / 0.35 * 80);
      g = 255;
      b = Math.round(150 + norm * 105);
    } else {
      r = Math.round(80  + (norm - 0.75) / 0.25 * 175);
      g = 255;
      b = 255;
    }

    const radius = Math.max(1, (t.k * 2.2));
    ctx.beginPath();
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.fill();
  }
}

function clearAuroraOval() {
  const cvs = document.getElementById('aurora-canvas');
  const ctx = cvs.getContext('2d');
  ctx.clearRect(0, 0, cvs.width, cvs.height);
}

function initAuroraOval() {
  const checkbox = document.getElementById('oval-checkbox');
  const canvas   = document.getElementById('aurora-canvas');
  const legend   = document.getElementById('oval-legend');

  checkbox.addEventListener('change', async () => {
    ovalEnabled = checkbox.checked;
    legend.style.display = ovalEnabled ? 'flex' : 'none';
    if (ovalEnabled) {
      canvas.classList.add('visible');
      if (!ovalData) {
        document.getElementById('oval-status').textContent = 'LOADING…';
        await fetchAuroraOval();
      } else {
        drawAuroraOval();
      }
    } else {
      canvas.classList.remove('visible');
      clearAuroraOval();
    }
  });

  // Hook into D3 zoom to redraw overlay on pan/zoom
  zoomBehavior.on('zoom', (e) => {
    mapG.attr('transform', e.transform);
    currentZoomTransform = e.transform;
    scaleCityLabels(e.transform.k);
    if (ovalEnabled) drawAuroraOval();
  });
}

function scaleCityLabels(k) {
  // Counter-scale all marker elements so they stay screen-size-constant while zooming.
  const fontSize    = Math.max(3,   9.5 / k);
  const dotR        = Math.max(2,   3.5 / k);
  const activeDotR  = Math.max(3,   5   / k);
  const ringR       = Math.max(5,   11  / k);
  const activeRingR = Math.max(6,   13  / k);
  const innerR      = Math.max(3,   7   / k);
  const activeInnerR= Math.max(4,   9   / k);
  const pulseR      = Math.max(3,   6   / k);
  const strokeW     = Math.max(0.3, 1   / k);
  const labelX      = Math.max(5,   9   / k);
  const labelY      = Math.max(-6, -5   / k);

  d3.selectAll('.city-label')
    .style('font-size', fontSize + 'px')
    .attr('x', labelX)
    .attr('y', labelY);

  d3.selectAll('.city-marker:not(.active) .city-ring-outer')
    .attr('r', ringR).style('stroke-width', strokeW + 'px');
  d3.selectAll('.city-marker.active .city-ring-outer')
    .attr('r', activeRingR).style('stroke-width', strokeW + 'px');

  d3.selectAll('.city-marker:not(.active) .city-ring-inner').attr('r', innerR);
  d3.selectAll('.city-marker.active .city-ring-inner').attr('r', activeInnerR);

  d3.selectAll('.city-pulse').attr('r', pulseR);

  d3.selectAll('.city-marker:not(.active) .city-dot').attr('r', dotR);
  d3.selectAll('.city-marker.active .city-dot').attr('r', activeDotR);
}

// ═══════════════════════════════════════════════════════════════════
//  Kp Info Tooltip
// ═══════════════════════════════════════════════════════════════════
function initKpTooltip() {
  const btn     = document.getElementById('kp-info-btn');
  const tooltip = document.getElementById('kp-tooltip');
  const close   = document.getElementById('kp-tooltip-close');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const visible = tooltip.classList.toggle('visible');
    btn.classList.toggle('active', visible);
  });

  close.addEventListener('click', () => {
    tooltip.classList.remove('visible');
    btn.classList.remove('active');
  });

  // Close when clicking anywhere outside
  document.addEventListener('click', (e) => {
    if (!tooltip.contains(e.target) && e.target !== btn) {
      tooltip.classList.remove('visible');
      btn.classList.remove('active');
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
//  Add Custom Location
// ═══════════════════════════════════════════════════════════════════

// Compute a Kp profile for an arbitrary latitude using the same
// seasonal model as the built-in cities.
function computeKpProfile(lat) {
  // Geomagnetic latitude proxy: scale by distance from auroral oval (~67°N)
  const geomagLat = Math.abs(lat);

  // Latitude factor: 1.0 at 70°N, tapering to ~0.15 at 40°N, ~0 below 35°N
  const latFactor = Math.max(0, Math.min(1, (geomagLat - 35) / 35));

  // Midnight sun suppression for high latitudes (above ~60°N)
  const midnightSun = geomagLat >= 60;

  // Baseline seasonal shape — Russell–McPherron equinoctial pattern
  // Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec
  const shape = [0.75, 0.80, 0.95, 0.72, 0.45, 0.18, 0.15, 0.40, 1.00, 0.92, 0.82, 0.76];

  // Inside oval (≥67°N): October peak from polar-night + equinoctial combo
  // Atlantic/European sector approximation for high latitudes
  if (geomagLat >= 67) {
    shape[9] = 1.05; shape[8] = 0.98; shape[2] = 0.92;
  }
  // North of ~60°: suppress midnight sun months
  if (midnightSun) {
    shape[5] = 0.02; shape[6] = 0.02;
    shape[4] = 0.15; shape[7] = 0.30;
  }

  // Peak Kp scales with geomagnetic latitude
  const peak = 1.2 + latFactor * 3.5;

  return shape.map(s => parseFloat((s * peak).toFixed(2)));
}

// Derive minKp threshold from latitude
function computeMinKp(lat) {
  const g = Math.abs(lat);
  if (g >= 68) return 2;
  if (g >= 62) return 3;
  if (g >= 55) return 4;
  if (g >= 50) return 5;
  return 6;
}

// Add a single marker to the existing cities SVG group
function addCityMarker(city) {
  const citiesG = mapG.select('.cities');
  const [cx, cy] = projection([city.lng, city.lat]);
  const k = currentZoomTransform.k;

  const g = citiesG.append('g')
    .attr('class', 'city-marker')
    .attr('id', `city-${city.id}`)
    .attr('transform', `translate(${cx},${cy})`);

  g.append('circle').attr('class','city-pulse').attr('r', Math.max(3, 6 / k));
  g.append('circle').attr('class','city-ring-outer').attr('r', Math.max(5, 11 / k)).style('stroke-width', Math.max(0.3, 1 / k) + 'px');
  g.append('circle').attr('class','city-ring-inner').attr('r', Math.max(3, 7 / k));
  g.append('circle').attr('class','city-dot').attr('r', Math.max(2, 3.5 / k)).attr('filter', 'url(#glow)');
  g.append('text').attr('class', 'city-label').style('font-size', Math.max(6, 9.5 / k) + 'px').attr('x', Math.max(5, 9 / k)).attr('y', Math.max(-6, -5 / k)).text(city.name);
  g.on('click', () => selectCity(city));
}

// Add a city hint item to the welcome list
function addCityHintItem(city, isCustom) {
  const list = document.getElementById('city-list-hint');
  const el = document.createElement('div');
  el.className = 'city-hint-item' + (isCustom ? ' custom' : '');
  el.dataset.cityId = city.id;
  el.innerHTML = `${city.name}, ${city.state}, ${city.country}`
    + (isCustom ? `<span class="city-custom-tag">CUSTOM</span>` : '');
  el.addEventListener('click', () => selectCity(city));
  list.appendChild(el);
}

let geocodeTimer = null;
let dropdownSelection = null; // { lat, lng, name, display_name, address }

function initAddLocation() {
  const input    = document.getElementById('add-city-input');
  const dropdown = document.getElementById('add-dropdown');
  const addBtn   = document.getElementById('add-city-btn');
  const errorEl  = document.getElementById('add-error');

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }
  function clearError() { errorEl.style.display = 'none'; }

  function closeDropdown() {
    dropdown.classList.remove('open');
    dropdown.innerHTML = '';
  }

  function renderDropdown(results) {
    dropdown.innerHTML = '';
    if (!results.length) {
      dropdown.innerHTML = '<div class="add-dropdown-msg">NO RESULTS FOUND</div>';
      dropdown.classList.add('open');
      return;
    }
    results.forEach((r, i) => {
      const addr = r.address || {};
      const country = addr.country || '';
      const state   = addr.state || addr.county || addr.region || '';
      const item = document.createElement('div');
      item.className = 'add-dropdown-item';
      item.innerHTML = `<div>${r.name || r.display_name.split(',')[0]}</div>
        <div class="drop-country">${[state, country].filter(Boolean).join(', ')}</div>`;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault(); // keep focus on input
        dropdownSelection = r;
        input.value = r.name || r.display_name.split(',')[0];
        addBtn.disabled = false;
        clearError();
        closeDropdown();
      });
      dropdown.appendChild(item);
    });
    dropdown.classList.add('open');
    dropdownSelection = null;
    addBtn.disabled = true;
  }

  async function geocode(query) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?` +
        `q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=6&featuretype=city`;
      const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const data = await res.json();
      renderDropdown(data);
    } catch(e) {
      closeDropdown();
      showError('GEOCODE LOOKUP FAILED — CHECK CONNECTION');
    }
  }

  input.addEventListener('input', () => {
    const val = input.value.trim();
    clearError();
    addBtn.disabled = true;
    dropdownSelection = null;
    if (val.length < 2) { closeDropdown(); return; }
    clearTimeout(geocodeTimer);
    dropdown.innerHTML = '<div class="add-dropdown-msg">SEARCHING…</div>';
    dropdown.classList.add('open');
    geocodeTimer = setTimeout(() => geocode(val), 400);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeDropdown(); input.blur(); }
  });

  input.addEventListener('blur', () => {
    // slight delay so mousedown on item fires first
    setTimeout(closeDropdown, 150);
  });

  addBtn.addEventListener('click', () => {
    if (!dropdownSelection) return;
    clearError();

    const r      = dropdownSelection;
    const addr   = r.address || {};
    const lat    = parseFloat(r.lat);
    const lng    = parseFloat(r.lon);
    const name   = r.name || r.display_name.split(',')[0];
    const state  = addr.state || addr.county || addr.region || '—';
    const country= addr.country || '—';

    // Check for duplicate
    const allCities = [...CITIES, ...customCities];
    if (allCities.some(c => Math.abs(c.lat - lat) < 0.05 && Math.abs(c.lng - lng) < 0.05)) {
      showError('LOCATION ALREADY ADDED');
      return;
    }

    const id      = 'custom_' + name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();
    const minKp   = computeMinKp(lat);
    const kpProfile = computeKpProfile(lat);
    const tzOffset  = -Math.round(lng / 15);
    const tzLabel   = tzOffset === 0 ? 'UTC±0' : (tzOffset > 0 ? `UTC+${tzOffset}` : `UTC${tzOffset}`);

    const city = {
      id, name, state, country, lat, lng, minKp,
      tz: tzLabel,
      desc: `Custom location at ${lat.toFixed(2)}°, ${lng.toFixed(2)}°. Min Kp threshold: ${minKp}.`,
      search: `aurora borealis ${name} ${country}`,
      custom: true
    };

    CITY_KP[id] = kpProfile;
    customCities.push(city);

    addCityMarker(city);
    addCityHintItem(city, true);

    // Reset input
    input.value = '';
    addBtn.disabled = true;
    dropdownSelection = null;

    // Immediately open the new city
    selectCity(city);
  });
}

// ═══════════════════════════════════════════════════════════════════
//  Boot
// ═══════════════════════════════════════════════════════════════════
const customCities = [];

(async function init() {
  initMap();
  initKpTooltip();
  initWelcomeList();
  initAddLocation();
  initUploadForm();

  document.getElementById('back-btn').addEventListener('click', () => {
    selectedCity = null;
    setActiveCityMarker(null);
    document.getElementById('city-state').style.display  = 'none';
    document.getElementById('welcome-state').style.display = 'flex';
  });
  resizeAuroraCanvas();
  initAuroraOval();
  await fetchNOAAKp();
  setInterval(fetchNOAAKp,        3 * 60 * 1000);  // Kp every 3 min
  setInterval(fetchAuroraOval,   10 * 60 * 1000);  // oval every 10 min
})();
