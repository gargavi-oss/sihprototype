/**
 * RailOpt — Alternate Schedule Calendar Page
 * All demo data is hardcoded to match the actual demo CSVs.
 */

// ========================================
// DEMO DATA (mirrors actual demo_data CSVs)
// ========================================

const TRACKS = [
    { id: 'R1', name: 'R1 Entry', sub: 'Main Up Line' },
    { id: 'R2', name: 'R2 Entry', sub: 'Alt Up Line' },
    { id: 'R3', name: 'R3 Shared', sub: 'Corridor' },
    { id: 'R4', name: 'R4 Bypass', sub: 'Branch Line' },
    { id: 'R5', name: 'R5 West', sub: 'Branch' },
    { id: 'R6', name: 'R6 Exit', sub: 'Terminal A' },
    { id: 'R7', name: 'R7 Exit', sub: 'Terminal B' },
];

// From tdms_blocks.csv & smms_blocks.csv (0-indexed in CSV, display as 1-indexed)
const MAINTENANCE_BLOCKS = [
    { track: 'R3', section: 'S5', startTime: 0, duration: 60, deadline: 80, dept: 'TDMS', type: 'Power Block' },
    { track: 'R3', section: 'S3', startTime: 10, duration: 50, deadline: 80, dept: 'TDMS', type: 'Power Block' },
    { track: 'R5', section: 'S5', startTime: 0, duration: 60, deadline: 80, dept: 'SMMS', type: 'Traffic Block' },
    { track: 'R4', section: 'S1', startTime: 0, duration: 80, deadline: 80, dept: 'SMMS', type: 'Traffic Block' },
];

// From train_schedule.csv — simplified route summaries
const TRAINS = [
    { id: 1, engine: 'D', category: 1, name: 'Train #1 Diesel Express', route: ['R11','R1','R3','R5','R6','R13'], startT: 0, endT: 33, color: '#3b82f6',
      trackTimes: { 'R1': [2,6], 'R3': [7,17], 'R5': [18,26], 'R6': [27,31] } },
    { id: 2, engine: 'E', category: 1, name: 'Train #2 Electric Local', route: ['R12','R2','R3','R5','R6','R13'], startT: 5, endT: 38, color: '#0ea5e9',
      trackTimes: { 'R2': [7,12], 'R3': [12,22], 'R5': [23,31], 'R6': [32,36] } },
    { id: 3, engine: 'H', category: 2, name: 'Train #3 Hybrid Freight', route: ['R11','R1','R3','R4','R15'], startT: 10, endT: 35, color: '#8b5cf6',
      trackTimes: { 'R1': [12,16], 'R3': [17,27], 'R4': [28,31] } },
    { id: 4, engine: 'D', category: 1, name: 'Train #4 Diesel Cargo', route: ['R12','R2','R3','R5','R7','R14'], startT: 15, endT: 53, color: '#f59e0b',
      trackTimes: { 'R2': [17,22], 'R3': [23,33], 'R5': [34,42], 'R7': [43,50] } },
    { id: 5, engine: 'E', category: 2, name: 'Train #5 Electric Express', route: ['R11','R1','R3','R9','R17'], startT: 21, endT: 50, color: '#10b981',
      trackTimes: { 'R1': [23,27], 'R3': [28,38], 'R5': [39,47] } },
    { id: 6, engine: 'H', category: 1, name: 'Train #6 Hybrid Local', route: ['R12','R2','R3','R5','R6','R13'], startT: 26, endT: 59, color: '#ec4899',
      trackTimes: { 'R2': [28,33], 'R3': [34,44], 'R5': [45,53], 'R6': [54,58] } },
    { id: 7, engine: 'D', category: 2, name: 'Train #7 Diesel Freight', route: ['R12','R2','R3','R5','R7','R14'], startT: 31, endT: 65, color: '#f97316',
      trackTimes: { 'R2': [33,38], 'R3': [39,49], 'R5': [50,58], 'R7': [59,63] } },
    { id: 8, engine: 'E', category: 1, name: 'Train #8 Electric Express', route: ['R11','R1','R3','R5','R6','R13'], startT: 36, endT: 69, color: '#06b6d4',
      trackTimes: { 'R1': [38,42], 'R3': [43,53], 'R5': [54,62], 'R6': [63,67] } },
    { id: 9, engine: 'H', category: 2, name: 'Train #9 Hybrid Cargo', route: ['R12','R2','R3','R4','R15'], startT: 41, endT: 65, color: '#a855f7',
      trackTimes: { 'R2': [43,48], 'R3': [49,59], 'R4': [60,63] } },
];

