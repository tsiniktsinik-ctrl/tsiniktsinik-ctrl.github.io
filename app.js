// app.js - Football Statistical Analysis Pro

// Global State
let footballData = [];
let filteredData = [];
const charts = {};
const chartColors = [
    '#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F',
    '#DB4545', '#D2BA4C', '#964325', '#944454', '#13343B'
];

// Entry Point
document.addEventListener('DOMContentLoaded', async () => {
    showLoading();
    await fetchFootballData();
    setupTabs();
    setupFilters();
    updateDashboard();
    renderForecasts();
    renderResults();
    setTimeout(() => {
        hideLoading();
    }, 1000);
});

// Data Fetching
async function fetchFootballData() {
    const url = 'https://s5y2qnhsfe.execute-api.eu-central-1.amazonaws.com/';
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const rawData = await response.json();
        footballData = Array.isArray(rawData) ? rawData : [rawData];
        if (!footballData.length || !footballData[0]?.home) throw new Error('Invalid data');
        filteredData = [...footballData];
    } catch (err) {
        console.warn('Falling back to mock data:', err.message);
        footballData = data;
        filteredData = [...footballData];
    }
}

// Tab Navigation
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const tabId = btn.dataset.tab;
            document.getElementById(tabId)?.classList.add('active');
            if (tabId === 'analytics') setTimeout(resizeCharts, 100);
        });
    });
}

function resizeCharts() {
    Object.values(charts).forEach(chart => chart?.resize?.());
}

// Filters
function setupFilters() {
    populateFilter('countryFilter', getUniqueValues('country'), 'All Countries');
    populateFilter('countryHistoricalFilter', getUniqueValues('country'), 'All Countries');
    populateFilter('weekFilter', getUniqueValues('week').sort((a, b) => b - a), 'All Weeks', v => `Week ${v}`);
    [
        'countryFilter', 'countryHistoricalFilter', 'leagueFilter',
        'teamSearch', 'weekFilter', 'resultTypeFilter', 'forecastTypeFilter'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener(el.type === 'text' ? 'input' : 'change', applyFilters);
        }
    });
}

function populateFilter(id, values, defaultLabel, labelFn = v => v) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `<option value="">${defaultLabel}</option>`;
    values.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = labelFn(v);
        el.appendChild(opt);
    });
}

function getUniqueValues(key) {
    return [...new Set(footballData.map(m => m[key])).values()].filter(Boolean);
}

// Filtering Logic
function applyFilters() {
    const filters = {
        country: getValue('countryFilter'),
        countryHistorical: getValue('countryHistoricalFilter'),
        league: getValue('leagueFilter'),
        search: getValue('teamSearch').toLowerCase(),
        week: getValue('weekFilter'),
        resultType: getValue('resultTypeFilter'),
        forecastType: getValue('forecastTypeFilter')
    };
    filteredData = footballData.filter(match => (
        (!filters.country || match.country === filters.country) &&
        (!filters.countryHistorical || match.country === filters.countryHistorical) &&
        (!filters.league || match.league === filters.league) &&
        (!filters.search || [match.home, match.away].some(t => t?.toLowerCase().includes(filters.search))) &&
        (!filters.week || match.week == filters.week) &&
        filterByResultType(match, filters.resultType) &&
        filterByForecastType(match, filters.forecastType)
    ));
    renderForecasts();
    renderResults();
}

function getValue(id) {
    return document.getElementById(id)?.value || '';
}

function filterByResultType(match, type) {
    if (!type || !isMatchCompleted(match)) return true;
    const checks = {
        'correct-forecasts': checkIsForecastCorrect,
        'incorrect-forecasts': m => !checkIsForecastCorrect(m),
        'correct-goals': checkIsGoalsCorrect,
        'incorrect-goals': m => !checkIsGoalsCorrect(m),
        'correct-combos': checkIsBothCorrect,
        'incorrect-combos': m => !checkIsBothCorrect(m)
    };
    return checks[type]?.(match) ?? true;
}

function filterByForecastType(match, type) {
    if (!type) return true;
    const hasForecast = match.result_suggestion;
    const hasGoals = match.goals_suggestion;
    switch (type) {
        case 'forecast': return !!hasForecast;
        case 'goals': return !!hasGoals;
        case 'combo': return !!hasForecast && !!hasGoals;
        case 'only-forecast': return !!hasForecast && !hasGoals;
        case 'only-goals': return !!hasGoals && !hasForecast;
        default: return true;
    }
}

