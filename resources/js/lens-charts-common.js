// =============================================================================
// LENS CHARTS - COMMON MODULE
// Shared utilities, configuration, and chart factory
// =============================================================================

// Global variables to store original multi-year data
let originalHourStats = null;
let originalDayStats = null;
let originalDayOfMonthStats = null;
let originalMonthStats = null;

// =============================================================================
// COLOR CONFIGURATION
// =============================================================================

// Chart.js configuration - Color schemes
const colorScheme = LensConfig.colorScheme;

// Classic colors (soft, pastel - like Google Charts)
const classicColors = {
    red: 'rgb(220, 57, 18)',
    orange: 'rgb(255, 153, 0)',
    yellow: 'rgb(255, 199, 44)',
    green: 'rgb(16, 150, 24)',
    blue: 'rgb(51, 102, 204)',
    purple: 'rgb(153, 0, 153)',
    grey: 'rgb(170, 170, 170)',
    pink: 'rgb(221, 68, 119)',
    teal: 'rgb(0, 153, 198)',
};

// Modern colors (vibrant, saturated)
const modernColors = {
    red: 'rgb(255, 99, 132)',
    orange: 'rgb(255, 159, 64)',
    yellow: 'rgb(255, 205, 86)',
    green: 'rgb(75, 192, 192)',
    blue: 'rgb(54, 162, 235)',
    purple: 'rgb(153, 102, 255)',
    grey: 'rgb(201, 203, 207)',
    pink: 'rgb(255, 105, 180)',
    teal: 'rgb(0, 128, 128)',
};

// Select color scheme based on preference
const chartColors = colorScheme === 'classic' ? classicColors : modernColors;

const colorPalette = [
    chartColors.blue,
    chartColors.green,
    chartColors.orange,
    chartColors.purple,
    chartColors.red,
    chartColors.yellow,
    chartColors.pink,
    chartColors.teal,
    chartColors.grey,
];

// Helper: Define year colors for multi-year charts
const yearColors = [
    'rgb(255, 159, 64)', 'rgb(54, 162, 235)', 'rgb(75, 192, 192)',
    'rgb(153, 102, 255)', 'rgb(255, 99, 132)', 'rgb(255, 205, 86)', 'rgb(201, 203, 207)'
];

// =============================================================================
// CHART INSTANCE STORAGE
// =============================================================================

// Tab 1 (Data Content) chart instances
const dataContentChartInstances = {};

// Tab 2 (Work Patterns) chart instances
const workPatternsChartInstances = {};

// Helper function to destroy all Tab 1 chart instances
function destroyDataContentCharts() {
    Object.keys(dataContentChartInstances).forEach(key => {
        if (dataContentChartInstances[key]) {
            dataContentChartInstances[key].destroy();
            delete dataContentChartInstances[key];
        }
    });
}

// Helper function to destroy all Tab 2 chart instances
function destroyWorkPatternsCharts() {
    Object.keys(workPatternsChartInstances).forEach(key => {
        if (workPatternsChartInstances[key]) {
            workPatternsChartInstances[key].destroy();
            delete workPatternsChartInstances[key];
        }
    });
}

// =============================================================================
// TIMELINE FILL HELPERS - Fill missing periods with zeros
// Used when LensConfig.timelineDisplay === 'show_zeros'
// =============================================================================

/**
 * Check if timeline should extend to today based on current filter
 * - Year filter active (checkbox checked) -> don't extend to today
 * - Days filter active (no year checkbox) -> extend to today
 */
function shouldExtendToToday() {
    const yearCheckboxes = document.querySelectorAll('.year-checkbox:checked');
    return yearCheckboxes.length === 0;
}

/**
 * Get current week in ISO format (YYYY-Www)
 */
function getCurrentWeekString() {
    const now = new Date();
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const isoYear = d.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return isoYear + '-W' + String(weekNo).padStart(2, '0');
}

/**
 * Get current month in format (YYYY-MM)
 */
function getCurrentMonthString() {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

/**
 * Get current day in format (YYYY-MM-DD)
 */
function getCurrentDayString() {
    const now = new Date();
    return now.getFullYear() + '-' +
           String(now.getMonth() + 1).padStart(2, '0') + '-' +
           String(now.getDate()).padStart(2, '0');
}

/**
 * Fill missing days with zeros
 * - For days/all-time filter: extends to today
 * - For year filter: only fills gaps within data range
 */
function fillMissingDays(data) {
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
        return data;
    }

    const keys = Object.keys(data).sort();
    const minDay = keys[0];
    const currentDay = getCurrentDayString();
    // Extend to today only if days filter is active (not year filter)
    const maxDay = shouldExtendToToday() && keys[keys.length - 1] < currentDay
        ? currentDay
        : keys[keys.length - 1];

    const filled = {};
    let current = new Date(minDay + 'T00:00:00');
    const end = new Date(maxDay + 'T00:00:00');

    while (current <= end) {
        const dayStr = current.getFullYear() + '-' +
                       String(current.getMonth() + 1).padStart(2, '0') + '-' +
                       String(current.getDate()).padStart(2, '0');
        filled[dayStr] = data[dayStr] !== undefined ? data[dayStr] : 0;
        current.setDate(current.getDate() + 1);
    }

    return filled;
}

/**
 * Fill missing days with zeros for auth data (logins/failed)
 * - For days/all-time filter: extends to today
 * - For year filter: only fills gaps within data range
 */
function fillMissingDaysAuth(data) {
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
        return data;
    }

    const keys = Object.keys(data).sort();
    const minDay = keys[0];
    const currentDay = getCurrentDayString();
    const maxDay = shouldExtendToToday() && keys[keys.length - 1] < currentDay
        ? currentDay
        : keys[keys.length - 1];

    const filled = {};
    let current = new Date(minDay + 'T00:00:00');
    const end = new Date(maxDay + 'T00:00:00');

    while (current <= end) {
        const dayStr = current.getFullYear() + '-' +
                       String(current.getMonth() + 1).padStart(2, '0') + '-' +
                       String(current.getDate()).padStart(2, '0');
        if (data[dayStr] !== undefined) {
            filled[dayStr] = data[dayStr];
        } else {
            filled[dayStr] = { logins: 0, failed: 0 };
        }
        current.setDate(current.getDate() + 1);
    }

    return filled;
}

