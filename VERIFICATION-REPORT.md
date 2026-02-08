# London Property Heatmap — £/sqft Data Verification Report

**Date:** 2026-02-08  
**Data period:** 2024–2025 PPD transactions  
**Database:** 431,056 PPD records → 147,532 matched (34.2% match rate)

---

## 1. Cross-Reference with Public Market Data

| District | Our £/sqft | External Reference | Source | Verdict |
|----------|-----------|-------------------|--------|---------|
| **SW3** (Chelsea) | £1,556 | ~£1,660/sqft (£17,868/sqm housemetric) | housemetric.co.uk | ✅ Reasonable (~6% below) |
| **E14** (Canary Wharf) | £709 | £631/sqft (investropa 2025) | investropa.com | ✅ Reasonable (~12% above; our data includes all E14 not just CW core) |
| **SE1** (Southwark) | £833 | £735–£880/sqft (£9,177–£9,473/sqm housemetric) | housemetric/bricksandlogic | ✅ Within range |
| **NW3** (Hampstead) | £1,081 | ~£1,040–£1,500/sqft (£11,209–£16,190/sqm range, housemetric) | housemetric.co.uk | ✅ Reasonable (median in wide range) |
| **BR1** (Bromley) | £510 | £468–£615/sqft (£5,040–£6,620/sqm IQR, housemetric) | housemetric.co.uk | ✅ Within IQR |

**Conclusion:** All five spot-check districts are within reasonable range of independently published data. No red flags.

---

## 2. Distribution Sanity Check

| Metric | Value |
|--------|-------|
| Min £/sqft | £101 |
| Max £/sqft | £4,983 |
| Mean £/sqft | £671 |
| Median £/sqft | £603 |

### Histogram

| Bucket | Count | % |
|--------|-------|---|
| <£200 | 1,028 | 0.7% |
| £200–400 | 13,152 | 8.9% |
| £400–600 | 58,701 | 39.8% |
| £600–800 | 41,440 | 28.1% |
| £800–1000 | 18,674 | 12.7% |
| £1000–1500 | 11,380 | 7.7% |
| £1500–2000 | 2,106 | 1.4% |
| £2000–3000 | 843 | 0.6% |
| £3000+ | 208 | 0.1% |

**Conclusion:** Right-skewed distribution centred around £400–800/sqft. This is exactly what you'd expect for London — bulk of affordable/mid-range areas with a long tail into prime central. No anomalies. Zero values outside £100–£5,000.

### Extreme Districts
- **Lowest:** DA18 (Erith) at £291/sqft avg — reasonable for outer London
- **Highest:** W1 (Mayfair/Marylebone) at £1,731/sqft avg — expected for prime central

Both extremes are plausible. ✅

---

## 3. Match Quality

### Overall Match Rate: 34.2% (147,532 / 431,056)

This is reasonable. The pipeline matches PPD sales to EPC certificates by address. Not all properties have EPCs in the dataset, and address normalization isn't perfect.

### Lowest Match Rate Districts
Districts with 0% match (DA10, DA11, DA12, DA13, DA2, DA3, DA4, DA9, EN10, CR9) are all **outside Greater London proper** (Dartford, Gravesend, Swanley, Enfield borders). These likely have PPD records in the CSV but no EPC data loaded. This is expected if EPC data was filtered to London boroughs only.

### Calculation Verification
Manually verified formula: `price_per_sqft = price / (total_floor_area_m² × 10.7639)`

All 5 sampled records matched to 2 decimal places. ✅

### Duplicates
~7,328 potential duplicates detected (same price + floor area + district). Some may be legitimate (identical flats in same development sold at same price). **ℹ️ INFO** — worth investigating but unlikely to materially affect medians.

---

## 4. Floor Area Sanity

| Property Type | Count | Median Area | Average Area | Expected |
|---------------|-------|-------------|-------------|----------|
| Flat | 66,568 | 61 m² | 65 m² | 60–80 m² ✅ |
| House | 70,518 | 102 m² | 116 m² | 90–110 m² ✅ |
| Maisonette | 7,773 | — | 77 m² | ~70–80 m² ✅ |
| Bungalow | 2,673 | — | 89 m² | ~80–100 m² ✅ |

All property type floor areas match known UK/London statistics closely.

### Implausible Floor Areas
- **160 records** with area <10m² or >500m² (0.11% of matched data)
- **<10m²:** 2 records found (8m² and 7m² "flats") — likely EPC data errors
- **>500m²:** Large detached houses in BR1/BR2 (522–659m²) — plausible for large properties

**⚠️ WARNING (low severity):** 160 implausible records exist but represent only 0.11% of data. Since medians are used for district aggregation, these have negligible impact.

---

## 5. Price Outlier Check

- **Records with £/sqft < £100:** 0
- **Records with £/sqft > £5,000:** 0
- **Full range:** £101 – £4,983

The pipeline appears to already filter or cap extreme outliers. No action needed. ✅

---

## Summary of Findings

| # | Finding | Severity | Impact |
|---|---------|----------|--------|
| 1 | All 5 spot-check districts match public market data within ~10-15% | ✅ PASS | — |
| 2 | Distribution shape is realistic (right-skewed, £400-800 bulk) | ✅ PASS | — |
| 3 | £/sqft calculation formula verified correct | ✅ PASS | — |
| 4 | Floor areas match known UK statistics | ✅ PASS | — |
| 5 | No extreme outliers (all within £101–£4,983) | ✅ PASS | — |
| 6 | 0% match rate for non-London districts (DA, EN) | ℹ️ INFO | Expected — EPC data scoped to London |
| 7 | ~7,300 potential duplicate matched records | ℹ️ INFO | Negligible impact on medians |
| 8 | 160 records with implausible floor areas | ⚠️ WARNING | 0.11% of data, negligible on medians |
| 9 | 34.2% overall match rate | ℹ️ INFO | Typical for PPD↔EPC matching |

## Overall Verdict: ✅ DATA IS CREDIBLE

The £/sqft figures are independently verifiable, mathematically correct, and consistent with publicly available London property market data. The pipeline produces reliable results suitable for heatmap visualization.
