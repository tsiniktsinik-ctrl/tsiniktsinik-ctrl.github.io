/**
 * Football Analytics Application - Main Controller
 * Refactored for clean code principles and separation of concerns
 */

// ============================================================================
// CONSTANTS AND CONFIGURATION
// ============================================================================

const CONFIG = {
    API_ENDPOINT: `https://ueo2mocbr1.execute-api.eu-central-1.amazonaws.com/${window.location.search}`,
    STORAGE_KEYS: {
        FILTER_PRESETS: 'football_filter_presets',
        CURRENT_FILTERS: 'football_current_filters'
    }
};

var METRICS_DATA = undefined;

// ============================================================================
// APPLICATION STATE
// ============================================================================

class AppState {
    constructor() {
        this.allMatches = [];
        this.filteredMatches = [];
        this.currentTab = 'upcoming';
        this.chartsManager = null;
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const Utils = {
    /**
     * Debounce function to limit function calls
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Debounced function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Parse date string to Date object
     * @param {string} matchId - Date time in string
     * @returns {Date} Parsed date
     */
    parseDate(matchId) {
        if(window.location.search.includes['odds']){
            let date = matchId.split('-')[1].split("/");
            return new Date(date[2],date[1]-1,date[0]);
        } else {
            let dateSplit = matchId.split('-')
            return new Date(dateSplit[dateSplit.length-5],dateSplit[dateSplit.length-4]-1,dateSplit[dateSplit.length-3])
        }
    },

    /**
     * Format date for display
     * @param {string} matchId - Date containing string
     * @returns {string} Formatted date
     */
    formatDate(matchId) {
        const date = this.parseDate(matchId);
        return date.toLocaleDateString('en-GB', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    },

    /**
     * Show/hide loading state
     * @param {boolean} show - Whether to show loading
     */
    setLoading(show) {
        const loadingEl = document.getElementById('loading');
        if (loadingEl) {
            loadingEl.style.display = show ? 'block' : 'none';
        }
    },

    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError(message) {
        const errorEl = document.getElementById('error');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }
    },

    /**
     * Hide error message
     */
    hideError() {
        const errorEl = document.getElementById('error');
        if (errorEl) {
            errorEl.style.display = 'none';
        }
    }
};

// ============================================================================
// DOM UTILITIES
// ============================================================================

const DOMUtils = {
    /**
     * Get element by ID with error handling
     * @param {string} id - Element ID
     * @returns {Element|null} Element or null
     */
    getElementById(id) {
        const element = document.getElementById(id);
        if (!element) {
            console.warn(`Element with ID '${id}' not found`);
        }
        return element;
    },

    /**
     * Update tab counts
     * @param {Object} counts - Object with count values
     */
    updateTabCounts(counts) {
        Object.entries(counts).forEach(([tab, count]) => {
            const countEl = this.getElementById(`${tab}-count`);
            if (countEl) {
                countEl.textContent = count;
            }
        });
    },

    /**
     * Switch active tab
     * @param {string} tabName - Name of tab to activate
     */
    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tabs__tab').forEach(tab => {
            const isActive = tab.dataset.tab === tabName;
            tab.classList.toggle('tabs__tab--active', isActive);
            tab.setAttribute('aria-selected', isActive);
        });