/**
 * Fill missing days for Chart.js format data {labels: [], datasets: [{data: []}]}
 * - For days/all-time filter: extends to today
 * - For year filter: only fills gaps within data range
 */
function fillMissingDaysChartJS(data) {
    if (!data || !data.labels || data.labels.length === 0) {
        return data;
    }

    const sortedLabels = [...data.labels].sort();
    const minDay = sortedLabels[0];
    const currentDay = getCurrentDayString();
    const maxDay = shouldExtendToToday() && sortedLabels[sortedLabels.length - 1] < currentDay
        ? currentDay
        : sortedLabels[sortedLabels.length - 1];

    const dataMap = {};
    data.labels.forEach((label, idx) => {
        dataMap[label] = data.datasets.map(ds => ds.data[idx] || 0);
    });

    const newLabels = [];
    const newDataArrays = data.datasets.map(() => []);

    let current = new Date(minDay + 'T00:00:00');
    const end = new Date(maxDay + 'T00:00:00');

    while (current <= end) {
        const dayStr = current.getFullYear() + '-' +
                       String(current.getMonth() + 1).padStart(2, '0') + '-' +
                       String(current.getDate()).padStart(2, '0');
        newLabels.push(dayStr);

        if (dataMap[dayStr]) {
            dataMap[dayStr].forEach((val, dsIdx) => {
                newDataArrays[dsIdx].push(val);
            });
        } else {
            newDataArrays.forEach(arr => arr.push(0));
        }
        current.setDate(current.getDate() + 1);
    }

    return {
        labels: newLabels,
        datasets: data.datasets.map((ds, idx) => ({
            ...ds,
            data: newDataArrays[idx]
        }))
    };
}

/**
 * Parse week string (YYYY-Www) to Date object (Monday of that week)
 */
function parseWeekString(weekStr) {
    const match = weekStr.match(/^(\d{4})-W(\d{2})$/);
    if (!match) return null;
    const year = parseInt(match[1], 10);
    const week = parseInt(match[2], 10);
    const jan4 = new Date(year, 0, 4);
    const dayOfWeek = jan4.getDay() || 7;
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
    return monday;
}

/**
 * Convert Date to week string (YYYY-Www)
 */
function dateToWeekString(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const year = d.getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return year + '-W' + String(weekNo).padStart(2, '0');
}

/**
 * Fill missing weeks with zeros
 * - For days/all-time filter: extends to current week
 * - For year filter: only fills gaps within data range
 */
function fillMissingWeeks(data) {
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
        return data;
    }

    const keys = Object.keys(data).sort();
    const minWeek = keys[0];
    const currentWeek = getCurrentWeekString();
    const maxWeek = shouldExtendToToday() && keys[keys.length - 1] < currentWeek
        ? currentWeek
        : keys[keys.length - 1];

    const filled = {};
    let current = parseWeekString(minWeek);
    const end = parseWeekString(maxWeek);

    if (!current || !end) return data;

    while (current <= end) {
        const weekStr = dateToWeekString(current);
        filled[weekStr] = data[weekStr] !== undefined ? data[weekStr] : 0;
        current.setDate(current.getDate() + 7);
    }

    return filled;
}

/**
 * Fill missing weeks with zeros for velocity trend data (with moving_avg)
 * - For days/all-time filter: extends to current week
 * - For year filter: only fills gaps within data range
 */
function fillMissingWeeksVelocity(data) {
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
        return data;
    }

    const keys = Object.keys(data).sort();
    const minWeek = keys[0];
    const currentWeek = getCurrentWeekString();
    const maxWeek = shouldExtendToToday() && keys[keys.length - 1] < currentWeek
        ? currentWeek
        : keys[keys.length - 1];

    const filled = {};
    let current = parseWeekString(minWeek);
    const end = parseWeekString(maxWeek);

    if (!current || !end) return data;

    while (current <= end) {
        const weekStr = dateToWeekString(current);
        if (data[weekStr] !== undefined) {
            filled[weekStr] = data[weekStr];
        } else {
            filled[weekStr] = { count: 0, moving_avg: null };
        }
        current.setDate(current.getDate() + 7);
    }

    // Recalculate moving averages for filled data
    const filledKeys = Object.keys(filled).sort();
    const counts = filledKeys.map(k => filled[k].count);
    for (let i = 0; i < filledKeys.length; i++) {
        if (i < 3) {
            filled[filledKeys[i]].moving_avg = null;
        } else {
            const sum = counts[i] + counts[i-1] + counts[i-2] + counts[i-3];
            filled[filledKeys[i]].moving_avg = sum / 4;
        }
    }

    return filled;
}

/**
 * Fill missing months with zeros
 * - For days/all-time filter: extends to current month
 * - For year filter: only fills gaps within data range
 */
function fillMissingMonths(data) {
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
        return data;
    }

    const keys = Object.keys(data).sort();
    const minMonth = keys[0];
    const currentMonth = getCurrentMonthString();
    const maxMonth = shouldExtendToToday() && keys[keys.length - 1] < currentMonth
        ? currentMonth
        : keys[keys.length - 1];

    const filled = {};
    const [startYear, startMonth] = minMonth.split('-').map(Number);
    const [endYear, endMonth] = maxMonth.split('-').map(Number);

    let year = startYear;
    let month = startMonth;

    while (year < endYear || (year === endYear && month <= endMonth)) {
        const monthStr = year + '-' + String(month).padStart(2, '0');
        filled[monthStr] = data[monthStr] !== undefined ? data[monthStr] : 0;
        month++;
        if (month > 12) {
            month = 1;
            year++;
        }
    }

    return filled;
}

/**
 * Fill missing months with zeros for multi-series data (with before/after structure)
 * - For days/all-time filter: extends to current month
 * - For year filter: only fills gaps within data range
 */
