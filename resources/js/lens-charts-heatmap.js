// =============================================================================
// HEATMAP FUNCTIONALITY (Tab 3) - Lazy-loaded when Tab 3 is activated
// Dependencies: LensT, LensConfig, chartColors, createUnifiedChart (from lens-charts-common.js)
// =============================================================================

// Tab 3 (Custom Heatmap) chart instances
const heatmapChartInstances = {};

// Store current heatmap data for re-rendering
let currentHeatmapData = null;
let currentHeatmapConfig = null;

// Mapping of dimension keys to translated labels for axis titles
const dimensionLabels = {
    'hour': LensT.hour,
    'dayOfWeek': LensT.dayOfWeek,
    'dayOfMonth': LensT.dayOfMonth,
    'month': LensT.month,
    'year': LensT.year,
    'user': LensT.user,
    'recordType': LensT.recordType
};

// TomSelect instance for record search
let heatmapRecordsTomSelect = null;

/**
 * Pobiera kolory i style primary z aktualnego motywu poprzez inspekcję .btn-primary
 * Kopiuje wszystkie relevantne właściwości CSS dla pełnego matchingu z motywem
 * @returns {Object} Obiekt z właściwościami CSS do zastosowania
 */
function getThemePrimaryColors() {
    const existingBtn = document.querySelector('#generateHeatmap') ||
                        document.querySelector('.btn-primary');

    if (!existingBtn) {
        return {
            background: 'var(--bs-primary, #0d6efd)',
            color: 'white',
            borderRadius: '0.375rem',
            boxShadow: 'none',
            border: 'none',
            fontWeight: '400'
        };
    }

    const styles = window.getComputedStyle(existingBtn);
    const bgImage = styles.backgroundImage;
    const bgColor = styles.backgroundColor;

    // Sprawdź czy backgroundColor nie jest przezroczyste
    const isTransparent = !bgColor ||
                          bgColor === 'rgba(0, 0, 0, 0)' ||
                          bgColor === 'transparent';

    // Sprawdź czy jest gradient
    const hasGradient = bgImage && bgImage !== 'none' &&
                        bgImage.toLowerCase().includes('gradient');

    // Buduj wartość background
    let background;
    if (hasGradient && !isTransparent) {
        // Połącz gradient z background-color (CSS multi-layer background)
        // Gradient jako overlay na solid color - rozwiązuje problem przezroczystych gradientów
        background = bgImage + ', ' + bgColor;
    } else if (hasGradient) {
        // Tylko gradient (np. JustLight z pełnym gradientem)
        background = bgImage;
    } else if (!isTransparent) {
        // Tylko solid color
        background = bgColor;
    } else {
        // Fallback
        background = 'var(--bs-primary, #0d6efd)';
    }

    return {
        background: background,
        color: styles.color || 'white',
        borderRadius: styles.borderRadius || '0.375rem',
        boxShadow: (styles.boxShadow && styles.boxShadow !== 'none') ? styles.boxShadow : 'none',
        border: styles.border || 'none',
        fontWeight: styles.fontWeight || '400'
    };
}

// Initialize heatmap controls immediately (DOM is already ready when lazy-loaded)
(function initHeatmap() {
    // Generate heatmap button click
    const generateBtn = document.getElementById('generateHeatmap');
    if (generateBtn) {
        generateBtn.addEventListener('click', generateHeatmap);
    }

    // Validate axis combinations
    const heatmapX = document.getElementById('heatmapX');
    const heatmapY = document.getElementById('heatmapY');
    if (heatmapX && heatmapY) {
        heatmapX.addEventListener('change', validateAxisCombination);
        heatmapY.addEventListener('change', validateAxisCombination);
    }

    // Initialize unified record selector with TomSelect
    initRecordSelector();
})();

/**
 * Initialize TomSelect for unified record search (INDI, FAM, SOUR, etc.)
 */
