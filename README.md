# Aurora Map

An interactive world map for exploring aurora borealis viewing conditions by location and time of year.

## Features

### Interactive World Map
- D3.js Natural Earth projection with pan and zoom (scroll, pinch, or zoom buttons)
- Auroral zone band (60°N–75°N) rendered as a semi-transparent overlay
- Clickable city markers with layered rings, glow effects, and a pulse animation on selection
- Markers stay screen-size-constant when zooming

### Preset Locations
Six pre-loaded aurora destinations with location-specific data:

| Location | Country | Min Kp |
|---|---|---|
| Fairbanks | USA (Alaska) | 3 |
| Whidbey Island | USA (Washington) | 5 |
| Yellowknife | Canada | 3 |
| Reykjavik | Iceland | 3 |
| Tromsø | Norway | 2 |
| Lapland | Finland | 2 |

### Add Custom Locations
Search and add any city worldwide via the location input in the panel. Custom markers appear on the map alongside preset locations, with Kp data estimated from latitude.

### Kp Index Data
- **Live data**: fetches the NOAA planetary Kp index in real-time and displays the current value in the header
- **Historical baselines**: per-city monthly averages derived from geomagnetic latitude, sector effects (Russell–McPherron), and dark-sky availability (midnight sun suppression)
- **Blended mode**: when live NOAA data is available, it's blended with historical baselines for more accurate estimates
- Source badge shows `NOAA + HISTORICAL` or `HISTORICAL AVG` depending on data availability

### Monthly Kp Chart
- 12-month bar chart showing aurora activity across the year for the selected city
- Bars color-coded by Kp level: quiet (green), unsettled (yellow), active (orange), storm (red)
- Dashed visibility threshold line showing the minimum Kp needed to see aurora at that location
- Peak month badge and midnight sun footnote where applicable

### Month Selector
- Grid of 12 months, color-coded by activity level
- Click any month to update the photo gallery

### Aurora Photo Gallery
- Pulls aurora photos from Wikimedia Commons for the selected city and month
- Displays up to 6 photos with hover zoom and a lightbox-style expand view

### Kp Reference Tooltip
- Info button in the header opens a Kp scale reference table (0–9) with descriptions and visibility ranges

## Stack

- Vanilla HTML/CSS/JS — no build step required, open `index.html` directly in a browser
- [D3.js v7](https://d3js.org/) — map rendering and data visualization
- [TopoJSON](https://github.com/topojson/topojson) — world country boundaries
- [NOAA SWPC API](https://www.swpc.noaa.gov/) — live planetary Kp index
- [Wikimedia Commons API](https://commons.wikimedia.org/) — aurora photographs