// Dashboard
function updateDashboard() {
    const total = footballData.length;
    const completed = footballData.filter(isMatchCompleted);
    const upcoming = footballData.filter(m => !isMatchCompleted(m));
    const forecastAcc = calcAccuracy(completed, checkIsForecastCorrect);
    const goalsAcc = calcAccuracy(completed, checkIsGoalsCorrect);
    const chosenLabel = forecastAcc >= goalsAcc ? 'Forecast' : 'Goals';
    const accuracy = Math.max(forecastAcc, goalsAcc);
    const bestLeague = getBestLeague(completed);

    setText('totalMatches', total);
    setText('accuracy', `${accuracy}%`);
    setText('accuracyLabel', chosenLabel);
    setText('bestLeague', bestLeague);
    setText('upcomingMatches', upcoming.length);

    [createLeagueChart, createLeagueGoalsChart, createForecastTypeAccuracyChart, createTimelineChart, createProbabilityChart, createGoalsChart, createWeeklyChart].forEach((fn, i) =>
        setTimeout(() => { try { fn(); } catch (e) { console.error(e); } }, i * 100)
    );
}

function calcAccuracy(matches, checkFn) {
    const valid = matches.map(checkFn).filter(v => v !== undefined);
    const correct = valid.filter(Boolean).length;
    return valid.length ? Math.round((correct / valid.length) * 100) : 0;
}

function getBestLeague(matches) {
    const stats = {};
    matches.forEach(m => {
        const c = m.country;
        if (!stats[c]) stats[c] = { correct: 0, total: 0 };
        if (checkIsBothCorrect(m) !== undefined) {
            stats[c].total++;
            if (checkIsBothCorrect(m)) stats[c].correct++;
        }
    });
    return Object.entries(stats).reduce((best, [league, { correct, total }]) => {
        const acc = total ? correct / total : 0;
        return acc > best.acc ? { league, acc } : best;
    }, { league: '', acc: 0 }).league;
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// Forecasts & Results Rendering
function renderForecasts() {
    renderMatches('forecastsGrid', filteredData.filter(m => !isMatchCompleted(m)), false, 'No upcoming match forecasts found with current filters.');
}

function renderResults() {
    renderMatches('resultsGrid', filteredData.filter(isMatchCompleted), true, 'No completed statistical analyses found with current filters.');
}

function renderMatches(containerId, matches, showResult, emptyMsg) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = matches.length
        ? matches.map(m => createMatchCard(m, showResult)).join('')
        : `<div class="card"><div class="card__body"><p>${emptyMsg}</p></div></div>`;
}

// Match Card
function createMatchCard(match, showResult = false) {
    const isForecastCorrect = checkIsForecastCorrect(match);
    const isGoalsCorrect = checkIsGoalsCorrect(match);
    const isBothCorrect = checkIsBothCorrect(match);
    const countryCode = getCountryCode(match.country);
    return `
        <div class="match-card">
            <div class="match-header">
                <div class="league-info">
                    <div class="country-flag">${countryCode}</div>
                    <span class="league-name">${match.league}</span>
                </div>
                <div class="match-week">Week ${match.week}</div>
            </div>
            <div class="match-teams">
                <div class="team-matchup">
                    <div class="team-name home">${match.home}</div>
                    <div class="vs-separator">VS</div>
                    <div class="team-name away">${match.away}</div>
                </div>
            </div>
            <div class="match-predictions">
                ${renderProbabilityRow('Home', match.home_forecast)}
                ${renderProbabilityRow('Draw', match.draw_forecast)}
                ${renderProbabilityRow('Away', match.away_forecast)}
                <div class="goals-prediction">
                    <span class="goals-label">Score Forecast:</span>
                    <span class="goals-value">${match.home_goals_forecast} - ${match.away_goals_forecast}</span>
                </div>
                <div class="goals-prediction">
                    <span class="goals-label">Suggested:</span>
                    <span class="goals-value">
                        ${match.result_suggestion}
                        ${match.result_suggestion !== '' && match.goals_suggestion !== '' ? ' - ' : ''}
                        ${match.goals_suggestion}
                    </span>
                </div>
            </div>
            ${showResult ? renderMatchResult(match, isForecastCorrect, isGoalsCorrect, isBothCorrect) : ''}
        </div>
    `;
}

function renderProbabilityRow(label, prob) {
    return `
        <div class="prediction-row">
            <span class="prediction-label">${label}</span>
            <div class="probability-bar">
                <div class="probability-fill ${label.split(" ")[0].toLowerCase()}" style="width: ${prob * 100}%"></div>
            </div>
            <span class="probability-value">${Math.round(prob * 100)}%</span>
        </div>
    `;
}

