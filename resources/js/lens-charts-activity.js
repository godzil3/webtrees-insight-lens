// =============================================================================
// ACTIVITY LOG - Tab 4 (Lazy-loaded)
// Dependencies: LensT, LensConfig, chartColors, createUnifiedChart (from lens-charts.js)
// =============================================================================

// Translations for chart labels - uses LensT
const chartTranslations = {
    beforeEdit: LensT.beforeEdit,
    afterEdit: LensT.afterEdit,
    netGain: LensT.netGain,
    avgFactsPerRecord: LensT.avgFactsPerRecord,
    newRecords: LensT.newRecords,
    modifications: LensT.modifications,
    changes: LensT.changes,
    changesPerWeek: LensT.changesPerWeek,
    movingAverage: LensT.movingAverage4Week,
    numberOfSessions: LensT.numberOfSessions,
    sessions: LensT.sessions,
    user1: LensT.user1,
    user2: LensT.user2,
    sharedRecords: LensT.sharedRecords,
    noCollaboration: LensT.noCollaboration,
    successfulLogins: LensT.successfulLogins,
    failedAttempts: LensT.failedAttempts
};

// Store chart instances
const activityLogChartInstances = {};

// Helper function to load all Activity Log charts using unified /Data?tab=activity endpoint
function loadAllActivityLogCharts(formData) {
    // If no formData provided, get from form
    if (!formData) {
        const form = document.getElementById('chartsFilterForm');
        formData = form ? new FormData(form) : new FormData();
    }

    // Build URL parameters from formData
    const params = new URLSearchParams(formData);

    // Remove parameters that are already in route URL
    params.delete('action');
    params.delete('module');
    params.delete('tree');

    // Set tab parameter for Tab 4 (Activity Log)
    params.set('tab', 'activity');

    // Collect selected years (if any) - same as Tab 1/2
    const selectedYears = Array.from(document.querySelectorAll('.year-checkbox:checked')).map(cb => cb.value);

    // Mutual exclusion: if years selected, remove days parameter
    if (selectedYears.length > 0) {
        params.delete('days');
        selectedYears.forEach(year => params.append('years[]', year));
    } else {
        // If no years selected, ensure days parameter exists
        if (!params.has('days')) {
            params.set('days', LensConfig.defaultDays);
        }
    }

    // Use proper webtrees route() - action must be in PATH not query param
    let dataEndpointUrl = LensConfig.dataEndpointUrl;
    const separator = dataEndpointUrl.includes('?') ? '&' : '?';
    const endpointUrl = dataEndpointUrl + separator + params.toString();

    fetch(endpointUrl)
        .then(response => response.json())
        .then(data => {
            // Update Activity Log charts with unified data
            updateActivityLogCharts(data);
        })
        .catch(error => {
            console.error('[Tab 4] Error loading Activity Log data:', error);
        });
}

// Render Auth Summary Chart (Line - multi-dataset)
function renderAuthSummaryChart(data) {
    // Fill missing days with zeros if timeline_display is 'show_zeros'
    if (LensConfig.timelineDisplay === 'show_zeros') {
        data = fillMissingDaysAuth(data);
    }

    createUnifiedChart({
        instanceKey: 'authSummary',
        canvasId: 'authSummaryChart',
        overlayId: 'authSummaryChartNoData',
        data: data,
        buildChartConfig: (data) => {
            const periods = Object.keys(data).sort();
            const logins = periods.map(p => data[p].logins);
            const failed = periods.map(p => data[p].failed);

            return {
                type: 'line',
                data: {
                    labels: periods,
                    datasets: [
                        {
                            label: chartTranslations.successfulLogins,
                            data: logins,
                            borderColor: chartColors.green,
                            backgroundColor: chartColors.green.replace('rgb', 'rgba').replace(')', ', 0.2)'),
                            fill: false,
                            tension: 0.4
                        },
                        {
                            label: chartTranslations.failedAttempts,
                            data: failed,
                            borderColor: chartColors.red,
                            backgroundColor: chartColors.red.replace('rgb', 'rgba').replace(')', ', 0.2)'),
                            fill: false,
                            tension: 0.4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'top' }
                    },
                    scales: {
                        x: {
                            title: { display: true, text: LensT.date }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: { precision: 0 },
                            title: { display: true, text: LensT.count }
                        }
                    }
                }
            };
        }
    }, activityLogChartInstances);
}

// Render Search Timeline Chart (Line)
function renderSearchTimelineChart(data) {
    // Fill missing days with zeros if timeline_display is 'show_zeros'
    if (LensConfig.timelineDisplay === 'show_zeros') {
        data = fillMissingDays(data);
    }

    createUnifiedChart({
        instanceKey: 'searchTimeline',
        canvasId: 'searchTimelineChart',
        overlayId: 'searchTimelineChartNoData',
        data: data,
        buildChartConfig: (data) => {
            const periods = Object.keys(data).sort();
            const counts = periods.map(p => data[p]);

            return {
                type: 'line',
                data: {
                    labels: periods,
                    datasets: [{
                        label: LensT.searches,
                        data: counts,
                        borderColor: chartColors.blue,
                        backgroundColor: chartColors.blue.replace('rgb', 'rgba').replace(')', ', 0.2)'),
                        fill: false,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'top' }
                    },
                    scales: {
                        x: {
                            title: { display: true, text: LensT.date }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: { precision: 0 },
                            title: { display: true, text: LensT.numberOfSearches }
                        }
                    }
                }
            };
        }
    }, activityLogChartInstances);
}

