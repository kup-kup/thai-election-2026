# Thai Election 2026 Visualization

This project is an interactive, scroll-based story page for exploring election patterns:

1. Fullscreen landing message
2. Fullscreen Benford chart section (D3.js)
3. Fullscreen dashboard with map, filters, list, and popup shell

## Page Structure

- `#landingSection`: headline + rotating phrase text
- `#benfordSection`: party filter + Benford chart (expected bars in gray, actual bars in blue)
- `#dashboardSection`:
	- left: metric selector, region selector
	- center: Thailand tile-grid map + legend
	- right: searchable constituency list with metric-aware value and sorting
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
- **Used by:** region filter and region-scoped map/list rendering

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
	- `province_code`, `province_name`, `constituency`
- **Columns (party-list participation):**
	- `party_list_eligible_voters` --- eligible voters for party-list system in the constituency
	- `party_list_voter_came` --- voters who participated in the party-list system in the constituency
	- `party_list_good_votes` --- valid votes for party-list system in the constituency
	- `party_list_invalid_votes` --- invalid votes for party-list system in the constituency
	- `party_list_no_votes` --- voters who vote-no in the party-list system in the constituency
	- `party_listballots_received` --- number of ballots received for the party-list system in the constituency
	- `party_listballots_used` --- number of ballots used in the party-list system in the constituency
- **Columns (constituency winner):**
	- `constituency_winner_candidate`
	- `constituency_winner_party`
- **Columns (constituency participation):**
	- `consti_eligible_voters` --- eligible voters for constituency system in the constituency
	- `consti_voters_came` --- voters who participated in the constituency system in the constituency
	- `consti_ballots_received` --- number of ballots received for the constituency system in the constituency
	- `consti_ballots_used` --- number of ballots used in the constituency system in the constituency
	- `consti_good_votes` --- valid votes for constituency system in the constituency
	- `consti_invalid_votes` --- invalid votes for constituency system in the constituency
	- `consti_no_votes` --- voters who vote-no in the constituency system in the constituency
- **Columns (derived/anomaly metrics):**
	- `2diff_came` --- difference in voters who came between the two systems
	- `2pct_diff_eligible_voters` --- percentage difference in eligible voters between the two systems
	- `3party_list_pct_came` --- percentage of eligible voters who participated in the party-list system
	- `3consti_pct_came` --- percentage of eligible voters who participated in the constituency system
	- `5partylist_ghost` --- voters who participated in the party-list system but not the constituency system
	- `5consti_ghost` --- voters who participated in the constituency system but not the party-list system
- **Used by dashboard metrics:**
	1. difference between two ballot count systems
	2. turnout percentages
	3. discrepancies between turnout and vote totals
	4. anomaly-oriented derived indicators

## Missing Data Behavior

- Missing constituencies are shown as **gray** tiles on the map.
- Missing constituencies are shown as **gray** items in the constituency list.
- Missing numeric values are treated as `null` and are displayed as `-` in the constituency list.

## Data Quality Notes

- Some files contain non-numeric entries in numeric-looking columns (for example `N/A`).
- Parsing should always be null-safe.
- If province or district join fails, UI should keep tile/list entry visible but gray.

## Attributions
- Data source: [Chanon Ngernthongdee's GitHub repository](https://github.com/killernay/election-69-OCR-result) (originally from Thai Election Commission)
- Icon: <a href="https://www.flaticon.com/free-icons/election" title="election icons">Election icons created by Octopocto - Flaticon</a>