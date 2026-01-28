// =============================================================================
// LENS CHARTS - EDITOR MODULE (Tab 2: Editor Work Patterns)
// =============================================================================

// =============================================================================
// AJAX DATA LOADING
// =============================================================================

function loadWorkPatternsData() {
    const form = document.getElementById('chartsFilterForm');
    if (!form) {
        console.error('[ERROR Work Patterns] Form #chartsFilterForm not found');
        return;
    }

    const formData = new FormData(form);
    const params = new URLSearchParams(formData);

    // Remove parameters already in route URL
    params.delete('action');
    params.delete('module');
    params.delete('tree');

    // Set tab parameter for Tab 2 (Work Patterns)
    params.set('tab', 'patterns');

    // Collect selected years (if any)
    const selectedYears = Array.from(document.querySelectorAll('.year-checkbox:checked')).map(cb => cb.value);

    // Mutual exclusion: if years selected, remove days parameter
    if (selectedYears.length > 0) {
        params.delete('days');
        selectedYears.forEach(year => params.append('years[]', year));
    } else {
        if (!params.has('days')) {
            params.set('days', LensConfig.defaultDays);
        }
    }

    let dataEndpointUrl = LensConfig.dataEndpointUrl;
    const separator = dataEndpointUrl.includes('?') ? '&' : '?';
    const endpointUrl = dataEndpointUrl + separator + params.toString();

    fetch(endpointUrl)
        .then(response => response.json())
        .then(data => {
            updateWorkPatternsCharts(data);
            updateActiveButton(data.days);
        })
        .catch(error => {
            console.error('Error loading Work Patterns data:', error);
        });
}

// =============================================================================
// UPDATE WORK PATTERNS CHARTS (Tab 2 Orchestrator)
// =============================================================================

function updateWorkPatternsCharts(data) {
    // Step 1: Store original data for aggregation switching
    if (data.hourStats) {
        originalHourStats = data.hourStats;
    }
    if (data.dayStats) {
        originalDayStats = data.dayStats;
    }
    if (data.dayOfMonthStats) {
        originalDayOfMonthStats = data.dayOfMonthStats;
    }
    if (data.monthStats) {
        originalMonthStats = data.monthStats;
    }

    // Step 2: Destroy Tab 2-specific charts
    destroyWorkPatternsCharts();

    // Step 3: Reuse updateAllCharts() for common charts
    updateAllCharts(data);

    // Step 4: Render Tab 2-specific charts
    if (data.biggestWorkSessions) {
        renderBiggestSessionsChart(data.biggestWorkSessions);
    }

    if (data.commitSizeDistribution) {
        renderCommitSizeChart(data.commitSizeDistribution);
    }

    if (data.changeStatusStats) {
        renderChangeStatusChart(data.changeStatusStats);
    }

    if (data.editingActivityOverTime) {
        renderEditingActivityChart(data.editingActivityOverTime);
    }

    if (data.editVelocity) {
        renderEditVelocityChart(data.editVelocity);
    }

    if (data.sessionDuration) {
        renderSessionDurationChart(data.sessionDuration);
    }

    // Step 5: Re-apply aggregation if checkbox is checked
    const aggregateCheckbox = document.getElementById('aggregateDataCheckbox');
    if (aggregateCheckbox && aggregateCheckbox.checked) {
        const selectedYears = Array.from(document.querySelectorAll('.year-checkbox:checked')).map(cb => cb.value);
        toggleAggregationMode(true, selectedYears.length > 0 ? selectedYears : null);
    }
}

// =============================================================================
// TAB 2 RENDER FUNCTIONS
// =============================================================================

// Render Biggest Work Sessions Chart (Bar)
function renderBiggestSessionsChart(data) {
    createUnifiedChart({
        instanceKey: 'biggestSessions',
        canvasId: 'biggestWorkSessionsChart',
        overlayId: 'biggestWorkSessionsChartNoData',
        data: data,
        buildChartConfig: (data) => {
            const sessionLabels = [];
            const sessionCounts = [];

            for (const [date, sessionData] of Object.entries(data)) {
                sessionLabels.push(date + ' (' + sessionData.users + ')');
                sessionCounts.push(sessionData.count);
            }

            return {
                type: 'bar',
                data: {
                    labels: sessionLabels,
                    datasets: [{
                        label: LensT.numberOfChanges,
                        data: sessionCounts,
                        backgroundColor: chartColors.orange,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: {
                            title: { display: true, text: LensT.date },
                            ticks: { maxRotation: 45, minRotation: 45 }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: { precision: 0 },
                            title: { display: true, text: LensT.numberOfChanges }
                        }
                    }
                }
            };
        }
    }, workPatternsChartInstances);
}

// Render Commit Size Distribution Chart (Histogram)
function renderCommitSizeChart(data) {
    // Update stats row
    const statsRow = document.getElementById('commitSizeStatsRow');
    const meanSpan = document.getElementById('commitSizeMean');
    const medianSpan = document.getElementById('commitSizeMedian');

    if (statsRow && data.stats && data.counts && data.counts.reduce((a, b) => a + b, 0) > 0) {
        statsRow.style.display = 'flex';
        if (meanSpan) meanSpan.textContent = data.stats.mean || 0;
        if (medianSpan) medianSpan.textContent = data.stats.median || 0;
    } else if (statsRow) {
        statsRow.style.display = 'none';
    }

    createUnifiedChart({
        instanceKey: 'commitSize',
        canvasId: 'commitSizeChart',
        overlayId: 'commitSizeChartNoData',
        data: data,
        buildChartConfig: (data) => {
            return {
                type: 'bar',
                data: {
                    labels: data.bins || [],
                    datasets: [{
                        label: LensT.numberOfCommits,
                        data: data.counts || [],
                        backgroundColor: chartColors.purple,
                        borderColor: chartColors.purple,
                        borderWidth: 1,
                        barPercentage: 0.9,
                        categoryPercentage: 0.9
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                title: function(context) {
                                    const bin = context[0].label;
                                    return LensT.changesPerCommit + ': ' + bin;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            title: { display: true, text: LensT.changesPerCommit }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: { precision: 0 },
                            title: { display: true, text: LensT.numberOfCommits }
                        }
                    }
                }
            };
        }
    }, workPatternsChartInstances);
}

// Render Change Status Chart (Doughnut)
function renderChangeStatusChart(data) {
    const total = (data.accepted || 0) + (data.rejected || 0) + (data.pending || 0);

    // Only render if there's data
    if (total === 0) {
        const overlay = document.getElementById('changeStatusChartNoData');
        if (overlay) overlay.style.display = 'flex';
        return;
    }

    createUnifiedChart({
        instanceKey: 'changeStatus',
        canvasId: 'changeStatusChart',
        overlayId: 'changeStatusChartNoData',
        data: data,
        buildChartConfig: (data) => {
            return {
                type: 'doughnut',
                data: {
                    labels: [
                        LensT.accepted + ' (' + (data.accepted || 0) + ')',
                        LensT.rejected + ' (' + (data.rejected || 0) + ')',
                        LensT.pending + ' (' + (data.pending || 0) + ')'
                    ],
                    datasets: [{
                        data: [
                            data.accepted || 0,
                            data.rejected || 0,
                            data.pending || 0
                        ],
                        backgroundColor: [
                            chartColors.green,
                            chartColors.red,
                            chartColors.yellow
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: true, position: 'top' },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const value = context.raw;
                                    const percentage = ((value / total) * 100).toFixed(1);
                                    return context.label + ': ' + percentage + '%';
                                }
                            }
                        }
                    }
                }
            };
        }
    }, workPatternsChartInstances);
}