function fillMissingMonthsMultiSeries(data) {
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
        return data;
    }

    const keys = Object.keys(data).sort();
    const minMonth = keys[0];
    const currentMonth = getCurrentMonthString();
    const maxMonth = shouldExtendToToday() && keys[keys.length - 1] < currentMonth
        ? currentMonth
        : keys[keys.length - 1];

    const filled = {};
    const [startYear, startMonth] = minMonth.split('-').map(Number);
    const [endYear, endMonth] = maxMonth.split('-').map(Number);

    let year = startYear;
    let month = startMonth;

    while (year < endYear || (year === endYear && month <= endMonth)) {
        const monthStr = year + '-' + String(month).padStart(2, '0');
        if (data[monthStr] !== undefined) {
            filled[monthStr] = data[monthStr];
        } else {
            filled[monthStr] = { before: 0, after: 0 };
        }
        month++;
        if (month > 12) {
            month = 1;
            year++;
        }
    }

    return filled;
}

/**
 * Fill missing months with zeros for creation/modification data
 * - For days/all-time filter: extends to current month
 * - For year filter: only fills gaps within data range
 */
function fillMissingMonthsCreationMod(data) {
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
        return data;
    }

    const keys = Object.keys(data).sort();
    const minMonth = keys[0];
    const currentMonth = getCurrentMonthString();
    const maxMonth = shouldExtendToToday() && keys[keys.length - 1] < currentMonth
        ? currentMonth
        : keys[keys.length - 1];

    const filled = {};
    const [startYear, startMonth] = minMonth.split('-').map(Number);
    const [endYear, endMonth] = maxMonth.split('-').map(Number);

    let year = startYear;
    let month = startMonth;

    while (year < endYear || (year === endYear && month <= endMonth)) {
        const monthStr = year + '-' + String(month).padStart(2, '0');
        if (data[monthStr] !== undefined) {
            filled[monthStr] = data[monthStr];
        } else {
            filled[monthStr] = { creations: 0, modifications: 0 };
        }
        month++;
        if (month > 12) {
            month = 1;
            year++;
        }
    }

    return filled;
}

/**
 * Fill missing months with zeros for fact completeness data
 * - For days/all-time filter: extends to current month
 * - For year filter: only fills gaps within data range
 */
function fillMissingMonthsFactCompleteness(data) {
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
        return data;
    }

    const keys = Object.keys(data).sort();
    const minMonth = keys[0];
    const currentMonth = getCurrentMonthString();
    const maxMonth = shouldExtendToToday() && keys[keys.length - 1] < currentMonth
        ? currentMonth
        : keys[keys.length - 1];

    const filled = {};
    const [startYear, startMonth] = minMonth.split('-').map(Number);
    const [endYear, endMonth] = maxMonth.split('-').map(Number);

    let year = startYear;
    let month = startMonth;

    while (year < endYear || (year === endYear && month <= endMonth)) {
        const monthStr = year + '-' + String(month).padStart(2, '0');
        if (data[monthStr] !== undefined) {
            filled[monthStr] = data[monthStr];
        } else {
            filled[monthStr] = { before_avg: 0, after_avg: 0, net_gain: 0 };
        }
        month++;
        if (month > 12) {
            month = 1;
            year++;
        }
    }

    return filled;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// Helper: Translate record types
function translateRecordType(key) {
    const translations = {
        'Individual': LensT.individual,
        'Family': LensT.family,
        'Source': LensT.source,
        'Repository': LensT.repository,
        'Media object': LensT.media,
        'Note': LensT.note,
        'Location': LensT.location,
        'Submitter': LensT.submitter,
        'Submission': LensT.submission,
        'Header': LensT.header,
        'Other': LensT.other
    };
    return translations[key] || key;
}

// Global function to update year filter button display
function updateYearFilterDisplay() {
    const yearCheckboxes = document.querySelectorAll('.year-checkbox');
    const yearFilterButtonText = document.getElementById('yearFilterButtonText');
    const yearFilterCount = document.getElementById('yearFilterCount');

    if (!yearFilterButtonText || !yearFilterCount) return;

    const selected = Array.from(yearCheckboxes).filter(cb => cb.checked);
    const count = selected.length;
    yearFilterCount.textContent = count;

    if (count === yearCheckboxes.length) {
        yearFilterButtonText.textContent = LensT.allYears;
    } else if (count === 0) {
        yearFilterButtonText.textContent = LensT.noYearsSelected;
    } else if (count === 1) {
        yearFilterButtonText.textContent = selected[0].value;
    } else {
        yearFilterButtonText.textContent = count + ' ' + LensT.years;
    }
}

// Function to aggregate multi-year data
function aggregateMultiYearData(multiYearStats, labelCount, labelGenerator) {
    const aggregated = [];
    const minValues = [];
    const maxValues = [];

    for (let i = 0; i < labelCount; i++) {
        const labelKey = labelGenerator(i);
        const values = [];

        for (const [year, data] of Object.entries(multiYearStats)) {
            const value = data[labelKey] || 0;
            if (value > 0) {
                values.push(value);
            }
        }

        if (values.length > 0) {
            const sum = values.reduce((a, b) => a + b, 0);
            const min = Math.min(...values);
            const max = Math.max(...values);

            aggregated.push(sum);
            minValues.push(min);
            maxValues.push(max);
        } else {
            aggregated.push(0);
            minValues.push(0);
            maxValues.push(0);
        }
    }

    return { aggregated, minValues, maxValues };
}

// User filter dropdown handling
function toggleAllUsers(checkbox) {
    var userCheckboxes = document.querySelectorAll('.user-checkbox');
    for (var i = 0; i < userCheckboxes.length; i++) {
        userCheckboxes[i].checked = checkbox.checked;
    }
}

// =============================================================================
// LOADING TIMER
// =============================================================================

let loadingTimerInterval = null;
let loadingStartTime = null;

function startLoadingTimer() {
    const timerElement = document.getElementById('spinnerTimer');
    loadingStartTime = Date.now();
    timerElement.textContent = '0s';

    loadingTimerInterval = setInterval(function() {
        const elapsed = Math.floor((Date.now() - loadingStartTime) / 1000);
        timerElement.textContent = elapsed + 's';
    }, 100);
}

function stopLoadingTimer() {
    if (loadingTimerInterval) {
        clearInterval(loadingTimerInterval);
        loadingTimerInterval = null;
    }
}

// =============================================================================
// BUTTON STATE
// =============================================================================