// Render Search Terms Chart (Bar - horizontal)
function renderSearchTermsChart(data) {
    createUnifiedChart({
        instanceKey: 'searchTerms',
        canvasId: 'searchTermsChart',
        overlayId: 'searchTermsChartNoData',
        data: data,
        buildChartConfig: (data) => ({
            type: 'bar',
            data: {
                labels: Object.keys(data),
                datasets: [{
                    label: LensT.numberOfSearches,
                    data: Object.values(data),
                    backgroundColor: chartColors.orange
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: { precision: 0 },
                        title: { display: true, text: LensT.numberOfSearches }
                    },
                    y: {
                        ticks: {
                            autoSkip: false,
                            maxRotation: 0,
                            minRotation: 0
                        },
                        title: { display: true, text: LensT.searchTerm }
                    }
                }
            }
        })
    }, activityLogChartInstances);
}

function renderMessageTimelineChart(data) {
    // Fill missing days with zeros if timeline_display is 'show_zeros'
    if (LensConfig.timelineDisplay === 'show_zeros') {
        data = fillMissingDaysChartJS(data);
    }

    createUnifiedChart({
        instanceKey: 'messageTimeline',
        canvasId: 'messageTimelineChart',
        overlayId: 'messageTimelineChartNoData',
        data: data,
        buildChartConfig: (data) => ({
            type: 'line',
            data: { labels: data.labels, datasets: data.datasets },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { display: true } },
                scales: {
                    x: {
                        title: { display: true, text: LensT.date }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { precision: 0 },
                        title: { display: true, text: LensT.messages }
                    }
                }
            }
        })
    }, activityLogChartInstances);
}

function renderUserMessageStatsChart(data) {
    createUnifiedChart({
        instanceKey: 'userMessageStats',
        canvasId: 'userMessageStatsChart',
        overlayId: 'userMessageStatsChartNoData',
        data: data,
        buildChartConfig: (data) => ({
            type: 'bar',
            data: { labels: data.labels, datasets: data.datasets },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: true, position: 'top' } },
                scales: {
                    x: {
                        stacked: true,
                        beginAtZero: true,
                        ticks: { precision: 0 },
                        title: { display: true, text: LensT.messages }
                    },
                    y: {
                        stacked: true,
                        title: { display: true, text: LensT.user },
                        ticks: {
                            autoSkip: false,
                            callback: function(value, index, ticks) {
                                const label = this.getLabelForValue(value);
                                return label.length > 20 ? label.substring(0, 17) + '...' : label;
                            }
                        }
                    }
                }
            }
        })
    }, activityLogChartInstances);
}

function updateActivityLogCharts(data) {
    // Destroy all existing chart instances
    Object.keys(activityLogChartInstances).forEach(key => {
        if (activityLogChartInstances[key]) {
            activityLogChartInstances[key].destroy();
            delete activityLogChartInstances[key];
        }
    });

    // Render each chart using new pattern
    if (data.authSummary) {
        renderAuthSummaryChart(data.authSummary);
    }

    if (data.searchTimeline) {
        renderSearchTimelineChart(data.searchTimeline);
    }

    if (data.searchTerms) {
        renderSearchTermsChart(data.searchTerms);
    }

    if (data.messageTimeline) {
        renderMessageTimelineChart(data.messageTimeline);
    }

    if (data.userMessageStats) {
        renderUserMessageStatsChart(data.userMessageStats);
    }

    // Render Failed Logins table
    if (data.failedLogins) {
        const container = document.getElementById('failedLoginsData');
        if (container) {
            if (!Array.isArray(data.failedLogins) || data.failedLogins.length === 0) {
                container.innerHTML = '<p class="text-success text-center"><i class="fas fa-check-circle"></i> ' + LensT.noSuspiciousLoginActivityDetected + '</p>';
            } else {
                let html = '<table class="table table-sm table-striped"><thead><tr>';
                html += '<th>' + LensT.username + '</th>';
                html += '<th>' + LensT.ipAddress + '</th>';
                html += '<th class="text-end">' + LensT.attempts + '</th>';
                html += '<th>' + LensT.lastAttempt + '</th>';
                html += '</tr></thead><tbody>';

                data.failedLogins.forEach(row => {
                    const attemptClass = row.attempts >= 10 ? 'table-danger' : (row.attempts >= 5 ? 'table-warning' : '');
                    html += `<tr class="${attemptClass}">`;
                    html += `<td>${row.username}</td>`;
                    html += `<td><code>${row.ip_address}</code></td>`;
                    html += `<td class="text-end"><strong>${row.attempts}</strong></td>`;
                    html += `<td>${row.last_attempt}</td>`;
                    html += '</tr>';
                });

                html += '</tbody></table>';
                container.innerHTML = html;
            }
        }
    }
}

// Load Activity Log charts immediately (script is lazy-loaded when tab is shown)
loadAllActivityLogCharts();