function renderMatchResult(match, isForecastCorrect, isGoalsCorrect, isBothCorrect) {
    return `
        <div class="match-result">
            <div class="result-score">
                <span class="actual-score">${match.home_score} - ${match.away_score}</span>
            </div>
            <div class="prediction-accuracy">
                ${showCorrectIncorrect(isForecastCorrect, "Forecast")}
                ${showCorrectIncorrect(isGoalsCorrect, "Goals")}
            </div>
        </div>
    `;
}

// Prediction Checks
function checkIsForecastCorrect(match) {
    if (!match.result_suggestion || match.result_suggestion === '' || !isMatchCompleted(match)) return undefined;
    if (match.result_suggestion.includes('1') && parseFloat(match.home_score) > parseFloat(match.away_score)) return true;
    if (match.result_suggestion.includes('X') && parseFloat(match.home_score) === parseFloat(match.away_score)) return true;
    if (match.result_suggestion.includes('2') && parseFloat(match.home_score) < parseFloat(match.away_score)) return true;
    return false;
}

function checkIsGoalsCorrect(match) {
    if (!match.goals_suggestion || match.goals_suggestion === '' || !isMatchCompleted(match)) return undefined;
    const totalGoals = parseFloat(match.home_score) + parseFloat(match.away_score);
    if (match.goals_suggestion.includes('Over 2.5') && totalGoals > 2.5) return true;
    if (match.goals_suggestion.includes('Over 1.5') && totalGoals > 1.5) return true;
    if (match.goals_suggestion.includes('Under 3.5') && totalGoals < 3.5) return true;
    if (match.goals_suggestion.includes('BTTS Yes') && parseFloat(match.home_score) > 0 && parseFloat(match.away_score) > 0) return true;
    if (match.goals_suggestion.includes('BTTS No') && (parseFloat(match.home_score) === 0 || parseFloat(match.away_score) === 0)) return true;
    return false;
}

function checkIsBothCorrect(match) {
    const forecast = checkIsForecastCorrect(match);
    const goal = checkIsGoalsCorrect(match);
    return forecast !== undefined && goal !== undefined ? forecast && goal : undefined;
}

function showCorrectIncorrect(isCorrect, label) {
    if (isCorrect === undefined) return '';
    return `<span class="${isCorrect ? 'accuracy-correct' : 'accuracy-incorrect'}">
        ${isCorrect ? '✓ Accurate ' : '✗ Inaccurate '}${label}
    </span>`;
}

// Utilities
function getCountryCode(country) {
    const codes = { 'Austria': 'AT', 'Belgium': 'BE', 'Brazil': 'BR' };
    return codes[country] || country.substring(0, 2).toUpperCase();
}

function isMatchCompleted(match) {
    return match.home_score !== null && match.home_score !== '' &&
           match.away_score !== null && match.away_score !== '';
}

// Chart Creation
function createLeagueChart() {
    createBarChart(
        'leagueChart',
        getAccuracyByCountry(footballData, checkIsForecastCorrect),
        'Forecast Accuracy %'
    );
}

function createLeagueGoalsChart() {
    createBarChart(
        'leagueGoalsChart',
        getAccuracyByCountry(footballData, checkIsGoalsCorrect),
        'Goals Accuracy %'
    );
}

function createBarChart(canvasId, { totals, labels, data }, label) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    charts[canvasId]?.destroy();
    charts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                totals,
                label,
                data,
                backgroundColor: chartColors.slice(0, labels.length),
                borderColor: chartColors.slice(0, labels.length),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: { callback: v => v + '%' }
                }
            },
            plugins: { 
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.dataset.label || '';
                            const value = context.raw || 0;
                            return `${value}% out of ${context.dataset.totals[context.dataIndex]}`;
                        }
                    }
                }
            }
        }
    });
}

function getAccuracyByCountry(data, checkFn) {
    const completed = data.filter(m => isMatchCompleted(m) && checkFn(m) !== undefined);
    const stats = {};
    completed.forEach(m => {
        if (!stats[m.country]) stats[m.country] = { correct: 0, total: 0 };
        if (checkFn(m)) stats[m.country].correct++;
        stats[m.country].total++;
    });
    const labels = Object.keys(stats);
    const acc = labels.map(c => stats[c].total ? Math.round((stats[c].correct / stats[c].total) * 100) : 0);
    return { totals: labels.map(country=>stats[country].total), labels, data: acc };
}

