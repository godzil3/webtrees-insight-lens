// =============================================================================
// LENS CHARTS - DATA MODULE (Tab 1: Data Content Statistics)
// =============================================================================

// =============================================================================
// AJAX DATA LOADING
// =============================================================================

function loadChartsData(formData) {
    const overlay = document.getElementById('chartsLoadingOverlay');
    overlay.classList.add('active');
    startLoadingTimer();

    const params = new URLSearchParams(formData);

    // Remove parameters already in route URL
    params.delete('action');
    params.delete('module');
    params.delete('tree');

    // Set tab parameter for Tab 1 (Data Content)
    params.set('tab', 'content');

    // Collect selected years
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
        .then(response => {
            return response.text().then(text => {
                try {
                    const data = JSON.parse(text);

                    if (!response.ok) {
                        throw new Error(data.message || data.error || 'HTTP ' + response.status);
                    }

                    return data;
                } catch (parseError) {
                    console.error('[ERROR] JSON parse failed:', parseError);
                    console.error('[ERROR] Full response text:', text);
                    throw new Error('Invalid JSON response - check console for details');
                }
            });
        })
        .then(data => {
            updateDataContentCharts(data);
            updateActiveButton(data.days);

            stopLoadingTimer();
            overlay.classList.remove('active');
        })
        .catch(error => {
            console.error('[ERROR] Fetch failed:', error);
            stopLoadingTimer();
            overlay.classList.remove('active');
            alert(LensT.errorLoadingData + ': ' + error.message);
        });
}

// =============================================================================
// UPDATE DATA CONTENT CHARTS (Tab 1 Orchestrator)
// =============================================================================

function updateDataContentCharts(data) {
    // Step 1: Destroy all existing charts
    destroyDataContentCharts();

    // Step 2: Store original data for aggregation
    if (data.hourStats) originalHourStats = data.hourStats;
    if (data.dayStats) originalDayStats = data.dayStats;
    if (data.dayOfMonthStats) originalDayOfMonthStats = data.dayOfMonthStats;
    if (data.monthStats) originalMonthStats = data.monthStats;

    // Step 3: Render all charts from data
    renderRecordTypeChart(data.recordTypeStats);
    renderUserChart(data.userStats);
    renderHourChart(data.hourStats);
    renderDayChart(data.dayStats);
    renderDayOfMonthChart(data.dayOfMonthStats);
    renderMonthChart(data.monthStats);
    renderYearChart(data.yearStats);
    renderMostEditedIndividualsChart(data.mostEditedIndividuals);
    renderMostEditedFactsChart(data.mostEditedFacts);
    renderMostAddedFactsChart(data.mostAddedFacts);
    renderMostDeletedFactsChart(data.mostDeletedFacts);
    renderMostChangedFactsPerIndividualChart(data.mostChangedFactsPerIndividual);
    renderLargestChangesChart(data.largestChanges);

    // Step 4: Render advanced charts if data provided
    if (data.factCompleteness) renderFactCompletenessChart(data.factCompleteness);
    if (data.creationVsModification) renderCreationVsModificationChart(data.creationVsModification);
}

// Function to update all charts with new data
function updateAllCharts(data) {
    // Destroy all existing chart instances
    Object.keys(dataContentChartInstances).forEach(key => {
        if (dataContentChartInstances[key]) {
            dataContentChartInstances[key].destroy();
            delete dataContentChartInstances[key];
        }
    });

    // Render all charts using render functions
    if (data.recordTypeStats) renderRecordTypeChart(data.recordTypeStats);
    if (data.largestChanges) renderLargestChangesChart(data.largestChanges);
    if (data.userStats) renderUserChart(data.userStats);
    if (data.hourStats) renderHourChart(data.hourStats);
    if (data.dayStats) renderDayChart(data.dayStats);
    if (data.dayOfMonthStats) renderDayOfMonthChart(data.dayOfMonthStats);
    if (data.monthStats) renderMonthChart(data.monthStats);
    if (data.yearStats) renderYearChart(data.yearStats);
    if (data.mostEditedIndividuals) renderMostEditedIndividualsChart(data.mostEditedIndividuals);
    if (data.mostEditedFacts) renderMostEditedFactsChart(data.mostEditedFacts);
    if (data.mostAddedFacts) renderMostAddedFactsChart(data.mostAddedFacts);
    if (data.mostDeletedFacts) renderMostDeletedFactsChart(data.mostDeletedFacts);
    if (data.mostChangedFactsPerIndividual) renderMostChangedFactsPerIndividualChart(data.mostChangedFactsPerIndividual);
    if (data.factCompleteness) renderFactCompletenessChart(data.factCompleteness);
    if (data.creationVsModification) renderCreationVsModificationChart(data.creationVsModification);
}

