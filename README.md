# Thai Election 2026 Visualization

This project is an interactive, scroll-based story page for exploring election patterns:

1. Fullscreen landing message
2. Fullscreen Benford chart section (D3.js)
3. Fullscreen dashboard with map, filters, list, and popup shell

## Page Structure

- `#landingSection`: headline + rotating phrase text
- `#benfordSection`: party filter + Benford chart (expected bars in gray, actual bars in blue)
- `#dashboardSection`:
	- left: status, metric selector, region selector, top-N panel
	- center: Thailand tile-grid map + legend
	- right: searchable constituency list
- `#detailPopup`: popup shell (currently shows province + constituency only)

## CSV Data Dictionary (`src/`)

### `src/tile_grid.csv`
Grid layout file for rendering the Thailand tile map shape.

- **Header:** none (matrix-style CSV)
- **Cell format:** empty string or `<province_acronym_en><district_number>` (for example `bkk1`, `cmi3`)
- **Used by:** map renderer to place constituencies in fixed tile positions
- **Notes:**
	- Acronym part must match `acronym_en` in `province_encoding.csv` (case-insensitive in code)
	- Empty cells are rendered as hidden placeholders to preserve map geometry

### `src/province_encoding.csv`
Master lookup for province identity and acronyms.

- **Columns:**
	- `code`: official numeric province code
	- `name_th`: Thai province name
	- `name_en`: English province name
	- `acronym_th`: Thai acronym
	- `acronym_en`: English acronym (used by tile codes)
- **Used by:** conversion of tile prefix (for example `bkk`) to numeric province code

### `src/region_mapping.csv`
Region mapping used as the canonical source for region filters.

- **Columns:**
	- `province_code`: numeric province code (join key to `province_encoding.code`)
	- `region_key`: machine-friendly key (`bangkok`, `central`, `north`, `northeast`, `east`, `west`, `south`)
	- `region_label`: Thai display label for UI
- **Used by:** region filter and region-scoped map/list/top-N rendering

### `src/consti1.csv`
Constituency ballot data at candidate level (multiple rows per constituency).

- **Columns:**
	- `รหัสจังหวัด`: province code
	- `จังหวัด`: province name
	- `เขต`: constituency number
	- `หมายเลข`: candidate number
	- `ชื่อผู้สมัคร`: candidate name
	- `พรรค`: candidate party
	- `คะแนน`: candidate vote count
	- `First_Digit`: first digit of `คะแนน` (for Benford analysis)
- **Used by:** candidate-level constituency analysis and Benford computations

### `src/partylist1.csv`
Party-list ballot data by constituency and party-list number.

- **Columns:**
	- `รหัสจังหวัด`: province code
	- `province_clean`: cleaned province name
	- `เขต`: constituency number
	- `หมายเลข_clean`: cleaned party-list number
	- `party_name_clean`: cleaned party name
	- `คะแนน`: vote count (`N/A` appears in some records)
	- `First_digit`: first digit of `คะแนน` when numeric
- **Used by:** party-list analysis and Benford checks for party-list votes
- **Notes:** `คะแนน` should be parsed null-safe because some values are non-numeric (`N/A`)

### `src/party_consti1.csv`
Constituency-level aggregated comparison between constituency and party-list ballot systems.

- **Columns (identity):**
	- `รหัสจังหวัด`, `จังหวัด`, `เขต`
- **Columns (party-list participation):**
	- `party_listผู้มีสิทธิ์`
	- `party_listมาใช้สิทธิ์`
	- `party_listคะแนนดี`
	- `party_listคะแนนเสีย`
	- `party_listไม่โหวต`
	- `party_listballots_received`
	- `party_listballots_used`
- **Columns (constituency winner):**
	- `แบ่งเขต_ผู้ชนะ`
	- `แบ่งเขต_พรรค`
- **Columns (constituency participation):**
	- `consti_eligible_voters`
	- `consti_voters_came`
	- `consti_ballots_received`
	- `consti_ballots_used`
	- `consti_good_votes`
	- `consti_invalid_votes`
	- `consti_no_votes`
- **Columns (derived/anomaly metrics):**
	- `2diff_came`
	- `2pct_diff/ผู้มีสิทเขต`
	- `3party_list_pct_มาใช้สิท`
	- `3consti_pct_มาใช้สิท`
	- `5partylist_บัตรผี`
	- `5consti_บัตรผี`
- **Used by dashboard metrics:**
	1. difference between two ballot count systems
	2. turnout percentages
	3. discrepancies between turnout and vote totals
	4. anomaly-oriented derived indicators

## Missing Data Behavior

- Missing constituencies are shown as **gray** tiles on the map.
- Missing constituencies are shown as **gray** items in the constituency list.
- Missing numeric values are treated as `null` and excluded from ranking/scale calculations.

## Data Quality Notes

- Some files contain non-numeric entries in numeric-looking columns (for example `N/A`).
- Parsing should always be null-safe.
- If province or district join fails, UI should keep tile/list entry visible but gray.