        // Update tab panels
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.style.display = panel.id === tabName ? 'block' : 'none';
        });
    },

    /**
     * Create match card HTML
     * @param {Object} match - Match data
     * @returns {string} HTML string
     */
    createMatchCard(match) {
        const matchInfo = match['match-info']
        const matchPredictions = match['model-predictions']
        const dateStr = Utils.formatDate(matchInfo.MatchId);
        const resultHTML = matchInfo.FTHG !== null ? 
            `<div class="match-card__result">Final Score: ${matchInfo.FTHG} - ${matchInfo.FTAG}</div>` : '';
        
        const predictionsHTML = Object.entries(matchPredictions)
            .sort(([model,prediction],[model2,prediction2])=>this.getModelPriority(model,['rain','xgb','net'])-this.getModelPriority(model2,['rain','xgb','net']))
            .map(([model, pred]) => this.createPredictionsHTML(model, pred))
            .join('');
        
        return `
            <div class="match-card" data-id="${matchInfo['MatchId']}">
                <div class="match-card__header">
                    <div class="match-card__division">${matchInfo.Div}</div>
                    <div class="match-card__date">${dateStr}</div>
                </div>
                <div class="match-card__teams">
                    <div class="match-card__matchup">
                        <span>${matchInfo.Home}</span>
                        <span class="match-card__vs">vs</span>
                        <span>${matchInfo.Away}</span>
                    </div>
                    ${resultHTML}
                </div>
                <div class="match-card__predictions">
                    <div class="match-card__predictions-title">Model Predictions</div>
                    <div class="predictions-grid">
                        ${predictionsHTML}
                    </div>
                </div>
            </div>
        `;
    },

    getModelPriority(model, modelPrio){
        for(let prio in modelPrio){
            if(model.includes(modelPrio[prio]))
                return prio*2  + (model.includes('combined') ? 1:0)
        }
        return 99;
    },

    /**
     * Create predictions HTML
     * @param {Object} predictions - Predictions data
     * @returns {string} HTML string
     */
    createPredictionsHTML(model, predictions) {

        const probabilities = [
            { key: '1', value: predictions['1'], label: 'Home' },
            { key: 'X', value: predictions['X'], label: 'Draw' },
            { key: '2', value: predictions['2'], label: 'Away' }
        ];
        
        // Sort probabilities to determine highest/lowest
        const sortedProbs = [...probabilities].sort((a, b) => b.value - a.value);
        
        const probsHTML = probabilities.map(prob => {
            let className = 'probability';
            if (prob.value === sortedProbs[0].value) className += ' probability--highest';
            else if (prob.value === sortedProbs[2].value) className += ' probability--lowest';
            else className += ' probability--medium';
            
            return `<div class="${className}">${Math.round(prob.value * 100)}%</div>`;
        }).join('');
        
        return `
            <div class="prediction-model" data-id=${model}>
                <div class="prediction-model__name">${model.replace('-', ' ')}</div>
                <div class="prediction-model__goals">
                    <span class="prediction-model__goal">${predictions.H.toFixed(1)}</span>
                    <span class="prediction-model__goal-vs">-</span>
                    <span class="prediction-model__goal">${predictions.A.toFixed(1)}</span>
                </div>
                <div class="prediction-probabilities">
                    ${probsHTML}
                </div>
            </div>
        `;
    },

    /**
     * Create result HTML for resolved matches
     * @param {Object} matchInfo - Match info with results
     * @returns {string} HTML string
     */
    createResultHTML(matchInfo) {
        return `
            <div class="match-result">
                <strong>result: ${matchInfo.Home} ${matchInfo.FTHG} - ${matchInfo.FTAG} ${matchInfo.Away}</strong>
            </div>
        `;
    },

    initialiseTooltipHandling(allMatches){
        const createTooltip = function(event, matches){
            const el = event.target
            $(el).tooltip('dispose');
            $(el).tooltip({
                title: createTooltipContent(el,matches),
                html: true,
                boundary: 'window'
            }).tooltip('show');
        };

        const removeTooltip = function(event, matches){
            var tip = event.target.querySelector('.tooltip');
            if (tip) tip.remove();
        };


        document.querySelectorAll('.prediction-model').forEach(function(el) {
            el.style.position = 'relative';

            // If previously stored, remove old handlers
            if (el._mouseenterHandler) {
                el.removeEventListener('mouseenter', el._mouseenterHandler);
            }
            if (el._mouseleaveHandler) {
                el.removeEventListener('mouseleave', el._mouseleaveHandler);
            }

            // Create named wrapped handler functions and store them as properties on the element
            el._mouseenterHandler = function(event) {
                createTooltip(event, allMatches);
            };
            el._mouseleaveHandler = function(event) {
                removeTooltip(event, allMatches);
            };

            el.addEventListener('mouseenter', el._mouseenterHandler);
            el.addEventListener('mouseleave', el._mouseleaveHandler);
        });
    },
}

