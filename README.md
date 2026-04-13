# Aurora Map

An interactive world map for exploring aurora borealis viewing conditions and photos by location and time of year.

<img width="1110" height="731" alt="image" src="https://github.com/user-attachments/assets/e76c29e4-3e07-48e3-be55-f0d4761a61ca" />


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
- Canvas-based pixel classifier validates each image before display — checks for dark sky (night) and aurora-characteristic hues (green 100–170°, purple 260–330°) to filter out non-aurora results
- Falls back through multiple search queries (city+month → city → country+month → country) to ensure enough results
- Deduplicates by canonical file URL and author+date signature across search passes

### Community Photo Uploads
- Any visitor can upload their own aurora photo for a specific city and month
- Upload accepts JPG, PNG, and WEBP up to 5 MB
- The same pixel classifier runs on the upload before it is accepted — images that don't show aurora in a night sky are rejected with an error message
- Uploader name and caption are optional
- Photos are stored in Supabase Storage and metadata in a Postgres table
- Community photos appear below the Wikimedia gallery, sorted by net votes

### Content Moderation
- Every community upload is routed through a **Supabase Edge Function** (`moderate-photo`) before being published
- The Edge Function calls the **Google Cloud Vision SafeSearch API**, which classifies the image across five categories: adult, spoof, medical, violence, and racy
- If any category scores `LIKELY` or higher, the image is rejected: the file is deleted from Storage and the upload returns a 422 with a human-readable reason
- Images that pass SafeSearch are marked `status = 'approved'` and become visible in the gallery
- The client-side pixel classifier (dark sky + aurora hues) runs first as a fast pre-filter before the upload even reaches the server, reducing unnecessary API calls

### Community Voting & Aurora Flight Challenge
- Each community photo has **▲ upvote** and **▼ downvote** buttons
- Voting is anonymous — a session ID is generated and persisted in `localStorage` so each browser gets one vote per photo
- Clicking your active vote again removes it; clicking the opposite flips it
- A **FREE FLIGHT PROGRESS** slider below each photo shows how close that photo is to winning the reward
  - Slider fills with an aurora gradient (green → cyan → purple)
  - An Icelandair plane icon sits at the right end — its opacity and glow increase as the slider fills
  - Uses a logarithmic scale so early votes move the slider visibly (1 vote ≈ 15%, 10 votes ≈ 50%, 100 votes = 100%)
- State badges: `LOW VOTES` / `✨ RISING` / `🏆 LEADING`
- The leading photo's card gets a green border glow
- The top-voted photo wins a free Icelandair flight to see the aurora

### Kp Reference Tooltip
- Info button in the header opens a Kp scale reference table (0–9) with descriptions and visibility ranges

https://github.com/user-attachments/assets/3b2267b7-fe0c-4cfc-8052-8eeb8beaeac8

## Supabase Schema

```sql
-- Uploaded photos
create table aurora_photos (
  id          uuid primary key default gen_random_uuid(),
  city_id     text not null,
  city_name   text not null,
  month       int  not null check (month between 0 and 11),
  file_path   text not null,
  public_url  text not null,
  uploader    text,
  description text,
  uploaded_at timestamptz default now(),
  upvotes     int not null default 0,
  downvotes   int not null default 0,
  net_votes   int generated always as (upvotes - downvotes) stored
);

-- One vote per session per photo
create table aurora_photo_votes (
  id          uuid primary key default gen_random_uuid(),
  photo_id    uuid not null references aurora_photos(id) on delete cascade,
  session_id  text not null,
  value       smallint not null check (value in (1, -1)),
  voted_at    timestamptz default now(),
  unique (photo_id, session_id)
);
```

Vote counts are maintained by a `cast_vote` Postgres RPC function (`security definer`) that atomically upserts the vote and recounts upvotes/downvotes from scratch, exposed automatically by Supabase as `POST /rest/v1/rpc/cast_vote`.

## Stack

- [Vite](https://vitejs.dev/) — build tool and dev server
- [D3.js v7](https://d3js.org/) — map rendering and data visualization
- [TopoJSON](https://github.com/topojson/topojson) — world country boundaries
- [Supabase](https://supabase.com/) — Postgres database, file storage, and REST API for community uploads and voting
- [NOAA SWPC API](https://www.swpc.noaa.gov/) — live planetary Kp index
- [Wikimedia Commons API](https://commons.wikimedia.org/) — aurora photographs
- [Google Cloud Vision SafeSearch](https://cloud.google.com/vision/docs/safesearch) — content moderation for community uploads

## Setup

```bash
npm install
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```
