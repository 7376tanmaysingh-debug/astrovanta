# AstroVanta — Monsoon Lens

A first NASA Space Apps prototype for the challenge **Be An Earth System Trend Detective!**

## Research question

Across the Indo-Gangetic Plain around Ayodhya, where has June–September rainfall increased or decreased since 1981, by how much, and which trends are statistically clear?

## What this prototype does

- Fetches daily precipitation for Ayodhya, Lucknow, Prayagraj, Gorakhpur, and Varanasi from the NASA POWER API.
- Adds daily rainfall from June 1 through September 30 into a monsoon total for each complete year from 1981 to 2025.
- Estimates each location's trend with the Theil–Sen slope.
- Estimates a 95% interval with a circular five-year moving-block bootstrap. A trend is marked as increasing or decreasing only when the interval excludes zero.
- Shows the selected location's annual series, trend line, confidence interval, comparison map, and CSV export.

The map shows five reference points, not a complete raster analysis. POWER meteorology is based on NASA's MERRA-2 assimilation model at approximately 0.5° by 0.625° resolution. A point request represents a model grid cell, not a local rain gauge. Results are descriptive and do not establish causes.

## Run locally

Serve this folder over HTTP so the browser can request NASA POWER:

1. Open a terminal in the project folder.
2. Run: python -m http.server 8000
3. Visit: http://localhost:8000

The map uses Leaflet and OpenStreetMap tiles. NASA data is requested directly from NASA POWER. The app keeps a one-day browser cache to avoid repeat downloads.

## Data and method

- NASA POWER daily API: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
- NASA POWER source and resolution notes: https://power.larc.nasa.gov/docs/methodology/data/sources/
- Parameter: PRECTOTCORR (corrected precipitation, mm/day), Agroclimatology community.
- Analysis window: 1981–2025, using complete June–September seasons.
- Trend: median of all pairwise slopes, reported in millimetres per decade.
- Uncertainty: percentile interval from 500 circular five-year block resamples of detrended residuals. This is an exploratory interval; the locations are a small comparison sample and do not replace a full spatial analysis.

NASA POWER data are provided by NASA Langley Research Center. Map tiles are © OpenStreetMap contributors.