function updateActiveButton(days) {
    const allButtons = document.querySelectorAll('button[name="days"]');
    allButtons.forEach(function(button) {
        button.classList.remove('btn-primary');
        button.classList.add('btn-outline-secondary');
    });

    const activeButton = document.querySelector('button[name="days"][value="' + days + '"]');
    if (activeButton) {
        activeButton.classList.remove('btn-outline-secondary');
        activeButton.classList.add('btn-primary');
    }
}

// =============================================================================
// AGGREGATION MODE FUNCTIONS
// =============================================================================

function toggleAggregationMode(isAggregated, selectedYears = null) {
    const chartsExist = !!(dataContentChartInstances.hourChart ||
                          dataContentChartInstances.dayChart ||
                          dataContentChartInstances.dayOfMonthChart ||
                          dataContentChartInstances.monthChart);

    if (!chartsExist) {
        return;
    }

    if (!originalHourStats && !originalDayStats && !originalDayOfMonthStats && !originalMonthStats) {
        return;
    }

    if (dataContentChartInstances.hourChart && originalHourStats) {
        updateHourChartMode(isAggregated, selectedYears);
    }

    if (dataContentChartInstances.dayChart && originalDayStats) {
        updateDayChartMode(isAggregated, selectedYears);
    }

    if (dataContentChartInstances.dayOfMonthChart && originalDayOfMonthStats) {
        updateDayOfMonthChartMode(isAggregated, selectedYears);
    }

    if (dataContentChartInstances.monthChart && originalMonthStats) {
        updateMonthChartMode(isAggregated, selectedYears);
    }
}

function updateHourChartMode(isAggregated, selectedYears = null) {
    const hourLabels = Array.from({length: 24}, (_, i) => i.toString().padStart(2, '0'));

    if (isAggregated) {
        const aggregationAbsoluteBtn = document.getElementById('aggregationAbsolute');
        const aggregationType = aggregationAbsoluteBtn && aggregationAbsoluteBtn.classList.contains('btn-primary') ? 'absolute' : 'relative';

        let { aggregated, minValues, maxValues } = aggregateMultiYearData(
            originalHourStats,
            24,
            (i) => i.toString().padStart(2, '0')
        );

        if (aggregationType === 'relative') {
            const yearTotals = {};
            for (const [year, data] of Object.entries(originalHourStats)) {
                yearTotals[year] = Object.values(data).reduce((sum, val) => sum + val, 0);
            }

            const relativeMinValues = [];
            const relativeMaxValues = [];

            for (let i = 0; i < 24; i++) {
                const labelKey = i.toString().padStart(2, '0');
                const percentages = [];

                for (const [year, data] of Object.entries(originalHourStats)) {
                    const value = data[labelKey] || 0;
                    const yearTotal = yearTotals[year];
                    if (yearTotal > 0 && value > 0) {
                        percentages.push((value / yearTotal) * 100);
                    }
                }

                if (percentages.length > 0) {
                    relativeMinValues.push(Math.min(...percentages));
                    relativeMaxValues.push(Math.max(...percentages));
                } else {
                    relativeMinValues.push(0);
                    relativeMaxValues.push(0);
                }
            }

            const total = aggregated.reduce((sum, val) => sum + val, 0);
            if (total > 0) {
                aggregated = aggregated.map(val => (val / total) * 100);
            }

            minValues = relativeMinValues;
            maxValues = relativeMaxValues;
        }

        dataContentChartInstances.hourChart.data.labels = hourLabels;
        dataContentChartInstances.hourChart.data.datasets = [
            {
                label: aggregationType === 'relative' ? LensT.totalChangesPercent : LensT.totalChanges,
                data: aggregated,
                borderColor: 'rgb(54, 162, 235)',
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                fill: true,
                tension: 0.4,
                order: 1
            },
            {
                label: LensT.minMaxRangeAcrossYears,
                data: maxValues,
                borderColor: 'transparent',
                backgroundColor: 'rgba(54, 162, 235, 0.15)',
                fill: '+1',
                pointRadius: 0,
                tension: 0.4,
                order: 2
            },
            {
                label: '',
                data: minValues,
                borderColor: 'transparent',
                backgroundColor: 'rgba(54, 162, 235, 0.15)',
                fill: false,
                pointRadius: 0,
                tension: 0.4,
                order: 2
            }
        ];
        dataContentChartInstances.hourChart.options.scales.y.title.text = aggregationType === 'relative'
            ? LensT.percentageOfChanges
            : LensT.numberOfChanges;
    } else {
        const datasets = [];
        let colorIndex = 0;

        const yearsToShow = selectedYears && selectedYears.length > 0
            ? selectedYears
            : Object.keys(originalHourStats);

        for (const [year, hours] of Object.entries(originalHourStats)) {
            if (selectedYears && selectedYears.length > 0 && !selectedYears.includes(String(year))) {
                continue;
            }

            const hourData = [];
            for (let h = 0; h < 24; h++) {
                const hourKey = h.toString().padStart(2, '0');
                hourData.push(hours[hourKey] || 0);
            }

            const color = yearColors[colorIndex % yearColors.length];
            datasets.push({
                label: year,
                data: hourData,
                borderColor: color,
                backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.2)'),
                fill: false,
                tension: 0.4
            });
            colorIndex++;
        }

        dataContentChartInstances.hourChart.data.labels = hourLabels;
        dataContentChartInstances.hourChart.data.datasets = datasets;
        dataContentChartInstances.hourChart.options.scales.y.title.text = LensT.numberOfChanges;
    }

    dataContentChartInstances.hourChart.update();
}

