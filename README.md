# Thai Election 2026 Visualization (Layout First)

This project is an interactive, scroll-based story page for exploring election patterns:

1. Fullscreen landing message
2. Fullscreen Benford chart section (D3.js)
3. Fullscreen dashboard with map, filters, list, and popup shell

## Current Focus

The current implementation focuses on **layout and interaction scaffolding** while keeping metric parsing flexible for future JSON input.

## Page Structure

- `#landingSection`: headline + rotating phrase text
- `#benfordSection`: party filter + Benford chart (expected bars in gray, actual bars in blue)
- `#dashboardSection`:
	- left: status, metric selector, region selector, top-N panel
	- center: Thailand tile-grid map + legend
	- right: searchable constituency list
- `#detailPopup`: popup shell (currently shows province + constituency only)

## Data Files

- `src/tile_grid.csv`: map tile placement
- `src/province_encoding.csv`: province code/acronym mapping
- `src/region_mapping.csv`: region source of truth (`province_code,region_key,region_label`)
- `summary_winners.csv` is fetched remotely for temporary demo data

## Missing Data Behavior

- Missing constituencies are shown as **greyed-out** areas on the map.
- Missing constituencies are shown as **greyed-out** cards in the right navigation list.
- Non-winner metrics currently use placeholders when source fields are unavailable.

## Run Locally

Use a local web server (required for `fetch` with local files):

```powershell
Set-Location "c:\Users\konkanok\Documents\repo\thai-election-2026"
python -m http.server 8000
```

Then open:

- `http://localhost:8000`

## Notes for Next Data Integration

- Keep the dashboard state model and map/list rendering.
- Replace placeholder metric extraction with direct JSON mapping when final schema arrives.
- Keep `region_mapping.csv` as the canonical region source.