function createTooltipContent(element, matches){
    const match = matches.find(match=>match['match-info']['MatchId'] == element.closest('.match-card').getAttribute('data-id'))
    const model = element.getAttribute('data-id')
    
    return jsonToTable(getMatchSuggestionsForModel(match, model));
}

function getSuggestionPercentageLabel(metrics,suggestion){
    const percentage = metrics['t'+suggestion] !== 0 ?metrics[suggestion] / metrics['t'+suggestion] : NaN;
    const percentageFixed = isNaN(percentage) ? 0 : (100*percentage).toFixed(3);
    return `${percentageFixed}% (${metrics[suggestion]}/${metrics['t'+suggestion]})`
}

function jsonToTable(data) {
    const columns = Object.keys(data); // First row: headers
    
    // Start table
    let html = '<table style="border-collapse: collapse; font-size: 12px;">';
    
    // Create header row
    html += '<thead><tr>';
    html += `<th style="border: 1px solid #ddd; padding: 4px;">Suggestion</th>`;
    html += `<th style="border: 1px solid #ddd; padding: 4px;">Overall</th>`;
    html += `<th style="border: 1px solid #ddd; padding: 4px;">${columns[2]}</th>`;
    html += '</tr></thead>';
    
    // Create rows from remaining keys except 'label'
    html += '<tbody>';
    
    for(idx in data[columns[0]]){
        html += `<tr class="suggestion ${data["result"][idx]!=undefined?(data["result"][idx]?'success':'failed'):""}">`;
        for (const key of columns){
            console.log(key)
            if(key=="result")
                continue
            html += `<td style="border: 1px solid #ddd; padding: 4px;">${data[key][idx]}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';
    
    return html;
}

// ============================================================================
// FILTER MANAGEMENT
// ============================================================================

class FilterManager {
    constructor() {
        this.currentFilters = {
            search: '',
            division: 'all',
            dateFrom: '',
            dateTo: ''
        };
    }

    /**
     * Apply filters to matches
     * @param {Array} matches - Array of matches
     * @returns {Array} Filtered matches
     */
    applyFilters(matches) {
        return matches.filter(match => {
            const matchInfo = match['match-info'];
            
            // Search filter
            if (this.currentFilters.search) {
                const searchTerm = this.currentFilters.search.toLowerCase();
                const searchText = `${matchInfo.Home} ${matchInfo.Away} ${matchInfo.Div}`.toLowerCase();
                if (!searchText.includes(searchTerm)) {
                    return false;
                }
            }

            // Division filter
            if (this.currentFilters.division !== 'all' && matchInfo.Div !== this.currentFilters.division) {
                return false;
            }

            // Date filters
            if (this.currentFilters.dateFrom) {
                const matchDate = Utils.parseDate(matchInfo.MatchId);
                let date = this.currentFilters.dateFrom.split('-')
                const fromDate = new Date(date[0],date[1]-1,date[2]);
                if (matchDate < fromDate) {
                    return false;
                }
            }

            if (this.currentFilters.dateTo) {
                const matchDate = Utils.parseDate(matchInfo.MatchId);
                let date = this.currentFilters.dateTo.split('-')
                const toDate = new Date(date[0],date[1]-1,date[2]);
                if (matchDate > toDate) {
                    return false;
                }
            }

            return true;
        });
    }

    /**
     * Update filters from form inputs
     */
    updateFiltersFromForm() {
        this.currentFilters.search = DOMUtils.getElementById('search-input')?.value || '';
        this.currentFilters.division = DOMUtils.getElementById('division-filter')?.value || 'all';
        this.currentFilters.dateFrom = DOMUtils.getElementById('date-from')?.value || '';
        this.currentFilters.dateTo = DOMUtils.getElementById('date-to')?.value || '';
    }

    /**
     * Clear all filters
     */
    clearFilters() {
        this.currentFilters = {
            search: '',
            division: 'all',
            dateFrom: '',
            dateTo: ''
        };

        // Update form inputs
        const searchInput = DOMUtils.getElementById('search-input');
        const divisionFilter = DOMUtils.getElementById('division-filter');
        const dateFromInput = DOMUtils.getElementById('date-from');
        const dateToInput = DOMUtils.getElementById('date-to');

        if (searchInput) searchInput.value = '';
        if (divisionFilter) divisionFilter.value = 'all';
        if (dateFromInput) dateFromInput.value = '';
        if (dateToInput) dateToInput.value = '';
    }

    /**
     * Save filter preset
     * @param {string} name - Preset name
     */
    savePreset(name) {
        const presets = this.getPresets();
        presets[name] = { ...this.currentFilters };
        localStorage.setItem(CONFIG.STORAGE_KEYS.FILTER_PRESETS, JSON.stringify(presets));
    }

    /**
     * Load filter preset
     * @param {string} name - Preset name
     */
    loadPreset(name) {
        const presets = this.getPresets();
        if (presets[name]) {
            this.currentFilters = { ...presets[name] };
            this.updateFormFromFilters();
        }
    }

    /**
     * Get all saved presets
     * @returns {Object} Presets object
     */
    getPresets() {
        try {
            return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.FILTER_PRESETS) || '{}');
        } catch {
            return {};
        }
    }

    /**
     * Delete preset
     * @param {string} name - Preset name
     */
    deletePreset(name) {
        const presets = this.getPresets();
        delete presets[name];
        localStorage.setItem(CONFIG.STORAGE_KEYS.FILTER_PRESETS, JSON.stringify(presets));
    }

    /**
     * Update form inputs from current filters
     */
    updateFormFromFilters() {
        const searchInput = DOMUtils.getElementById('search-input');
        const divisionFilter = DOMUtils.getElementById('division-filter');
        const dateFromInput = DOMUtils.getElementById('date-from');
        const dateToInput = DOMUtils.getElementById('date-to');

        if (searchInput) searchInput.value = this.currentFilters.search;
        if (divisionFilter) divisionFilter.value = this.currentFilters.division;
        if (dateFromInput) dateFromInput.value = this.currentFilters.dateFrom;
        if (dateToInput) dateToInput.value = this.currentFilters.dateTo;
    }

    hideFilters() {
            DOMUtils.getElementById('filters').classList.add('hidden');
    }

    showFilters() {
            DOMUtils.getElementById('filters').classList.remove('hidden');
    }
}

function getMatchSuggestionsForModel(match, model){
    const divId = match['match-info']['MatchId'].split('-')[window.location.search.includes['odds']?0:1]
    const div = match['match-info']['Div']
    const modelPredictions = match['model-predictions'][model];
    const home = modelPredictions['1'];
    const draw = modelPredictions['X'];
    const away = modelPredictions['2'];
    const homeGoals = modelPredictions['H'];
    const awayGoals = modelPredictions['A'];
    
    toSuggest = {'suggestion':[],'overall':[]}
    toSuggest[div]=[]
    toSuggest['result']=[]

    match['model-suggestions'][model].forEach(suggestion=>{
        if(!suggestion['suggestions'].length)
            return;
        const overallMetrics = METRICS_DATA['overall'].metrics[model];
        const divMetrics = METRICS_DATA[divId].metrics[model];
        toSuggest['suggestion'].push(suggestion['suggestion-type']);
        toSuggest['overall'].push('');
        toSuggest[div].push('');
        toSuggest['result'].push(undefined);
        suggestion['suggestions'].forEach(s=>{

            toSuggest['suggestion'].push(s['suggestion']);
            toSuggest['overall'].push(getSuggestionPercentageLabel(overallMetrics, s['pType']))
            toSuggest[div].push(getSuggestionPercentageLabel(divMetrics, s['pType']))
            toSuggest['result'].push(s['result'])

        });
    });
    return toSuggest;
}

// ============================================================================
// DATA MANAGEMENT
// ============================================================================

class DataManager {
    /**
     * Fetch data from API
     * @returns {Promise<Array>} Array of matches
     */
    async fetchMatches() {
        try {
            Utils.setLoading(true);
            Utils.hideError();

            const response = await fetch(CONFIG.API_ENDPOINT);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            METRICS_DATA = data["metrics"]
            return this.parseMatchData(data["model-predictions"]);
        } catch (error) {
            console.error('Error fetching data:', error);
            Utils.showError('Failed to load match data. Please try again.');
            return [];
        } finally {
            Utils.setLoading(false);
        }
    }

    /**
     * Parse raw API data into match objects
     * @param {Object} rawData - Raw API data
     * @returns {Array} Parsed matches
     */
    parseMatchData(rawData) {
        const matches = [];
        
        Object.entries(rawData).forEach(([key, matchData]) => {
            if (matchData['match-info'] && matchData['model-predictions']) {
                matches.push({
                    id: key,
                    ...matchData
                });
            }
        });

        return matches;
    }

    /**
     * Categorize matches by status
     * @param {Array} matches - Array of matches
     * @returns {Object} Categorized matches
     */
    categorizeMatches(matches) {
        const currentDate = new Date().setHours(0, 0, 0, 0);
        
        return {
            upcoming: matches.filter(match => {
                const matchDate = match['match-info'].Date;
                const hasResult = match['match-info'].FTHG !== null && match['match-info'].FTAG !== null;
                return matchDate >= currentDate && !hasResult;
            }).sort((a,b)=>a['match-info'].Date-b['match-info'].Date),
            unresolved: matches.filter(match => {
                const matchDate = match['match-info'].Date;
                const hasResult = match['match-info'].FTHG !== null && match['match-info'].FTAG !== null;
                return matchDate < currentDate && !hasResult;
            }).sort((a,b)=>a['match-info'].Date-b['match-info'].Date),
            resolved: matches.filter(match => {
                const hasResult = match['match-info'].FTHG !== null && match['match-info'].FTAG !== null;
                return hasResult;
            }).sort((a,b)=>b['match-info'].Date-a['match-info'].Date)
        };
    }
}

// ============================================================================
// MAIN APPLICATION CLASS
// ============================================================================

class FootballAnalyticsApp {
    constructor() {
        this.state = new AppState();
        this.filterManager = new FilterManager();
        this.dataManager = new DataManager();
        
        // Initialize charts manager
        this.state.chartsManager = new ChartsManager();
    }

    /**
     * Initialize the application
     */
    async init() {
        this.setupEventListeners();
        await this.loadData();
        this.initializeCharts();
        this.setupFilters();
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tabs__tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchTab(tab.dataset.tab);
            });
        });

        // Filter events
        const searchInput = DOMUtils.getElementById('search-input');
        const divisionFilter = DOMUtils.getElementById('division-filter');
        const dateFromInput = DOMUtils.getElementById('date-from');
        const dateToInput = DOMUtils.getElementById('date-to');
        const clearFiltersBtn = DOMUtils.getElementById('clear-filters');

        if (searchInput) searchInput.addEventListener('input', Utils.debounce(() => this.applyFilters(), 300));
        if (divisionFilter) divisionFilter.addEventListener('change', () => this.applyFilters());
        if (dateFromInput) dateFromInput.addEventListener('change', () => this.applyFilters());
        if (dateToInput) dateToInput.addEventListener('change', () => this.applyFilters());
        if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', () => this.clearFilters());

        // Charts division selector
        const chartsSelector = DOMUtils.getElementById('charts-division-selector');
        if (chartsSelector) {
            chartsSelector.addEventListener('change', (e) => {
                this.state.chartsManager.updateCharts(e.target.value);
            });
        }

    }

    /**
     * Initialize charts
     */
    initializeCharts() {
        // Initialize charts with metrics data
        this.state.chartsManager.initialize(METRICS_DATA);
        
        // Populate division selector
        this.populateChartsDivisionSelector();
    }

    /**
     * Populate charts division selector
     */
    populateChartsDivisionSelector() {
        const selector = DOMUtils.getElementById('charts-division-selector');
        if (!selector) return;

        const divisions = this.state.chartsManager.getAvailableDivisions();
        selector.innerHTML = '';
        
        divisions.forEach(division => {
            const option = document.createElement('option');
            option.value = division.key;
            option.textContent = division.name;
            selector.appendChild(option);
        });
    }

    /**
     * Load match data
     */
    async loadData() {
        this.state.allMatches = await this.dataManager.fetchMatches();
        this.updateMatchDisplays();
    }

    /**
     * Setup filter UI
     */
    setupFilters() {
        this.populateDivisionFilter();
        this.loadPresets();
    }

    /**
     * Populate division filter dropdown
     */
    populateDivisionFilter() {
        const divisionFilter = DOMUtils.getElementById('division-filter');
        if (!divisionFilter) return;

        const divisions = [...new Set(this.state.allMatches.map(match => match['match-info'].Div))];
        
        divisionFilter.innerHTML = '<option value="all">All Divisions</option>';
        divisions.forEach(division => {
            const option = document.createElement('option');
            option.value = division;
            option.textContent = division;
            divisionFilter.appendChild(option);
        });
    }

    /**
     * Load and populate preset selector
     */
    loadPresets() {
        const presetSelect = DOMUtils.getElementById('preset-select');
        if (!presetSelect) return;

        const presets = this.filterManager.getPresets();
        presetSelect.innerHTML = '<option value="">Select Preset</option>';
        
        Object.keys(presets).forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            presetSelect.appendChild(option);
        });
    }

    /**
     * Switch to specific tab
     * @param {string} tabName - Tab name
     */
    switchTab(tabName) {
        this.state.currentTab = tabName;
        DOMUtils.switchTab(tabName);
        
        if (tabName !== 'charts') {
            this.filterManager.showFilters();
            this.updateMatchDisplays();
        } else {
            this.filterManager.hideFilters();
        }
    }

    /**
     * Apply current filters
     */
    applyFilters() {
        this.filterManager.updateFiltersFromForm();
        this.updateMatchDisplays();
    }

    /**
     * Clear all filters
     */
    clearFilters() {
        this.filterManager.clearFilters();
        this.updateMatchDisplays();
    }

    /**
     * Update match displays based on current filters and tab
     */
    updateMatchDisplays() {
        const categorized = this.dataManager.categorizeMatches(this.state.allMatches);
        
        // Apply filters to each category
        Object.keys(categorized).forEach(category => {
            categorized[category] = this.filterManager.applyFilters(categorized[category]);
        });

        // Update tab counts
        DOMUtils.updateTabCounts({
            upcoming: categorized.upcoming.length,
            unresolved: categorized.unresolved.length,
            resolved: categorized.resolved.length
        });

        // Update current tab display
        this.renderMatches(categorized[this.state.currentTab] || []);
        DOMUtils.initialiseTooltipHandling(this.state.allMatches);
    }

    /**
     * Render matches for current tab
     * @param {Array} matches - Matches to render
     */
    renderMatches(matches) {
        const container = DOMUtils.getElementById(`${this.state.currentTab}-matches`);
        const noMatchesEl = DOMUtils.getElementById(`${this.state.currentTab}-no-matches`);

        if (!container) return;
    
        if (matches.length === 0) {
            container.innerHTML = '';
            noMatchesEl.classList.remove('hidden');
        } else {
            noMatchesEl.classList.add('hidden');
            container.innerHTML = matches.map(match => DOMUtils.createMatchCard(match)).join('');
        }

    }
}

// ============================================================================
// APPLICATION INITIALIZATION
// ============================================================================

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new FootballAnalyticsApp();
    app.init().catch(error => {
        console.error('Failed to initialize application:', error);
        Utils.showError('Failed to initialize application. Please refresh the page.');
    });
});