function updateDayChartMode(isAggregated, selectedYears = null) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayTranslations = {
        'Sunday': LensT.sunday,
        'Monday': LensT.monday,
        'Tuesday': LensT.tuesday,
        'Wednesday': LensT.wednesday,
        'Thursday': LensT.thursday,
        'Friday': LensT.friday,
        'Saturday': LensT.saturday
    };
    const dayLabels = dayNames.map(day => dayTranslations[day]);

    if (isAggregated) {
        const aggregationAbsoluteBtn = document.getElementById('aggregationAbsolute');
        const aggregationType = aggregationAbsoluteBtn && aggregationAbsoluteBtn.classList.contains('btn-primary') ? 'absolute' : 'relative';

        let { aggregated, minValues, maxValues } = aggregateMultiYearData(
            originalDayStats,
            7,
            (i) => dayNames[i]
        );

        if (aggregationType === 'relative') {
            const yearTotals = {};
            for (const [year, data] of Object.entries(originalDayStats)) {
                yearTotals[year] = Object.values(data).reduce((sum, val) => sum + val, 0);
            }

            const relativeMinValues = [];
            const relativeMaxValues = [];

            for (let i = 0; i < 7; i++) {
                const labelKey = dayNames[i];
                const percentages = [];

                for (const [year, data] of Object.entries(originalDayStats)) {
                    const value = data[labelKey] || 0;
                    const yearTotal = yearTotals[year];
                    if (yearTotal > 0 && value > 0) {
                        percentages.push((value / yearTotal) * 100);
                    }
                }

                if (percentages.length > 0) {
                    relativeMinValues.push(Math.min(...percentages));
                    relativeMaxValues.push(Math.max(...percentages));
                } else {
                    relativeMinValues.push(0);
                    relativeMaxValues.push(0);
                }
            }

            const total = aggregated.reduce((sum, val) => sum + val, 0);
            if (total > 0) {
                aggregated = aggregated.map(val => (val / total) * 100);
            }

            minValues = relativeMinValues;
            maxValues = relativeMaxValues;
        }

        dataContentChartInstances.dayChart.data.labels = dayLabels;
        dataContentChartInstances.dayChart.data.datasets = [
            {
                label: aggregationType === 'relative' ? LensT.totalChangesPercent : LensT.totalChanges,
                data: aggregated,
                borderColor: 'rgb(255, 99, 132)',
                backgroundColor: 'rgba(255, 99, 132, 0.2)',
                fill: true,
                tension: 0.4,
                order: 1
            },
            {
                label: LensT.minMaxRangeAcrossYears,
                data: maxValues,
                borderColor: 'transparent',
                backgroundColor: 'rgba(255, 99, 132, 0.15)',
                fill: '+1',
                pointRadius: 0,
                tension: 0.4,
                order: 2
            },
            {
                label: '',
                data: minValues,
                borderColor: 'transparent',
                backgroundColor: 'rgba(255, 99, 132, 0.15)',
                fill: false,
                pointRadius: 0,
                tension: 0.4,
                order: 2
            }
        ];
        dataContentChartInstances.dayChart.options.scales.y.title.text = aggregationType === 'relative'
            ? LensT.percentageOfChanges
            : LensT.numberOfChanges;
    } else {
        const datasets = [];
        let colorIndex = 0;

        for (const [year, days] of Object.entries(originalDayStats)) {
            if (selectedYears && selectedYears.length > 0 && !selectedYears.includes(String(year))) {
                continue;
            }

            const dayData = dayNames.map(day => days[day] || 0);

            const color = yearColors[colorIndex % yearColors.length];
            datasets.push({
                label: year,
                data: dayData,
                borderColor: color,
                backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.2)'),
                fill: false,
                tension: 0.4
            });
            colorIndex++;
        }

        dataContentChartInstances.dayChart.data.labels = dayLabels;
        dataContentChartInstances.dayChart.data.datasets = datasets;
        dataContentChartInstances.dayChart.options.scales.y.title.text = LensT.numberOfChanges;
    }

    dataContentChartInstances.dayChart.update();
}

function updateDayOfMonthChartMode(isAggregated, selectedYears = null) {
    const dayOfMonthLabels = Array.from({length: 31}, (_, i) => (i + 1).toString());

    if (isAggregated) {
        const aggregationAbsoluteBtn = document.getElementById('aggregationAbsolute');
        const aggregationType = aggregationAbsoluteBtn && aggregationAbsoluteBtn.classList.contains('btn-primary') ? 'absolute' : 'relative';

        let { aggregated, minValues, maxValues } = aggregateMultiYearData(
            originalDayOfMonthStats,
            31,
            (i) => (i + 1).toString().padStart(2, '0')
        );

        if (aggregationType === 'relative') {
            const yearTotals = {};
            for (const [year, data] of Object.entries(originalDayOfMonthStats)) {
                yearTotals[year] = Object.values(data).reduce((sum, val) => sum + val, 0);
            }

            const relativeMinValues = [];
            const relativeMaxValues = [];

            for (let i = 0; i < 31; i++) {
                const labelKey = (i + 1).toString().padStart(2, '0');
                const percentages = [];

                for (const [year, data] of Object.entries(originalDayOfMonthStats)) {
                    const value = data[labelKey] || 0;
                    const yearTotal = yearTotals[year];
                    if (yearTotal > 0 && value > 0) {
                        percentages.push((value / yearTotal) * 100);
                    }
                }

                if (percentages.length > 0) {
                    relativeMinValues.push(Math.min(...percentages));
                    relativeMaxValues.push(Math.max(...percentages));
                } else {
                    relativeMinValues.push(0);
                    relativeMaxValues.push(0);
                }
            }

            const total = aggregated.reduce((sum, val) => sum + val, 0);
            if (total > 0) {
                aggregated = aggregated.map(val => (val / total) * 100);
            }

            minValues = relativeMinValues;
            maxValues = relativeMaxValues;
        }

        dataContentChartInstances.dayOfMonthChart.data.labels = dayOfMonthLabels;
        dataContentChartInstances.dayOfMonthChart.data.datasets = [
            {
                label: aggregationType === 'relative' ? LensT.totalChangesPercent : LensT.totalChanges,
                data: aggregated,
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                fill: true,
                tension: 0.4,
                order: 1
            },
            {
                label: LensT.minMaxRangeAcrossYears,
                data: maxValues,
                borderColor: 'transparent',
                backgroundColor: 'rgba(75, 192, 192, 0.15)',
                fill: '+1',
                pointRadius: 0,
                tension: 0.4,
                order: 2
            },
            {
                label: '',
                data: minValues,
                borderColor: 'transparent',
                backgroundColor: 'rgba(75, 192, 192, 0.15)',
                fill: false,
                pointRadius: 0,
                tension: 0.4,
                order: 2
            }
        ];
        dataContentChartInstances.dayOfMonthChart.options.scales.y.title.text = aggregationType === 'relative'
            ? LensT.percentageOfChanges
            : LensT.numberOfChanges;
    } else {
        const datasets = [];
        let colorIndex = 0;

        for (const [year, days] of Object.entries(originalDayOfMonthStats)) {
            if (selectedYears && selectedYears.length > 0 && !selectedYears.includes(String(year))) {
                continue;
            }

            const dayData = [];
            for (let d = 1; d <= 31; d++) {
                const dayKey = d.toString().padStart(2, '0');
                dayData.push(days[dayKey] || 0);
            }

            const color = yearColors[colorIndex % yearColors.length];
            datasets.push({
                label: year,
                data: dayData,
                borderColor: color,
                backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.2)'),
                fill: false,
                tension: 0.4
            });
            colorIndex++;
        }

        dataContentChartInstances.dayOfMonthChart.data.labels = dayOfMonthLabels;
        dataContentChartInstances.dayOfMonthChart.data.datasets = datasets;
        dataContentChartInstances.dayOfMonthChart.options.scales.y.title.text = LensT.numberOfChanges;
    }

    dataContentChartInstances.dayOfMonthChart.update();
}