function createForecastTypeAccuracyChart() {
   createBarChart(
       'forecastTypeAccuracyChart',
       getAccuracyByForecastType(footballData),
       'Forecast Type Accuracy %'
   );
}

function getAccuracyByForecastType(data) {
    const types = ['1', 'X', '2', '1X', '2X', '12', 'Over 2.5', 'Over 1.5', 'Under 3.5', 'BTTS Yes', 'BTTS No'];
    const stats = {};
    types.forEach(type => stats[type] = { correct: 0, total: 0 });
    data.forEach(m => {
        if (m.result_suggestion !== undefined && m.result_suggestion != '') {
            if(checkIsForecastCorrect(m))
                stats[m.result_suggestion].correct++;
            stats[m.result_suggestion].total++;
        }
        if (m.goals_suggestion !== undefined && m.goals_suggestion != '') {
            if(checkIsGoalsCorrect(m))
                stats[m.goals_suggestion].correct++;
            stats[m.goals_suggestion].total++;
        }
    });
    Object.keys(stats).forEach(type => {
        if (stats[type].total === 0) delete stats[type];
    });
    const labels = Object.keys(stats);
    const acc = labels.map(c => stats[c].total ? Math.round((stats[c].correct / stats[c].total) * 100) : 0);
    return { totals: labels.map(country=>stats[country].total), labels, data: acc };
}

function createTimelineChart() {
    const canvas = document.getElementById('timelineChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    charts.timelineChart?.destroy();
    const completed = footballData.filter(isMatchCompleted);
    const weeks = getUniqueValuesFromArray(completed, 'week').sort((a, b) => a - b);
    const accuracyData = weeks.map(week => {
        const weekMatches = completed.filter(m => m.week === week);
        const correct = weekMatches.filter(m => m.result === m.prediction).length;
        return weekMatches.length ? Math.round((correct / weekMatches.length) * 100) : 0;
    });
    charts.timelineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: weeks.map(w => `Week ${w}`),
            datasets: [{
                label: 'Forecast Accuracy %',
                data: accuracyData,
                borderColor: chartColors[0],
                backgroundColor: chartColors[0] + '20',
                borderWidth: 2,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } }
        }
    });
}

function createProbabilityChart() {
    const canvas = document.getElementById('probabilityChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    charts.probabilityChart?.destroy();
    const predictions = footballData.map(m => {
        const probs = [m.home_prob, m.draw_prob, m.away_prob];
        const maxIdx = probs.indexOf(Math.max(...probs));
        return ['H', 'D', 'A'][maxIdx];
    });
    const counts = { H: 0, D: 0, A: 0 };
    predictions.forEach(p => counts[p]++);
    charts.probabilityChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Home Win Forecast', 'Draw Forecast', 'Away Win Forecast'],
            datasets: [{
                data: [counts.H, counts.D, counts.A],
                backgroundColor: [chartColors[0], chartColors[1], chartColors[2]],
                borderColor: '#fff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

function createGoalsChart() {
    const canvas = document.getElementById('goalsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    charts.goalsChart?.destroy();
    const completed = footballData.filter(isMatchCompleted);
    const data = completed.map(m => ({
        x: parseFloat(m.home_goals_forecast) + parseFloat(m.away_goals_forecast),
        y: parseFloat(m.home_score) + parseFloat(m.away_score)
    }));
    charts.goalsChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Forecasted vs Actual Goals',
                data,
                backgroundColor: chartColors[0],
                borderColor: chartColors[0],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Forecasted Total Goals' } },
                y: { title: { display: true, text: 'Actual Total Goals' } }
            }
        }
    });
}

function createWeeklyChart() {
    const canvas = document.getElementById('weeklyChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    charts.weeklyChart?.destroy();
    const completed = footballData.filter(isMatchCompleted);
    const weeks = getUniqueValuesFromArray(completed, 'week').sort((a, b) => a - b);
    const weeklyData = weeks.map(week => completed.filter(m => m.week === week).length);
    charts.weeklyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: weeks.map(w => `Week ${w}`),
            datasets: [{
                label: 'Statistical Analyses Completed',
                data: weeklyData,
                backgroundColor: chartColors[1],
                borderColor: chartColors[1],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}

function getUniqueValuesFromArray(arr, key) {
    return [...new Set(arr.map(item => item[key]))].filter(Boolean);
}

// Loading Overlay
function showLoading() {
    document.getElementById('loadingOverlay')?.classList.remove('hidden');
}
function hideLoading() {
    document.getElementById('loadingOverlay')?.classList.add('hidden');
}
