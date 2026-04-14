# Thai Election 2026 Visualization

Interactive, scroll-based election story built with vanilla HTML/CSS/JS + D3.

## Current Experience

The app is organized as a three-section narrative with rich interactions:

1. **Landing section**
   - Hero title + rotating message (`#landingRotator`)
   - Two bookmark-style preview cards that smoothly jump to:
     - `#benfordSection`
     - `#dashboardSection`

2. **Benford section**
   - Party filter dropdown
   - D3 Benford chart (expected vs actual leading-digit distribution)
   - Hover tooltip for bars
   - Dedicated `?` info icon with explanatory floating tooltip

3. **Dashboard section**
   - Left panel: metric selector + region selector + overview chart
   - Center panel: tile-grid constituency map
   - Right panel: searchable constituency list
   - Metric-specific help tooltips (`ballot_difference`, `turnout`, `discrepancy`, `overall_score`)
   - Click any constituency (map/list/overview point) to open the detail popup

## Important Interactions

- Smooth section scrolling uses anchored links plus container-level smooth behavior.
- Map tiles support hover highlighting, tooltip positioning, and click-to-open popup.
- Overview beeswarm supports linked highlighting with map hover state.
- Popup charts re-render on selection/resize and maintain active record context.

## Data Files Used (`src/`)

- `tile_grid.csv`: constituency tile layout matrix
- `province_encoding.csv`: province code/name/acronym lookup
- `region_mapping.csv`: province-to-region mapping for filters
- `benford.json`: precomputed Benford overall + per-party distributions
- `consti1.csv`: candidate-level constituency votes
- `partylist1.csv`: party-list votes by constituency and party number
- `party_consti3.csv`: aggregated constituency metrics used by dashboard records
- `waterfall_long.csv`: chart 4 data source (constituency + party-list tracks)

## Key Computed Logic

- **Overall score** is a weighted combination of:
  - ballot difference
  - turnout deviation
  - discrepancy (ghost/missing ballots)
- Weights are adjustable in the UI (`overall_score` controls).

## Data Quality Notes

- Missing/invalid records are rendered as muted/gray states in map/list views.

## Attributions

- Data source: [Chanon Ngernthongdee's repository](https://github.com/killernay/election-69-OCR-result) (originally from Thai Election Commission)
- Icon: <a href="https://www.flaticon.com/free-icons/election" title="election icons">Election icons created by Octopocto - Flaticon</a>