function updateMonthChartMode(isAggregated, selectedYears = null) {
    const monthLabels = [
        LensT.january, LensT.february, LensT.march,
        LensT.april, LensT.may, LensT.june,
        LensT.july, LensT.august, LensT.september,
        LensT.october, LensT.november, LensT.december
    ];

    if (isAggregated) {
        const aggregationAbsoluteBtn = document.getElementById('aggregationAbsolute');
        const aggregationType = aggregationAbsoluteBtn && aggregationAbsoluteBtn.classList.contains('btn-primary') ? 'absolute' : 'relative';

        let { aggregated, minValues, maxValues } = aggregateMultiYearData(
            originalMonthStats,
            12,
            (i) => (i + 1).toString().padStart(2, '0')
        );

        if (aggregationType === 'relative') {
            const yearTotals = {};
            for (const [year, data] of Object.entries(originalMonthStats)) {
                yearTotals[year] = Object.values(data).reduce((sum, val) => sum + val, 0);
            }

            const relativeMinValues = [];
            const relativeMaxValues = [];

            for (let i = 0; i < 12; i++) {
                const labelKey = (i + 1).toString().padStart(2, '0');
                const percentages = [];

                for (const [year, data] of Object.entries(originalMonthStats)) {
                    const value = data[labelKey] || 0;
                    const yearTotal = yearTotals[year];
                    if (yearTotal > 0 && value > 0) {
                        percentages.push((value / yearTotal) * 100);
                    }
                }

                if (percentages.length > 0) {
                    relativeMinValues.push(Math.min(...percentages));
                    relativeMaxValues.push(Math.max(...percentages));
                } else {
                    relativeMinValues.push(0);
                    relativeMaxValues.push(0);
                }
            }

            const total = aggregated.reduce((sum, val) => sum + val, 0);
            if (total > 0) {
                aggregated = aggregated.map(val => (val / total) * 100);
            }

            minValues = relativeMinValues;
            maxValues = relativeMaxValues;
        }

        dataContentChartInstances.monthChart.data.labels = monthLabels;
        dataContentChartInstances.monthChart.data.datasets = [
            {
                label: aggregationType === 'relative' ? LensT.totalChangesPercent : LensT.totalChanges,
                data: aggregated,
                borderColor: 'rgb(153, 102, 255)',
                backgroundColor: 'rgba(153, 102, 255, 0.2)',
                fill: true,
                tension: 0.4,
                order: 1
            },
            {
                label: LensT.minMaxRangeAcrossYears,
                data: maxValues,
                borderColor: 'transparent',
                backgroundColor: 'rgba(153, 102, 255, 0.15)',
                fill: '+1',
                pointRadius: 0,
                tension: 0.4,
                order: 2
            },
            {
                label: '',
                data: minValues,
                borderColor: 'transparent',
                backgroundColor: 'rgba(153, 102, 255, 0.15)',
                fill: false,
                pointRadius: 0,
                tension: 0.4,
                order: 2
            }
        ];
        dataContentChartInstances.monthChart.options.scales.y.title.text = aggregationType === 'relative'
            ? LensT.percentageOfChanges
            : LensT.numberOfChanges;
    } else {
        const datasets = [];
        let colorIndex = 0;

        for (const [year, months] of Object.entries(originalMonthStats)) {
            if (selectedYears && selectedYears.length > 0 && !selectedYears.includes(String(year))) {
                continue;
            }

            const monthData = [];
            for (let m = 1; m <= 12; m++) {
                const monthKey = m.toString().padStart(2, '0');
                monthData.push(months[monthKey] || 0);
            }

            const color = yearColors[colorIndex % yearColors.length];
            datasets.push({
                label: year,
                data: monthData,
                borderColor: color,
                backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.2)'),
                fill: false,
                tension: 0.4
            });
            colorIndex++;
        }

        dataContentChartInstances.monthChart.data.labels = monthLabels;
        dataContentChartInstances.monthChart.data.datasets = datasets;
        dataContentChartInstances.monthChart.options.scales.y.title.text = LensT.numberOfChanges;
    }

    dataContentChartInstances.monthChart.update();
}

// =============================================================================
// UNIFIED CHART FACTORY
// =============================================================================

function createUnifiedChart(config, chartInstancesContainer = dataContentChartInstances) {
    const {
        instanceKey,
        canvasId,
        overlayId,
        data,
        hasDataCheck = (d) => {
            if (!d) return false;
            if (Array.isArray(d)) return d.length > 0;
            return Object.keys(d).length > 0;
        },
        buildChartConfig
    } = config;

    const ctx = document.getElementById(canvasId);
    if (!ctx) {
        return null;
    }

    // Destroy existing chart instance before creating new one
    if (chartInstancesContainer[instanceKey]) {
        chartInstancesContainer[instanceKey].destroy();
        delete chartInstancesContainer[instanceKey];
    }

    const hasData = hasDataCheck(data);
    const overlay = overlayId ? document.getElementById(overlayId) : null;

    // ALWAYS hide overlay first
    if (overlay) overlay.style.display = 'none';

    if (hasData) {
        const chartConfig = buildChartConfig(data);
        chartInstancesContainer[instanceKey] = new Chart(ctx, chartConfig);
        return chartInstancesContainer[instanceKey];
    } else {
        if (overlay) overlay.style.display = 'flex';
        return null;
    }
}