// Detected conflicts (trains whose route on a track overlaps a maintenance block)
const CONFLICTS = [
    { trainId: 1, track: 'R3', reason: 'Train #1 passes R3 at t=7–17, overlaps TDMS block on R3 S5 (t=0–60) and R3 S3 (t=10–60)',
      conflictStart: 7, conflictEnd: 17 },
    { trainId: 3, track: 'R3', reason: 'Train #3 passes R3 at t=17–27, overlaps TDMS block on R3 S3 (t=10–60)',
      conflictStart: 17, conflictEnd: 27 },
    { trainId: 5, track: 'R5', reason: 'Train #5 passes R5 at t=39–47, overlaps SMMS block on R5 S5 (t=0–60)',
      conflictStart: 39, conflictEnd: 47 },
];

// AI-suggested alternate routes
const REROUTES = [
    {
        trainId: 1, train: TRAINS[0],
        originalDesc: 'Via R1 → R3 (Shared Corridor) → R5 → R6',
        originalConflict: 'Direct overlap with TDMS power block on R3 S5 (t=0–60)',
        newDesc: 'Via R1 → R4 (Bypass) → R5 → R6',
        newDetail: 'Bypasses R3 corridor entirely using R4 branch line',
        impact: '+8 min travel time · 0 conflicts',
        altTrackTimes: { 'R1': [2,6], 'R4': [7,18], 'R5': [19,27], 'R6': [28,32] },
    },
    {
        trainId: 3, train: TRAINS[2],
        originalDesc: 'Via R1 → R3 (Shared Corridor) → R4',
        originalConflict: 'Overlap with TDMS power block on R3 S3 (t=10–60)',
        newDesc: 'Via R2 (Alt Entry) → R4 (Direct Bypass)',
        newDetail: 'Rerouted through R2 alt entry, skipping R3 completely',
        impact: '+12 min travel time · 0 conflicts',
        altTrackTimes: { 'R2': [12,18], 'R4': [19,27] },
    },
    {
        trainId: 5, train: TRAINS[4],
        originalDesc: 'Via R1 → R3 → R5 (West Branch)',
        originalConflict: 'Overlap with SMMS traffic block on R5 S5 (t=0–60)',
        newDesc: 'Time-shifted: departs at t=62 after R5 block clears',
        newDetail: 'Held at R3 junction until maintenance window closes at t=60',
        impact: '+5 min wait · 0 conflicts',
        altTrackTimes: { 'R1': [23,27], 'R3': [28,38], 'R5': [62,70] },
    },
];

// ========================================
// STATE
// ========================================
let showOriginal = true;
let showRerouted = true;
let showConflicts = true;

const TIME_START = 0;
const TIME_END = 80;
const TIME_STEP = 5; // Group every 5 time units into 1 row
const NUM_ROWS = (TIME_END - TIME_START) / TIME_STEP;

// ========================================
// CALENDAR RENDERING
// ========================================
function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const numCols = TRACKS.length + 1; // +1 for time gutter
    grid.style.gridTemplateColumns = `80px repeat(${TRACKS.length}, 1fr)`;

    let html = '';

    // Header row
    html += `<div class="cal-header-cell">Time</div>`;
    TRACKS.forEach(t => {
        html += `<div class="cal-header-cell">
            <div class="track-name">${t.name}</div>
            <div class="track-sub">${t.sub}</div>
        </div>`;
    });

    // Time rows
    for (let row = 0; row < NUM_ROWS; row++) {
        const tStart = TIME_START + row * TIME_STEP;
        const tEnd = tStart + TIME_STEP;
        const timeLabel = `t${tStart} – t${tEnd}`;

        // Time gutter cell
        html += `<div class="cal-time-cell">${timeLabel}</div>`;

        // Track cells
        TRACKS.forEach((track, colIdx) => {
            const cellId = `cell-${row}-${colIdx}`;
            html += `<div class="cal-cell" id="${cellId}" data-track="${track.id}" data-tstart="${tStart}" data-tend="${tEnd}">`;

            // Maintenance blocks
            MAINTENANCE_BLOCKS.forEach(block => {
                if (block.track === track.id) {
                    const blockStart = block.startTime;
                    const blockEnd = block.startTime + block.duration;
                    if (blockStart < tEnd && blockEnd > tStart) {
                        // Calculate height proportion within this cell
                        const overlapStart = Math.max(blockStart, tStart);
                        const overlapEnd = Math.min(blockEnd, tEnd);
                        const topPct = ((overlapStart - tStart) / TIME_STEP) * 100;
                        const heightPct = ((overlapEnd - overlapStart) / TIME_STEP) * 100;
                        html += `<div class="maint-block" style="top:${topPct}%;height:${heightPct}%;" title="${block.dept}: ${block.track} ${block.section} (t${blockStart}–t${blockEnd})">
                            <span class="material-symbols-outlined">build</span>
                            ${block.section} ${block.dept}
                        </div>`;
                    }
                }
            });

            // Original train routes
            TRAINS.forEach(train => {
                const times = train.trackTimes[track.id];
                if (times) {
                    const [trainStart, trainEnd] = times;
                    if (trainStart < tEnd && trainEnd > tStart) {
                        const overlapStart = Math.max(trainStart, tStart);
                        const overlapEnd = Math.min(trainEnd, tEnd);
                        const topPct = ((overlapStart - tStart) / TIME_STEP) * 100 + 5;
                        const heightPx = 8;

                        // Check if this cell has a conflict
                        const isConflict = CONFLICTS.some(c =>
                            c.trainId === train.id && c.track === track.id &&
                            c.conflictStart < tEnd && c.conflictEnd > tStart
                        );

                        html += `<div class="train-bar original ${showOriginal ? '' : 'hidden-route'}" 
                            style="top:${topPct}%;background:${train.color}55;border-color:${train.color}99;" 
                            title="Train #${train.id} (${train.engine}) t${trainStart}–t${trainEnd}"
                            data-train="${train.id}"></div>`;

                        if (isConflict) {
                            html += `<div class="conflict-marker ${showConflicts ? '' : 'hidden-conflict'}" 
                                data-conflict-train="${train.id}" 
                                title="⚠ Conflict: Train #${train.id} × Maintenance"></div>`;
                        }
                    }
                }
            });

            // Rerouted train bars
            REROUTES.forEach(reroute => {
                const altTimes = reroute.altTrackTimes[track.id];
                if (altTimes) {
                    const [altStart, altEnd] = altTimes;
                    if (altStart < tEnd && altEnd > tStart) {
                        const overlapStart = Math.max(altStart, tStart);
                        const topPct = ((overlapStart - tStart) / TIME_STEP) * 100 + 55;

                        html += `<div class="train-bar rerouted ${showRerouted ? '' : 'hidden-route'}" 
                            style="top:${topPct}%;" 
                            title="✅ Rerouted Train #${reroute.trainId} t${altStart}–t${altEnd}"
                            data-reroute-train="${reroute.trainId}"></div>`;
                    }
                }
            });

            html += `</div>`;
        });
    }

    grid.innerHTML = html;
}