function initRecordSelector() {
    const recordSelect = document.getElementById('heatmapRecords');
    if (!recordSelect || heatmapRecordsTomSelect) return;

    const searchUrl = recordSelect.dataset.searchUrl;
    if (!searchUrl) {
        console.warn('heatmapRecords: missing data-search-url attribute');
        return;
    }

    // Pobrać kolory z motywu dla stylowania wybranych elementów
    const themeColors = getThemePrimaryColors();

    heatmapRecordsTomSelect = new TomSelect('#heatmapRecords', {
        valueField: 'value',
        labelField: 'text',
        searchField: ['text', 'value'],
        optgroupField: 'optgroup',
        optgroupLabelField: 'optgroup',
        optgroupValueField: 'optgroup',
        lockOptgroupOrder: true,
        maxItems: null, // Allow multiple selections
        plugins: ['remove_button'],
        placeholder: recordSelect.getAttribute('placeholder') || '',
        highlight: false, // Disable automatic highlight to prevent raw HTML in results
        load: function(query, callback) {
            if (query.length < 2) {
                callback();
                return;
            }
            const url = searchUrl + (searchUrl.includes('?') ? '&' : '?') + 'query=' + encodeURIComponent(query);
            fetch(url)
                .then(response => response.json())
                .then(json => {
                    callback(json.data || []);
                })
                .catch(() => callback());
        },
        render: {
            option: function(data, escape) {
                return '<div class="d-flex align-items-center py-1">' +
                    '<span class="badge text-bg-secondary me-2" style="font-size:0.75em;min-width:40px">' + escape(data.type) + '</span>' +
                    '<span>' + escape(data.text) + '</span>' +
                '</div>';
            },
            item: function(data, escape) {
                const itemStyle = 'background:' + themeColors.background + ';' +
                                  'color:' + themeColors.color + ';' +
                                  'border-radius:' + themeColors.borderRadius + ';' +
                                  'box-shadow:' + themeColors.boxShadow + ';' +
                                  'border:' + themeColors.border + ';' +
                                  'font-weight:' + themeColors.fontWeight + ';';

                return '<div class="d-flex align-items-center px-2 py-1 me-1 mb-1" style="' + itemStyle + '">' +
                    '<span class="badge text-bg-light me-1" style="font-size:0.7em">' + escape(data.type) + '</span>' +
                    '<span>' + escape(data.text) + '</span>' +
                '</div>';
            },
            optgroup_header: function(data, escape) {
                return '<div class="optgroup-header fw-bold text-primary border-bottom pb-1 mb-1">' +
                    escape(data.optgroup) +
                '</div>';
            }
        }
    });
}

function validateAxisCombination() {
    const xAxis = document.getElementById('heatmapX').value;
    const yAxis = document.getElementById('heatmapY').value;
    const generateBtn = document.getElementById('generateHeatmap');

    // Disable same axis selection
    if (xAxis === yAxis) {
        generateBtn.disabled = true;
        generateBtn.title = LensT.xAndYAxesMustBeDifferent;
    } else {
        generateBtn.disabled = false;
        generateBtn.title = '';
    }
}

function generateHeatmap() {
    const xAxis = document.getElementById('heatmapX').value;
    const yAxis = document.getElementById('heatmapY').value;
    const measure = document.getElementById('heatmapMeasure').value;

    // Store config for potential re-use
    currentHeatmapConfig = { xAxis, yAxis, measure };

    // Get selected records from TomSelect (multi-select)
    const selectedRecords = heatmapRecordsTomSelect ? heatmapRecordsTomSelect.getValue() : [];

    // Build URL with global date filters (same as Tab 1/2/4)
    let url = LensConfig.heatmapEndpointUrl;
    const separator = url.includes('?') ? '&' : '?';
    url += separator + 'x=' + encodeURIComponent(xAxis);
    url += '&y=' + encodeURIComponent(yAxis);
    url += '&measure=' + encodeURIComponent(measure);

    // Apply global date filters (years or days)
    const selectedYears = Array.from(document.querySelectorAll('.year-checkbox:checked')).map(cb => cb.value);
    if (selectedYears.length > 0) {
        selectedYears.forEach(year => url += '&years[]=' + encodeURIComponent(year));
    } else {
        // Use days filter if no years selected
        const daysInput = document.querySelector('input[name="days"]');
        const days = daysInput ? daysInput.value : LensConfig.defaultDays;
        if (days && days > 0) {
            url += '&days=' + encodeURIComponent(days);
        }
    }

    // Apply global user filter from main form checkboxes
    const globalUsers = Array.from(document.querySelectorAll('.user-checkbox:checked')).map(cb => cb.value);
    if (globalUsers.length > 0) {
        globalUsers.forEach(u => url += '&users[]=' + encodeURIComponent(u));
    }

    // Add heatmap-specific filter for selected records (multi-select)
    if (selectedRecords.length > 0) {
        selectedRecords.forEach(xref => {
            url += '&records[]=' + encodeURIComponent(xref);
        });
    }

    // Show loading state
    const overlay = document.getElementById('heatmapChartNoData');
    if (overlay) {
        overlay.querySelector('p').textContent = LensT.loading;
        overlay.style.display = 'flex';
    }

    // Fetch data
    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }
            return response.text();
        })
        .then(text => {
            try {
                return JSON.parse(text);
            } catch (e) {
                throw new Error('Invalid JSON: ' + text.substring(0, 200));
            }
        })
        .then(data => {
            currentHeatmapData = data;
            renderHeatmap(data, xAxis, yAxis, measure);
        })
        .catch(error => {
            if (overlay) {
                overlay.querySelector('p').textContent = LensT.errorLoadingHeatmap + ': ' + error.message;
                overlay.style.display = 'flex';
            }
        });
}

