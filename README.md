# Sales Dashboard – Power BI Style

An interactive, browser-based sales analytics dashboard inspired by Microsoft Power BI.  
It visualises 100 rows of sample sales data and updates every chart and KPI card in real time as you apply filters.

## Live Preview

Open `index.html` in any modern browser (no build step or server required).

## Features

| Visual | Description |
|--------|-------------|
| **KPI Cards** | Total Revenue, Total Profit, Total Orders, Average Order Value |
| **Monthly Trend** (Line) | Revenue & Profit tracked across all 12 months |
| **Revenue by Category** (Doughnut) | Share of total revenue per product category |
| **Sales by Region** (Grouped Bar) | Revenue & Profit compared across four regions |
| **Top Products** (Horizontal Bar) | Eight best-selling products ranked by revenue |
| **Profit Margin by Category** (Radar) | Margin percentages visualised as a spider chart |
| **Category Performance Table** | Revenue, Profit, Units Sold, Revenue Share & Margin per category |
| **Top Customers Table** | Top 10 customers by revenue with colour-coded margin badges |

### Filters
- **Year** – filter all visuals to a single calendar year  
- **Region** – North / South / East / West  
- **Category** – Electronics / Furniture / Clothing / Office Supplies  

All filters can be combined and reset independently.

### Export
Click **⬇ Export CSV** to download the currently filtered dataset as a CSV file.

## Project Structure

```
dashboard/
├── index.html          # Main dashboard page
├── css/
│   └── style.css       # Power BI-inspired stylesheet
├── js/
│   └── dashboard.js    # Data loading, filtering & Chart.js rendering
└── data/
    └── sales_data.csv  # 100 rows of sample sales data
```

## Data Schema (`sales_data.csv`)

| Column | Type | Description |
|--------|------|-------------|
| `Order ID` | integer | Unique order identifier |
| `Date` | YYYY-MM-DD | Order date |
| `Customer` | string | Customer company name |
| `Region` | string | Sales region |
| `Category` | string | Product category |
| `Product` | string | Product name |
| `Quantity` | integer | Units ordered |
| `Unit Price` | decimal | Price per unit (USD) |
| `Total Sales` | decimal | `Quantity × Unit Price` |
| `Profit` | decimal | Profit on the order |

## Dependencies

| Library | Version | Purpose |
|---------|---------|---------|
| [Chart.js](https://www.chartjs.org/) | 4.4.3 | All charts (loaded via CDN) |

No Node.js, no build tool, no installation needed.

## Usage

1. Clone the repository  
   ```bash
   git clone https://github.com/ghanshyamjha2015-glitch/dashboard.git
   cd dashboard
   ```

2. Open `index.html` directly in your browser, **or** serve it locally:
   ```bash
   # Python 3
   python -m http.server 8080
   # then open http://localhost:8080
   ```

3. Use the filter dropdowns in the header to slice the data by Year, Region, or Category.

## Connecting to Power BI Desktop

The `data/sales_data.csv` file can be imported directly into Power BI Desktop:

1. Open **Power BI Desktop → Get Data → Text/CSV**
2. Select `data/sales_data.csv`
3. Click **Load**
4. Build your own visuals using the same fields documented above

## License

MIT
