# AstroVanta — Monsoon Lens

**One monsoon. Many trajectories.** Explore how June–September rainfall has changed across a central and eastern Uttar Pradesh sample using NASA POWER data.

This project was built for NASA Space Apps Challenge 2026, [“Be An Earth System Trend Detective!”](https://www.spaceappschallenge.org/2026/challenges/be-an-earth-system-trend-detective/).

## Research question

Across the sampled area around Ayodhya, where has monsoon rainfall changed since 1981, by how much, and which signals are statistically clear?

## Explore the app

- **Trend map:** inspect 49 NASA POWER grid cells and five city reference points. Click a grid cell to load its annual series and trend details.
- **By year:** scrub through 1981–2025 to see each complete June–September season on a shared rainfall scale.
- **Period change:** compare mean rainfall in 1981–1990 with 2016–2025. The map reports the recent-minus-early difference and a 95% interval.
- **Detail chart:** inspect annual totals, Theil–Sen trend estimates, intervals, and CSV downloads for the selected city or grid cell.
- **Grid readout:** compare increasing, decreasing, and unclear signals and inspect the largest point-estimate slopes.

The app requests data directly from NASA POWER in your browser. It needs an internet connection; no API key or build step is required. Completed data is cached in browser storage for one day.

## Run locally

Open PowerShell in the project folder and run:

```powershell
py -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000). Keep the terminal open while using the site; press **Ctrl+C** in that terminal to stop the server.

If `py` is unavailable, try `python -m http.server 8000`. On macOS or Linux, use `python3 -m http.server 8000`.

## Publish with GitHub Pages

The repository includes a GitHub Actions workflow that checks the JavaScript and HTML references, then deploys the static site from `main`.

To turn on the public site once:

1. Open the repository’s **Settings → Pages**.
2. Under **Build and deployment**, choose **GitHub Actions** as the source.
3. Open **Actions → Validate and deploy AstroVanta**, choose **Run workflow** on `main`, and start the first deployment.

After that first successful run, changes pushed to `main` publish automatically. The site URL will be [https://7376tanmaysingh-debug.github.io/astrovanta/](https://7376tanmaysingh-debug.github.io/astrovanta/).

## Data and methods

- **Source:** NASA POWER Daily API, Agroclimatology community, parameter `PRECTOTCORR` (corrected precipitation, mm/day). Daily values from June 1 through September 30 are summed to seasonal totals.
- **Period:** 1981–2025, the 45 complete monsoon seasons used in this version.
- **Spatial sample:** a 49-cell rectangular grid from 24.5°N to 27.5°N and 79.5°E to 84°E, plus city references at Ayodhya, Lucknow, Prayagraj, Gorakhpur, and Varanasi.
- **Grid:** NASA POWER meteorological data are based on MERRA-2 at 0.5° × 0.625° resolution. Values are model-based estimates for grid cells, not measurements from local rain gauges.
- **Trend:** Theil–Sen median pairwise slope, shown in mm per decade. A 95% circular five-year moving-block bootstrap interval is estimated from detrended residuals using 500 resamples. “Increasing” or “decreasing” means the interval excludes zero; otherwise the signal is labeled “unclear.”
- **Period comparison:** recent-period mean minus early-period mean, with a 95% circular five-year moving-block bootstrap interval calculated within each 10-year window (500 resamples). This comparison is not a trend estimate. Grid-cell intervals are exploratory and are not adjusted for testing many cells.

## Interpretation and limitations

The grid bounds are a rectangular sample chosen around the city references; they are not an administrative boundary and do not represent the full Indo-Gangetic Plain. The five city references are comparison points, not a substitute for the regional grid. Results describe the sampled NASA POWER series; they do not establish why rainfall changed. Estimates and intervals can change when NASA updates the underlying archive.

## Sources and acknowledgements

- [NASA POWER Daily API documentation](https://power.larc.nasa.gov/docs/services/api/temporal/daily/)
- [NASA POWER data sources and methodology](https://power.larc.nasa.gov/docs/methodology/)
- [NASA POWER meteorological spatial resolution](https://power.larc.nasa.gov/docs/services/)
- [NASA POWER Parameter Dictionary](https://power.larc.nasa.gov/parameters/)
- Map tiles © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), displayed with Leaflet.

NASA POWER data are provided by NASA Langley Research Center.
