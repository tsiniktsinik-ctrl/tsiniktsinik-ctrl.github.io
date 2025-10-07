/**
 * Charts Module - Handles all chart-related functionality
 * Follows clean code principles with single responsibility and reusability
 */

class ChartsManager {
	//TODO: check each part on the api url so I can fix this
    constructor() {
        this.charts = {};
        this.metricsData = null;
        this.currentDivision = 'Overall';
        this.modelNames = [
            'rainforest', 
            'xgboost', 
            'neural-network', 
            'poisson', 
            'combined-rainforest', 
            'combined-xgboost', 
            'combined-neural-network'
        ];
        this.modelColors = [
            '#FF6384',  // Pink
            '#36A2EB',  // Blue  
            '#FFCE56',  // Yellow
            '#4BC0C0',  // Teal
            '#9966FF',  // Purple
            '#FF9F40',  // Orange
            '#FF6384'   // Pink variant
        ];
    }

    /**
     * Initialize charts with metrics data
     * @param {Object} data - The metrics data object
     */
    initialize(data) {
        this.metricsData = data;
        this.addAllCanvas();
        this.createAllCharts();
    }

    /**
     * Calculate accuracy percentage
     * @param {number} correct - Number of correct predictions
     * @param {number} total - Total number of predictions
     * @returns {number} Accuracy percentage
     */
    calculateAccuracy(correct, total) {
        return total > 0 ? Math.round((correct / total) * 100) : 0;
    }

    /**
     * Get metrics for a specific division or overall
     * @param {string} division - Division key or 'Overall'
     * @returns {Object} Metrics data
     */
    getMetricsForDivision(division) {
        // if (division === 'Overall') {
        //     return this.getOverallMetrics();
        // }
        return this.metricsData[division]?.metrics || {};
    }

    /**
     * Create chart configuration object
     * @param {string} title - Chart title
     * @param {Array} labels - X-axis labels (model names)
     * @param {Array} data - Data values
     * @param {Array} colors - Bar colors
     * @returns {Object} Chart.js configuration
     */
    createChartConfig(title, labels, data, colors) {
        return {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Accuracy %',
                    data: data,
                    backgroundColor: colors,
                    borderColor: colors.map(color => color + '80'),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: title,
                        color: '#ffffff',
                        font: { size: 16, weight: 'bold' }
                    },
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const model = context.label;
                                const accuracy = context.parsed.y;
                                return `${model}: ${accuracy}%`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            },
                            color: '#ffffff'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    x: {
                        ticks: {
                            color: '#ffffff',
                            maxRotation: 45
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                },
                animation: {
                    duration: 750,
                    easing: 'easeInOutQuart'
                }
            }
        };
    }

    /**
     * Create multiple metric chart (for correct scores, over/under goals)
     * @param {string} chartId - Canvas element ID
     * @param {string} title - Chart title
     * @param {Array} metricPairs - Array of {correct, total, label} objects
     */
    createMultiMetricChart(chartId, title, grouping) {
        const metricPairs = this.mapMetricPairs(grouping)
        const canvas = document.getElementById(chartId);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const metrics = this.getMetricsForDivision(this.currentDivision == 'Overall' ? 'overall' : this.currentDivision);
        
        const datasets = metricPairs.map((pair, index) => {
            const data = this.modelNames.map(model => {
                const modelMetrics = metrics[model] || {};
                const correct = modelMetrics[pair.correct] || 0;
                const total = modelMetrics[pair.total] || 0;
                return this.calculateAccuracy(correct, total);
            });

            return {
                label: pair.label,
                data: data,
                backgroundColor: this.getColorVariant(index),
                borderColor: this.getColorVariant(index) + '80',
                borderWidth: 1
            };
        });

        const config = {
            type: 'bar',
            data: {
                labels: this.modelNames,
                datasets: datasets
            },
            options: {
                responsive: true,
                // maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        labels: { color: '#212121' } // dark grey 
                    },
                    title: {
                        text: title,
                        display: true,   
                        color: '#212121'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const value = context.raw || 0;
                                const model = context.label;
                                const type = context.dataset.label.toLowerCase();
                                metrics[context.label]['t'+context.dataset.label.toLowerCase()]

                                return `${value}% (${metrics[model][type]}/${metrics[model]['t'+type]})`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            },
                            color: '#212121'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    x: {
                        ticks: {
                            color: '#212121',
                            maxRotation: 45
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                },
                animation: {
                    duration: 750,
                    easing: 'easeInOutQuart'
                }
            }
        };
        
        // Destroy existing chart if it exists
        if (this.charts[chartId]) {
            this.charts[chartId].destroy();
        }
        
        this.charts[chartId] = new Chart(ctx, config);
    }

    mapMetricPairs(grouping) {
        return grouping.map(type=>{
            return {'correct': type, 'total':'t'+type, 'label': type.toUpperCase()}
        })
    }

    /**
     * Get color variant for multi-dataset charts
     * @param {number} index - Color index
     * @returns {string} Color hex code
     */
    getColorVariant(index) {
        const baseColors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0'];
        return baseColors[index % baseColors.length];
    }

    addAllCanvas() {
        DOMUtils.getElementById('charts-grid').innerHTML = 
        this.metricsData['chart-groupings'].map(chart=>
            `
                <div class="chart-card">
                    <canvas id="${this.getChartId(chart)}" height="300" ></canvas>
                </div>
            `
        ).join('');
    }

    getChartId(chart){
        return chart.title.toLowerCase().replaceAll(' ','-')
    }

    /**
     * Create all charts
     */
    createAllCharts() {
        this.metricsData['chart-groupings'].forEach(chart=>{
            this.createMultiMetricChart(
                this.getChartId(chart),
                chart.title, 
                chart.grouping
            );
        })
    }

    /**
     * Update all charts when division changes
     * @param {string} division - New division to display
     */
    updateCharts(division) {
        this.currentDivision = division;
        this.createAllCharts();
    }

    /**
     * Destroy all charts
     */
    destroyAllCharts() {
        Object.values(this.charts).forEach(chart => {
            if (chart) chart.destroy();
        });
        this.charts = {};
    }

    /**
     * Get available divisions
     * @returns {Array} Array of division objects with key and name
     */
    getAvailableDivisions() {
        const divisions = [];
        
        Object.keys(this.metricsData).forEach(key => {
            if(this.metricsData[key].metrics)
                divisions.push({
                    key: key,
                    name: this.metricsData[key].division
                });
        });
        return divisions.sort((d1,d2)=>d1.key == 'overall' ? -1 : d1.key.localeCompare(d2.key));
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChartsManager;
} else {
    window.ChartsManager = ChartsManager;
}