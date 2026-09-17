# Alamo Atlas

San Antonio civic safety map. Live SAPD and SAFD dispatch from **public CAD and Open Data**, plus yesterday’s full dispatch file.

**This is not 911.** Do not use it in an emergency. Call 911.

Contact: Justin on X — [@justinraineys](https://x.com/justinraineys)

## What it shows

- **Live board** — units listed as on scene by SAPD and SAFD public CAD, plus TxDOT TransGuide cameras when a traffic-related call is nearby
- **Yesterday** — every public dispatch from the previous America/Chicago day (SAPD 7-day CFS + TACC fire)
- **Reports** — written police reports from Open Data San Antonio (a report is not an arrest)
- **ZIP map** — choropleth of reports by ZIP, not rooftops
- **PDF / CSV** — yesterday’s full public dispatch list, with the CAD “as called in” type

Pins are geocoded to the **hundred-block or intersection**. No names, no unit numbers, no rooftop coordinates.

Calls for service are not confirmed crimes. SAPD does not publish 911 audio; the public “as called in” line is the CAD problem type.

## Run it

```bash
npm install
npm run dev
```

Then open the printed local URL. Live CAD and yesterday’s file are fetched server-side from public city feeds.

## Data

| Feed | Source |
|---|---|
| Live police | SAPD public CAD |
| Live fire / EMS | SAFD public CAD + TACC FireMap |
| Yesterday’s dispatches | ArcGIS `CFS_SAPD_7Days` + TACC |
| Written reports | [Open Data San Antonio](https://data.sanantonio.gov/) |

Feeds can lag, drop rows, or change without notice. Treat the map as a civic overview, not an official record.

## License

Source in this repository is for the Alamo Atlas product. City data remains the cities’. Map tiles: © OpenStreetMap contributors.