// ========================================
// TOGGLE BUTTONS
// ========================================
function toggleOriginal() {
    showOriginal = !showOriginal;
    const btn = document.getElementById('toggle-original');
    btn.classList.toggle('active', showOriginal);
    document.querySelectorAll('.train-bar.original').forEach(el => {
        el.classList.toggle('hidden-route', !showOriginal);
    });
}

function toggleRerouted() {
    showRerouted = !showRerouted;
    const btn = document.getElementById('toggle-rerouted');
    btn.classList.toggle('active-green', showRerouted);
    document.querySelectorAll('.train-bar.rerouted').forEach(el => {
        el.classList.toggle('hidden-route', !showRerouted);
    });
}

function toggleConflicts() {
    showConflicts = !showConflicts;
    const btn = document.getElementById('toggle-conflicts');
    btn.classList.toggle('active-red', showConflicts);
    document.querySelectorAll('.conflict-marker').forEach(el => {
        el.classList.toggle('hidden-conflict', !showConflicts);
    });
}

// ========================================
// ROUTE COMPARISON CARDS
// ========================================
function renderRouteCards() {
    const container = document.getElementById('route-cards');
    let html = '';

    REROUTES.forEach(reroute => {
        const train = reroute.train;
        const engineClass = train.engine === 'D' ? 'diesel' : train.engine === 'H' ? 'hybrid' : 'electric';
        const engineLabel = train.engine === 'D' ? 'DSL' : train.engine === 'H' ? 'HYB' : 'ELC';
        const optimizedClass = reroute.trainId === 5 ? 'optimized-green' : 'optimized-blue';
        const labelClass = reroute.trainId === 5 ? 'new-label-green' : 'new-label';

        html += `
        <div class="route-card">
            <div class="route-card-header">
                <div style="display:flex;align-items:center;gap:0.75rem;">
                    <div class="train-badge ${engineClass}">${engineLabel}</div>
                    <div class="train-info">
                        <h3>
                            ${train.name}
                            <span class="conflict-cleared-badge">Conflict Cleared</span>
                        </h3>
                        <p>Engine: ${train.engine === 'D' ? 'Diesel' : train.engine === 'H' ? 'Hybrid' : 'Electric'} · Category ${train.category} · Delay: ${train.id === 2 ? '2' : train.id === 4 ? '3' : train.id === 5 ? '1' : '0'} time units</p>
                    </div>
                </div>
                <div class="route-impact">${reroute.impact}</div>
            </div>
            <div class="route-diff-grid">
                <div class="route-diff-card original">
                    <div class="route-diff-label original-label">Original Route</div>
                    <div class="route-diff-text">${reroute.originalDesc}</div>
                    <div class="route-diff-detail conflict">${reroute.originalConflict}</div>
                </div>
                <div class="route-diff-card ${optimizedClass}">
                    <div class="route-diff-label ${labelClass}">AI-Optimized Route</div>
                    <div class="route-diff-text">${reroute.newDesc}</div>
                    <div class="route-diff-detail clear">${reroute.newDetail}</div>
                </div>
            </div>
        </div>`;
    });

    container.innerHTML = html;
}

// ========================================
// INIT
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    renderCalendar();
    renderRouteCards();
});