// Render Editing Activity Over Time Chart (Line)
function renderEditingActivityChart(data) {
    // Fill missing weeks with zeros if timeline_display is 'show_zeros'
    if (LensConfig.timelineDisplay === 'show_zeros') {
        data = fillMissingWeeks(data);
    }

    createUnifiedChart({
        instanceKey: 'editingActivity',
        canvasId: 'editingActivityOverTimeChart',
        overlayId: 'editingActivityOverTimeChartNoData',
        data: data,
        buildChartConfig: (data) => {
            return {
                type: 'line',
                data: {
                    labels: Object.keys(data),
                    datasets: [{
                        label: LensT.numberOfChanges,
                        data: Object.values(data),
                        borderColor: chartColors.blue,
                        backgroundColor: chartColors.blue.replace('rgb', 'rgba').replace(')', ', 0.2)'),
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: {
                            title: { display: true, text: LensT.date }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: { precision: 0 },
                            title: { display: true, text: LensT.numberOfChanges }
                        }
                    }
                }
            };
        }
    }, workPatternsChartInstances);
}

// Render Edit Velocity Trend Chart (Line with moving average)
function renderEditVelocityChart(data) {
    // Fill missing weeks with zeros if timeline_display is 'show_zeros'
    if (LensConfig.timelineDisplay === 'show_zeros') {
        data = fillMissingWeeksVelocity(data);
    }

    createUnifiedChart({
        instanceKey: 'editVelocity',
        canvasId: 'editVelocityChart',
        overlayId: 'editVelocityChartNoData',
        data: data,
        buildChartConfig: (data) => {
            const periods = Object.keys(data);
            const counts = periods.map(p => data[p].count);
            const movingAvgs = periods.map(p => data[p].moving_avg);

            return {
                type: 'line',
                data: {
                    labels: periods,
                    datasets: [
                        {
                            label: LensT.changes,
                            data: counts,
                            borderColor: chartColors.blue,
                            backgroundColor: chartColors.blue.replace('rgb', 'rgba').replace(')', ', 0.2)'),
                            fill: false,
                            tension: 0.1
                        },
                        {
                            label: LensT.trend4PeriodAvg,
                            data: movingAvgs,
                            borderColor: chartColors.red,
                            backgroundColor: 'transparent',
                            borderDash: [5, 5],
                            fill: false,
                            tension: 0.4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: true, position: 'top' },
                        tooltip: {
                            callbacks: {
                                title: function(context) {
                                    return LensT.period + ': ' + context[0].label;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            title: { display: true, text: LensT.timePeriod },
                            ticks: { maxRotation: 45, minRotation: 45 }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: { precision: 0 },
                            title: { display: true, text: LensT.numberOfChanges }
                        }
                    }
                }
            };
        }
    }, workPatternsChartInstances);
}

// Render Session Duration Distribution Chart (Bar histogram)
function renderSessionDurationChart(data) {
    createUnifiedChart({
        instanceKey: 'sessionDuration',
        canvasId: 'sessionDurationChart',
        overlayId: 'sessionDurationChartNoData',
        data: data,
        buildChartConfig: (data) => {
            return {
                type: 'bar',
                data: {
                    labels: Object.keys(data),
                    datasets: [{
                        label: LensT.numberOfSessions,
                        data: Object.values(data),
                        backgroundColor: chartColors.green,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                title: function(context) {
                                    return LensT.duration + ': ' + context[0].label;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            title: { display: true, text: LensT.sessionDuration }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: { precision: 0 },
                            title: { display: true, text: LensT.numberOfSessions }
                        }
                    }
                }
            };
        }
    }, workPatternsChartInstances);
}