// =============================================================================
// CHART RENDER FUNCTIONS
// =============================================================================

function renderRecordTypeChart(data) {
    createUnifiedChart({
        instanceKey: 'recordTypeChart',
        canvasId: 'recordTypeChart',
        overlayId: 'recordTypeChartNoData',
        data: data,
        buildChartConfig: (data) => ({
            type: 'pie',
            data: {
                labels: Object.keys(data).map(translateRecordType),
                datasets: [{
                    data: Object.values(data),
                    backgroundColor: colorPalette
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'top' },
                    title: { display: false }
                }
            }
        })
    });
}

function renderUserChart(data) {
    createUnifiedChart({
        instanceKey: 'userChart',
        canvasId: 'userChart',
        overlayId: 'userChartNoData',
        data: data,
        buildChartConfig: (data) => ({
            type: 'bar',
            data: {
                labels: Object.keys(data),
                datasets: [{
                    label: LensT.numberOfChanges,
                    data: Object.values(data),
                    backgroundColor: chartColors.blue
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
                        title: { display: true, text: LensT.user }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { precision: 0 },
                        title: { display: true, text: LensT.numberOfChanges }
                    }
                }
            }
        })
    });
}

function renderHourChart(data) {
    createUnifiedChart({
        instanceKey: 'hourChart',
        canvasId: 'hourChart',
        overlayId: 'hourChartNoData',
        data: data,
        buildChartConfig: (data) => {
            const hourLabels = Array.from({length: 24}, (_, i) => i.toString().padStart(2, '0'));
            const datasets = [];
            let colorIndex = 0;

            for (const [year, hours] of Object.entries(data)) {
                const hourData = hourLabels.map(h => hours[h] || 0);
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

            return {
                type: 'line',
                data: { labels: hourLabels, datasets: datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'top' }
                    },
                    scales: {
                        x: {
                            title: { display: true, text: LensT.hourOfDay }
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
    });
}

function renderDayChart(data) {
    createUnifiedChart({
        instanceKey: 'dayChart',
        canvasId: 'dayChart',
        overlayId: 'dayChartNoData',
        data: data,
        buildChartConfig: (data) => {
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
            const dayLabels = dayNames.map(d => dayTranslations[d] || d);

            const datasets = [];
            let colorIndex = 0;

            for (const [year, days] of Object.entries(data)) {
                const dayData = dayNames.map(d => days[d] || 0);
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

            return {
                type: 'line',
                data: { labels: dayLabels, datasets: datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'top' }
                    },
                    scales: {
                        x: {
                            title: { display: true, text: LensT.dayOfWeek }
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
    });
}

function renderDayOfMonthChart(data) {
    createUnifiedChart({
        instanceKey: 'dayOfMonthChart',
        canvasId: 'dayOfMonthChart',
        overlayId: 'dayOfMonthChartNoData',
        data: data,
        buildChartConfig: (data) => {
            const dayLabels = Array.from({length: 31}, (_, i) => (i + 1).toString());
            const datasets = [];
            let colorIndex = 0;

            for (const [year, days] of Object.entries(data)) {
                const dayData = dayLabels.map(d => days[d.padStart(2, '0')] || 0);
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

            return {
                type: 'line',
                data: { labels: dayLabels, datasets: datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'top' }
                    },
                    scales: {
                        x: {
                            title: { display: true, text: LensT.dayOfMonth }
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
    });
}

function renderMonthChart(data) {
    createUnifiedChart({
        instanceKey: 'monthChart',
        canvasId: 'monthChart',
        overlayId: 'monthChartNoData',
        data: data,
        buildChartConfig: (data) => {
            const monthLabels = [
                LensT.january, LensT.february, LensT.march,
                LensT.april, LensT.may, LensT.june,
                LensT.july, LensT.august, LensT.september,
                LensT.october, LensT.november, LensT.december
            ];

            const datasets = [];
            let colorIndex = 0;

            for (const [year, months] of Object.entries(data)) {
                const monthData = [];
                for (let m = 1; m <= 12; m++) {
                    monthData.push(months[m.toString().padStart(2, '0')] || 0);
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

            return {
                type: 'line',
                data: { labels: monthLabels, datasets: datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'top' }
                    },
                    scales: {
                        x: {
                            title: { display: true, text: LensT.month }
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
    });
}

function renderYearChart(data) {
    createUnifiedChart({
        instanceKey: 'yearChart',
        canvasId: 'yearChart',
        overlayId: 'yearChartNoData',
        data: data,
        buildChartConfig: (data) => ({
            type: 'bar',
            data: {
                labels: Object.keys(data),
                datasets: [{
                    label: LensT.numberOfChanges,
                    data: Object.values(data),
                    backgroundColor: chartColors.green
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
                        title: { display: true, text: LensT.year }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { precision: 0 },
                        title: { display: true, text: LensT.numberOfChanges }
                    }
                }
            }
        })
    });
}

// =============================================================================
// HORIZONTAL BAR CHART FACTORY
// =============================================================================

function renderHorizontalBarChart(id, data, xAxisLabel, yAxisLabel, color, overlayIdOverride = null) {
    createUnifiedChart({
        instanceKey: id,
        canvasId: id,
        overlayId: overlayIdOverride || (id + 'NoData'),
        data: data,
        buildChartConfig: (data) => ({
            type: 'bar',
            data: {
                labels: Object.keys(data),
                datasets: [{
                    label: xAxisLabel,
                    data: Object.values(data),
                    backgroundColor: color
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: { precision: 0 },
                        title: { display: true, text: xAxisLabel }
                    },
                    y: {
                        title: { display: true, text: yAxisLabel },
                        ticks: {
                            autoSkip: false,
                            callback: function(value, index, ticks) {
                                const label = this.getLabelForValue(value);
                                return label.length > 25 ? label.substring(0, 22) + '...' : label;
                            }
                        }
                    }
                }
            }
        })
    });
}

// Wrapper functions for backwards compatibility
function renderMostEditedIndividualsChart(data) {
    renderHorizontalBarChart('mostEditedIndividualsChart', data, LensT.numberOfChanges, LensT.individual, chartColors.purple);
}

function renderMostEditedFactsChart(data) {
    renderHorizontalBarChart('mostEditedFactsChart', data, LensT.numberOfChanges, LensT.factType, chartColors.orange);
}

function renderMostAddedFactsChart(data) {
    renderHorizontalBarChart('mostAddedFactsChart', data, LensT.numberOfAdditions, LensT.factType, chartColors.green);
}

function renderMostDeletedFactsChart(data) {
    renderHorizontalBarChart('mostDeletedFactsChart', data, LensT.numberOfDeletions, LensT.factType, chartColors.red, 'mostDeletedFactsNoData');
}

function renderMostChangedFactsPerIndividualChart(data) {
    renderHorizontalBarChart('mostChangedFactsPerIndividualChart', data, LensT.averageChangesPerIndividual, LensT.factType, chartColors.teal);
}

function renderLargestChangesChart(data) {
    createUnifiedChart({
        instanceKey: 'largestChangesChart',
        canvasId: 'largestChangesChart',
        overlayId: 'largestChangesChartNoData',
        data: data,
        buildChartConfig: (data) => {
            const sortedEntries = Object.entries(data).sort((a, b) => b[1] - a[1]);
            return {
                type: 'bar',
                data: {
                    labels: sortedEntries.map(e => e[0]),
                    datasets: [{
                        label: LensT.numberOfChanges,
                        data: sortedEntries.map(e => e[1]),
                        backgroundColor: chartColors.pink
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
                            title: { display: true, text: LensT.numberOfChanges }
                        },
                        y: {
                            title: { display: true, text: LensT.individual },
                            ticks: {
                                autoSkip: false,
                                callback: function(value, index, ticks) {
                                    const label = this.getLabelForValue(value);
                                    return label.length > 30 ? label.substring(0, 27) + '...' : label;
                                }
                            }
                        }
                    }
                }
            };
        }
    });
}

function renderFactCompletenessChart(data) {
    // Fill missing months with zeros if timeline_display is 'show_zeros'
    if (LensConfig.timelineDisplay === 'show_zeros') {
        data = fillMissingMonthsFactCompleteness(data);
    }

    createUnifiedChart({
        instanceKey: 'factCompleteness',
        canvasId: 'factCompletenessChart',
        overlayId: 'factCompletenessChartNoData',
        data: data,
        buildChartConfig: (data) => {
            const periods = Object.keys(data).sort();
            const beforeData = periods.map(p => data[p].before_avg);
            const afterData = periods.map(p => data[p].after_avg);
            const netGainData = periods.map(p => data[p].net_gain);

            return {
                type: 'line',
                data: {
                    labels: periods,
                    datasets: [
                        {
                            label: LensT.beforeEdit,
                            data: beforeData,
                            borderColor: 'rgb(255, 99, 132)',
                            backgroundColor: 'rgba(255, 99, 132, 0.1)',
                            tension: 0.4
                        },
                        {
                            label: LensT.afterEdit,
                            data: afterData,
                            borderColor: 'rgb(75, 192, 192)',
                            backgroundColor: 'rgba(75, 192, 192, 0.1)',
                            tension: 0.4
                        },
                        {
                            label: LensT.netGain,
                            data: netGainData,
                            borderColor: 'rgb(153, 102, 255)',
                            backgroundColor: 'rgba(153, 102, 255, 0.1)',
                            tension: 0.4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        title: { display: false },
                        legend: { position: 'top' }
                    },
                    scales: {
                        x: {
                            title: { display: true, text: LensT.month }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: { precision: 0 },
                            title: { display: true, text: LensT.avgFactsPerRecord }
                        }
                    }
                }
            };
        }
    });
}

function renderCreationVsModificationChart(data) {
    // Fill missing months with zeros if timeline_display is 'show_zeros'
    if (LensConfig.timelineDisplay === 'show_zeros') {
        data = fillMissingMonthsCreationMod(data);
    }

    createUnifiedChart({
        instanceKey: 'creationVsModification',
        canvasId: 'creationVsModificationChart',
        overlayId: 'creationVsModificationChartNoData',
        data: data,
        buildChartConfig: (data) => {
            const periods = Object.keys(data).sort();

            // Backend returns 'creations' and 'modifications' (with 's')
            const creationData = periods.map(p => data[p].creations);
            const modificationData = periods.map(p => data[p].modifications);

            return {
                type: 'bar',
                data: {
                    labels: periods,
                    datasets: [
                        {
                            label: LensT.creation,
                            data: creationData,
                            backgroundColor: 'rgba(75, 192, 192, 0.6)',
                            borderColor: 'rgb(75, 192, 192)',
                            borderWidth: 1
                        },
                        {
                            label: LensT.modification,
                            data: modificationData,
                            backgroundColor: 'rgba(255, 159, 64, 0.6)',
                            borderColor: 'rgb(255, 159, 64)',
                            borderWidth: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        title: { display: false },
                        legend: { position: 'top' }
                    },
                    scales: {
                        x: {
                            stacked: false,
                            title: { display: true, text: LensT.month }
                        },
                        y: {
                            stacked: false,
                            title: { display: true, text: LensT.changes }
                        }
                    }
                }
            };
        }
    });
}