/**
 * Get heatmap color based on value using logarithmic scale
 */
function getHeatmapColor(value, min, max) {
    if (max === min) return 'rgba(54, 162, 235, 0.5)';

    // Use logarithmic scale to handle extreme values better
    const logMin = Math.log(min + 1);
    const logMax = Math.log(max + 1);
    const logValue = Math.log(value + 1);

    const ratio = (logValue - logMin) / (logMax - logMin);

    // Color gradient from light to dark (white -> blue -> dark blue)
    const r = Math.round(255 - ratio * 201);  // 255 -> 54
    const g = Math.round(255 - ratio * 93);   // 255 -> 162
    const b = Math.round(255 - ratio * 20);   // 255 -> 235
    const alpha = 0.4 + ratio * 0.6;

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Render heatmap using createUnifiedChart() for consistency with other tabs
 */
function renderHeatmap(data, xAxis, yAxis, measure) {
    // Find min/max values for color scale (needed in buildChartConfig)
    const values = data.data ? data.data.map(d => d.v) : [];
    const minValue = values.length > 0 ? Math.min(...values) : 0;
    const maxValue = values.length > 0 ? Math.max(...values) : 0;

    // Labels come pre-translated from backend - no frontend translation needed
    const xLabels = data.xLabels;
    const yLabels = data.yLabels;

    const chart = createUnifiedChart({
        instanceKey: 'heatmap',
        canvasId: 'heatmapChart',
        overlayId: 'heatmapChartNoData',
        data: data,
        hasDataCheck: (d) => d && d.data && d.data.length > 0,
        buildChartConfig: (data) => {
            // Create matrix data
            const matrixData = data.data.map(d => ({
                x: d.x,
                y: d.y,
                v: d.v
            }));

            return {
                type: 'matrix',
                data: {
                    datasets: [{
                        label: measure,
                        data: matrixData,
                        backgroundColor: function(context) {
                            const value = context.dataset.data[context.dataIndex]?.v || 0;
                            return getHeatmapColor(value, minValue, maxValue);
                        },
                        borderColor: 'rgba(255, 255, 255, 0.5)',
                        borderWidth: 1,
                        width: function(context) {
                            const chart = context.chart;
                            const area = chart.chartArea;
                            if (!area) return 20;
                            return (area.right - area.left) / xLabels.length - 1;
                        },
                        height: function(context) {
                            const chart = context.chart;
                            const area = chart.chartArea;
                            if (!area) return 20;
                            return (area.bottom - area.top) / yLabels.length - 1;
                        }
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                title: function() {
                                    return '';
                                },
                                label: function(context) {
                                    const d = context.dataset.data[context.dataIndex];
                                    return `${d.y}, ${d.x}: ${d.v}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            type: 'category',
                            labels: xLabels,
                            offset: true,
                            grid: {
                                display: false
                            },
                            ticks: {
                                maxRotation: 45,
                                minRotation: 45
                            },
                            title: {
                                display: true,
                                text: dimensionLabels[xAxis] || xAxis
                            }
                        },
                        y: {
                            type: 'category',
                            labels: yLabels,
                            offset: true,
                            grid: {
                                display: false
                            },
                            title: {
                                display: true,
                                text: dimensionLabels[yAxis] || yAxis
                            }
                        }
                    }
                }
            };
        }
    }, heatmapChartInstances);

    // Handle empty data - update overlay text from "Loading" to "No data"
    if (!chart) {
        const overlay = document.getElementById('heatmapChartNoData');
        if (overlay) {
            const p = overlay.querySelector('p');
            if (p) p.textContent = LensT.noDataAvailableForThisCombination;
        }
    }

    // Update title
    const measureLabels = {
        'changes': LensT.numberOfChanges,
        'uniqueRecords': LensT.uniqueRecords,
        'uniqueUsers': LensT.uniqueUsers,
        'uniqueDays': LensT.uniqueDays
    };
    const titleElement = document.getElementById('heatmapTitle');
    if (titleElement) {
        titleElement.textContent = measureLabels[measure] || measure;
    }
}