// =============================================================================
// DOM CONTENT LOADED - FORM HANDLING & INITIALIZATION
// =============================================================================

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('chartsFilterForm');
    if (!form) return;

    // Handle preset button clicks
    const presetButtons = form.querySelectorAll('button[name="days"]');
    const daysButtons = document.querySelectorAll('button[name="days"]');
    const yearCheckboxes = document.querySelectorAll('.year-checkbox');

    // Flag to prevent year checkbox change event when programmatically unchecked by days button
    let suppressYearChangeEvent = false;

    presetButtons.forEach(function(button) {
        button.addEventListener('click', function(e) {
            e.preventDefault();

            // Update button styles
            daysButtons.forEach(btn => {
                btn.classList.remove('btn-primary');
                btn.classList.add('btn-outline-secondary');
            });
            button.classList.remove('btn-outline-secondary');
            button.classList.add('btn-primary');

            // Update hidden days input
            const daysHidden = form.querySelector('input[name="days"][type="hidden"]');
            if (daysHidden) {
                daysHidden.value = button.value;
            }

            // Clear custom input
            const customInput = document.getElementById('customDays');
            if (customInput) customInput.value = '';

            // Deselect all year checkboxes (mutual exclusion)
            suppressYearChangeEvent = true;
            yearCheckboxes.forEach(cb => cb.checked = false);
            suppressYearChangeEvent = false;
            updateYearFilterDisplay();

            // Load data via AJAX
            const activeTab = document.querySelector('.tab-pane.active');

            if (activeTab && activeTab.id === 'editor-patterns') {
                loadWorkPatternsData();
            } else if (activeTab && activeTab.id === 'activity-log') {
                loadAllActivityLogCharts(new FormData(form));
            } else if (activeTab && activeTab.id === 'custom-heatmap') {
                // Refresh heatmap only if already generated
                if (typeof generateHeatmap === 'function' && currentHeatmapConfig !== null) {
                    generateHeatmap();
                }
            } else {
                loadChartsData(new FormData(form));
            }
        });
    });

    // Handle custom days input
    const customInput = document.getElementById('customDays');
    const applyButton = document.getElementById('applyCustomDays');

    if (customInput && applyButton) {
        function submitCustomDays() {
            const value = customInput.value;
            if (!value || value < 1) return;

            const daysHidden = form.querySelector('input[name="days"][type="hidden"]');
            if (daysHidden) {
                daysHidden.value = value;
            }

            suppressYearChangeEvent = true;
            yearCheckboxes.forEach(cb => cb.checked = false);
            suppressYearChangeEvent = false;

            const activeTab = document.querySelector('.tab-pane.active');
            if (activeTab && activeTab.id === 'editor-patterns') {
                loadWorkPatternsData();
            } else if (activeTab && activeTab.id === 'activity-log') {
                loadAllActivityLogCharts(new FormData(form));
            } else if (activeTab && activeTab.id === 'custom-heatmap') {
                // Refresh heatmap only if already generated
                if (typeof generateHeatmap === 'function' && currentHeatmapConfig !== null) {
                    generateHeatmap();
                }
            } else {
                loadChartsData(new FormData(form));
            }
        }

        applyButton.addEventListener('click', submitCustomDays);
        customInput.addEventListener('keypress', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                submitCustomDays();
            }
        });
    }

    // Handle user filter form submission
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        loadChartsData(new FormData(form));
    });

    // Year checkboxes - reload data when changed
    yearCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            if (suppressYearChangeEvent) return;

            const anyYearChecked = Array.from(yearCheckboxes).some(cb => cb.checked);
            if (anyYearChecked) {
                daysButtons.forEach(btn => {
                    btn.classList.remove('btn-primary');
                    btn.classList.add('btn-outline-secondary');
                });
            }

            updateYearFilterDisplay();

            const activeTab = document.querySelector('.tab-pane.active');
            if (activeTab && activeTab.id === 'editor-patterns') {
                loadWorkPatternsData();
            } else if (activeTab && activeTab.id === 'activity-log') {
                loadAllActivityLogCharts(new FormData(form));
            } else if (activeTab && activeTab.id === 'custom-heatmap') {
                // Refresh heatmap only if already generated
                if (typeof generateHeatmap === 'function' && currentHeatmapConfig !== null) {
                    generateHeatmap();
                }
            } else {
                loadChartsData(new FormData(form));
            }
        });
    });

    // Tab switching handlers
    const dataTab = document.getElementById('data-tab');
    const editorTab = document.getElementById('editor-tab');
    const activityTab = document.getElementById('activity-log-tab');

    if (dataTab) {
        dataTab.addEventListener('shown.bs.tab', function() {
            loadChartsData(new FormData(form));
        });
    }

    if (editorTab) {
        editorTab.addEventListener('shown.bs.tab', function(event) {
            loadWorkPatternsData();
        });
    }

    if (activityTab) {
        activityTab.addEventListener('shown.bs.tab', function() {
            if (typeof loadAllActivityLogCharts === 'function') {
                loadAllActivityLogCharts(new FormData(form));
            }
        });
    }

    const heatmapTab = document.getElementById('heatmap-tab');
    if (heatmapTab) {
        heatmapTab.addEventListener('shown.bs.tab', function() {
            // Refresh heatmap only if already generated
            if (typeof generateHeatmap === 'function' && currentHeatmapConfig !== null) {
                generateHeatmap();
            }
        });
    }

    // AUTO-LOAD: Load Tab 1 data on page load
    loadChartsData(new FormData(form));
});

