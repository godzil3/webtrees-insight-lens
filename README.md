# INSIGHT LENS

A custom module for webtrees that visualizes genealogy change statistics with interactive charts.

## Overview

This module extends the functionality of webtrees, an online collaborative genealogy application, by providing detailed statistics and visualizations of changes made to your genealogy data.

## Features

### Data Content Statistics

- **Changes by Record Type** - Distribution of changes across different GEDCOM record types (Individuals, Families, Sources, Media, etc.)
- **Most Edited Individuals** - Ranking of individuals with the most changes
- **Most Edited Facts** - GEDCOM facts (BIRT, DEAT, MARR, NAME, etc.) that are most frequently modified
- **Most Added Facts** - GEDCOM facts that are most frequently added to records
- **Most Deleted Facts** - GEDCOM facts that are most frequently removed from records
- **Most Changed Facts Per Individual** - Individuals with the most fact changes (additions, edits, deletions)
- **Largest Changes** - Records with the most comprehensive edits by GEDCOM size

### Work Patterns Analysis

- **Changes by User** - Bar chart displaying which users made the most changes
- **Changes by Hour** - Activity patterns throughout the day (0-23)
- **Changes by Day of Week** - Which days are most active for editing
- **Changes by Day of Month** - Distribution across days 1-31
- **Changes by Month** - Seasonal editing patterns
- **Changes by Year** - Long-term editing activity
- **Biggest Work Sessions** - Days with highest number of changes
- **Commit Size Distribution** - How many changes are made per commit (editing style analysis)
- **Change Status** - Ratio of accepted, rejected, and pending changes
- **Editing Activity Over Time** - Weekly timeline showing work intensity

### Custom Heatmap

- **Custom Visualizations** - Create custom pivot-like visualizations by selecting:
  - X Axis dimension (hour, day of week, day of month, month, year, user, record type)
  - Y Axis dimension (same options as X axis)
  - Value measure (changes, unique records, unique users, unique days)
  - Optional filters by specific records and users

### Technical Features

- **Multi-year Data Aggregation** - View data split by individual years or aggregated across years with range shading
- **Flexible Time Filtering** - Analyze last 7/30/90 days, 6 months, year, all time, or custom period
- **User Filtering** - Filter statistics by specific users (multi-select)
- **Year Filtering** - Focus on specific years in multi-year charts
- **Interactive Charts** - Built with Chart.js for modern, responsive visualizations
- **Access Control** - Admin options to require authentication and restrict users to their own statistics
- **Color Schemes** - Choose between classic (soft, pastel) or modern (vibrant, saturated) colors
- **Multi-language Support** - English and Polish translations included, extensible to other languages
- **No Additional Software** - Uses CDN, no local installation required
- **Integrated with webtrees** - Appears in Charts menu alongside built-in statistics

## Installation

1. Download the latest release (`insight-lens-v*.zip`) from [Releases](https://github.com/godzil3/webtrees-insight-lens/releases)
2. Extract and copy the `insight-lens` folder to your webtrees installation's `modules_v4/` directory
3. Log in to your webtrees admin panel
4. Navigate to Control Panel → Modules → All modules
5. Find "Insight Lens" and enable it
6. Click the preferences icon (⚙) to configure default settings:
   - Default time period for Data Content tab
   - Color scheme (classic or modern)
   - Access control options

## Usage

Once enabled, the module appears in the **Charts** menu (Diagramy) in the main navigation. Click "Change Statistics" to view the dashboard.

### Default Behavior

- **Data Content tab** - Shows statistics for the configured time period (default: all time)
- **Work Patterns tab** - Always shows full history (all time) to reveal long-term editing patterns
- **Heatmap tab** - Configure axes and measures to create custom visualizations

### Filters

- **Time Period** - Select predefined period or enter custom number of days (Data Content tab only)
- **Users** - Multi-select filter to focus on specific users (both tabs)
- **Years** - Filter multi-year charts to show only selected years (Work Patterns tab)

## Requirements

- webtrees 2.2.x or higher
- PHP 8.1 or higher
- Modern web browser with JavaScript enabled

## Data Source

These statistics are based on the webtrees change log (`wt_change` table), which records all modifications to GEDCOM records. The timestamps reflect when changes were accepted/committed, not when data was originally entered. Each commit may contain multiple individual changes.

## Configuration

Access module settings via Control Panel → Modules → Insight Lens → Preferences:

- **Default time period** - Number of days to show in Data Content tab (0 = all time, max 3650 days)
- **Color scheme** - Choose between classic (soft, pastel) or modern (vibrant, saturated) colors
- **Require authentication** - Only authenticated (logged in) users can view statistics
- **Show own statistics only** - Users can only see statistics for their own changes

## Support

For issues, questions, or contributions, please visit:
https://github.com/godzil3/webtrees-insight-lens

## License

GNU General Public License v3.0 - see [LICENSE.md](LICENSE.md)

## Author

Insight Lens contributors

## Version

1.0.0