// Aggregation checkbox event listener
document.addEventListener('DOMContentLoaded', function() {
    const aggregateCheckbox = document.getElementById('aggregateDataCheckbox');
    const helperText = document.getElementById('aggregateHelperText');
    const aggregationTypeContainer = document.getElementById('aggregationTypeContainer');

    // Initialize original stats from PHP data
    originalHourStats = LensConfig.initialData.hourStats;
    originalDayStats = LensConfig.initialData.dayStats;
    originalDayOfMonthStats = LensConfig.initialData.dayOfMonthStats;
    originalMonthStats = LensConfig.initialData.monthStats;

    if (aggregateCheckbox) {
        aggregateCheckbox.addEventListener('change', function() {
            if (this.checked) {
                helperText.textContent = LensT.showsCombinedDataWithRangeShading;
                if (aggregationTypeContainer) aggregationTypeContainer.style.display = 'block';
            } else {
                helperText.textContent = LensT.showsDataSplitByIndividualYears;
                if (aggregationTypeContainer) aggregationTypeContainer.style.display = 'none';
            }

            let selectedYears = null;
            if (!this.checked) {
                const yearCheckboxes = document.querySelectorAll('.year-checkbox');
                selectedYears = Array.from(yearCheckboxes)
                    .filter(cb => cb.checked)
                    .map(cb => cb.value);
            }
            toggleAggregationMode(this.checked, selectedYears);
        });
    }

    // Year checkbox listeners for aggregation
    const yearCheckboxes = document.querySelectorAll('.year-checkbox');
    yearCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const aggregateCheckbox = document.getElementById('aggregateDataCheckbox');
            if (aggregateCheckbox && !aggregateCheckbox.checked) {
                const selectedYears = Array.from(document.querySelectorAll('.year-checkbox:checked'))
                    .map(cb => cb.value);
                toggleAggregationMode(false, selectedYears);
            }
        });
    });
});

// User filter dropdown handling
document.addEventListener('DOMContentLoaded', function() {
    var dropdownButton = document.getElementById('userFilterButton');
    var dropdown = document.getElementById('userFilterDropdown');

    if (!dropdownButton || !dropdown) return;

    dropdownButton.addEventListener('click', function(event) {
        event.stopPropagation();
        dropdown.classList.toggle('show');
    });

    dropdown.addEventListener('click', function(event) {
        event.stopPropagation();
    });

    document.addEventListener('click', function() {
        if (dropdown.classList.contains('show')) {
            dropdown.classList.remove('show');
        }
    });

    var userCheckboxes = document.querySelectorAll('.user-checkbox');
    var allCheckbox = document.getElementById('user_all');

    if (allCheckbox && userCheckboxes.length > 0) {
        for (var i = 0; i < userCheckboxes.length; i++) {
            userCheckboxes[i].addEventListener('change', function() {
                var allChecked = true;
                for (var j = 0; j < userCheckboxes.length; j++) {
                    if (!userCheckboxes[j].checked) {
                        allChecked = false;
                        break;
                    }
                }
                allCheckbox.checked = allChecked;
            });
        }

        var allChecked = true;
        for (var i = 0; i < userCheckboxes.length; i++) {
            if (!userCheckboxes[i].checked) {
                allChecked = false;
                break;
            }
        }
        allCheckbox.checked = allChecked;
    }

    // Year Filter Dropdown Logic
    const yearFilterButton = document.getElementById('yearFilterButton');
    const yearFilterDropdown = document.getElementById('yearFilterDropdown');
    const yearSelectAll = document.getElementById('yearSelectAll');
    const yearDeselectAll = document.getElementById('yearDeselectAll');
    const yearCheckboxes = document.querySelectorAll('.year-checkbox');

    if (yearFilterButton && yearFilterDropdown) {
        yearFilterButton.addEventListener('click', function(e) {
            e.stopPropagation();
            yearFilterDropdown.classList.toggle('show');
        });

        document.addEventListener('click', function(e) {
            if (!yearFilterButton.contains(e.target) && !yearFilterDropdown.contains(e.target)) {
                yearFilterDropdown.classList.remove('show');
            }
        });

        if (yearSelectAll) {
            yearSelectAll.addEventListener('click', function() {
                yearCheckboxes.forEach(function(checkbox) {
                    checkbox.checked = true;
                });
                updateYearFilterDisplay();
                updateChartsWithYearFilter();
            });
        }

        if (yearDeselectAll) {
            yearDeselectAll.addEventListener('click', function() {
                yearCheckboxes.forEach(function(checkbox) {
                    checkbox.checked = false;
                });
                updateYearFilterDisplay();
                updateChartsWithYearFilter();
            });
        }
    }

    // Aggregation Type Toggle (Absolute/Relative)
    const aggregationAbsoluteBtn = document.getElementById('aggregationAbsolute');
    const aggregationRelativeBtn = document.getElementById('aggregationRelative');

    if (aggregationAbsoluteBtn && aggregationRelativeBtn) {
        aggregationAbsoluteBtn.addEventListener('click', function() {
            aggregationAbsoluteBtn.classList.remove('btn-outline-secondary');
            aggregationAbsoluteBtn.classList.add('btn-primary');
            aggregationRelativeBtn.classList.remove('btn-primary');
            aggregationRelativeBtn.classList.add('btn-outline-secondary');

            const aggregateCheckbox = document.getElementById('aggregateDataCheckbox');
            if (aggregateCheckbox && aggregateCheckbox.checked) {
                toggleAggregationMode(true);
            }
        });

        aggregationRelativeBtn.addEventListener('click', function() {
            aggregationRelativeBtn.classList.remove('btn-outline-secondary');
            aggregationRelativeBtn.classList.add('btn-primary');
            aggregationAbsoluteBtn.classList.remove('btn-primary');
            aggregationAbsoluteBtn.classList.add('btn-outline-secondary');

            const aggregateCheckbox = document.getElementById('aggregateDataCheckbox');
            if (aggregateCheckbox && aggregateCheckbox.checked) {
                toggleAggregationMode(true);
            }
        });
    }

    function updateChartsWithYearFilter() {
        const aggregateCheckbox = document.getElementById('aggregateDataCheckbox');
        if (!aggregateCheckbox || aggregateCheckbox.checked) return;

        const yearCheckboxes = document.querySelectorAll('.year-checkbox');
        const selectedYears = Array.from(yearCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);

        toggleAggregationMode(false, selectedYears);
    }
});
