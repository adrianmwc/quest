/**
 * AMAZING RACE: OFFLINE EDITION - MASTER SCRIPT
 * Features: Embedded Data, .wav Audio, Vibration, Admin Skip, Offline Result Saving
 */

// --- 1. CONFIGURATION & STATE ---
let allTasks = [];
let completedTasks = JSON.parse(localStorage.getItem('completedTasks')) || [];
let hintsUsed = JSON.parse(localStorage.getItem('hintsUsed')) || [];
let firstOpenedAt = JSON.parse(localStorage.getItem('firstOpenedAt')) || {};
let lockouts = JSON.parse(localStorage.getItem('lockouts')) || {};
let attempts = JSON.parse(localStorage.getItem('attempts')) || {};
let teamName = localStorage.getItem('teamName') || "";
let startTime = localStorage.getItem('startTime');

let currentTask = null;
let hintTimerInterval;
let lockoutTimerInterval;
let adminTapCount = 0;
let adminTapTimer;

// Audio Files (Pointing to your 'sounds/' folder and .wav format)
const sounds = {
    success: new Audio('sounds/success.wav'),
    error: new Audio('sounds/error.wav'),
    lockout: new Audio('sounds/lockout.wav')
};

// --- 2. INITIALIZATION ---
window.onload = function() {
    // Register Service Worker for offline caching
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js');
    }

    // Parse the data embedded in index.html
    parseEmbeddedTasks();

    // If a game is already in progress, skip the welcome screen
    if (teamName) {
        document.getElementById('welcome-screen').style.display = 'none';
        document.getElementById('team-name-display').innerText = teamName;
        renderHub();
    }
};

function parseEmbeddedTasks() {
    allTasks = EMBEDDED_TASKS.split('\n')
        .filter(line => line.trim() !== "")
        .map(line => {
            const [id, title, pts, code, clue, hint] = line.split('|');
            return { 
                id: id.trim(), 
                title: title.trim(), 
                points: parseInt(pts), 
                passcode: code.trim(), 
                clue: clue.trim(), 
                hint: hint ? hint.trim() : "No hint available." 
            };
        });
}

// --- 3. CORE GAME FLOW ---
function startRace() {
    const input = document.getElementById('team-name-input').value.trim();
    if (!input) return alert("Enter a team name!");
    
    teamName = input;
    startTime = Date.now();
    localStorage.setItem('teamName', teamName);
    localStorage.setItem('startTime', startTime);
    
    // iOS Audio Wake-up (Enables sound playback after user interaction)
    Object.values(sounds).forEach(s => {
        s.play().then(() => { s.pause(); s.currentTime = 0; }).catch(() => {});
    });

    document.getElementById('team-name-display').innerText = teamName;
    document.getElementById('welcome-screen').style.display = 'none';
    renderHub();
}

function renderHub() {
    const hub = document.getElementById('task-list');
    let totalScore = 0;

    if (allTasks.length > 0 && completedTasks.length === allTasks.length) {
        showPitStop();
        return;
    }

    hub.innerHTML = '';
    allTasks.forEach(task => {
        const isDone = completedTasks.includes(task.id);
        if (isDone) {
            let pts = task.points;
            if (hintsUsed.includes(task.id)) pts -= 25;
            totalScore += pts;
        }

        hub.innerHTML += `
            <div class="task-card ${isDone ? 'completed' : ''}">
                <div>
                    <strong>${task.title}</strong><br>
                    <small>${task.points} Pts</small>
                </div>
                <button onclick="openTask('${task.id}')">${isDone ? 'DONE' : 'GO'}</button>
            </div>
        `;
    });
    document.getElementById('score').innerText = totalScore;
}

// --- 4. TASK INTERACTION ---
function openTask(id) {
    currentTask = allTasks.find(t => t.id === id);
    if (completedTasks.includes(id)) return;

    if (!firstOpenedAt[id]) {
        firstOpenedAt[id] = Date.now();
        localStorage.setItem('firstOpenedAt', JSON.stringify(firstOpenedAt));
    }

    document.getElementById('modal-title').innerText = currentTask.title;
    document.getElementById('modal-clue').innerText = currentTask.clue;
    document.getElementById('passcode-input').value = '';
    document.getElementById('task-modal').style.display = 'block';

    checkLockout();
    checkHint();
}

function submitPasscode() {
    const input = document.getElementById('passcode-input').value.trim().toUpperCase();
    
    if (input === currentTask.passcode.toUpperCase()) {
        playSound('success');
        triggerVibration('success');
        completedTasks.push(currentTask.id);
        localStorage.setItem('completedTasks', JSON.stringify(completedTasks));
        closeModal();
        renderHub();
    } else {
        attempts[currentTask.id] = (attempts[currentTask.id] || 0) + 1;
        localStorage.setItem('attempts', JSON.stringify(attempts));
        
        if (attempts[currentTask.id] >= 3) {
            playSound('lockout');
            triggerVibration('lockout');
            lockouts[currentTask.id] = Date.now() + 120000; // 2 Min Lock
            localStorage.setItem('lockouts', JSON.stringify(lockouts));
            attempts[currentTask.id] = 0; 
            checkLockout();
        } else {
            playSound('error');
            triggerVibration('error');
            alert(`WRONG! ${3 - attempts[currentTask.id]} attempts remaining.`);
        }
    }
}

// --- 5. TIMERS & LOCKOUTS ---
function checkLockout() {
    const lockUntil = lockouts[currentTask.id];
    if (lockUntil && Date.now() < lockUntil) {
        document.getElementById('input-section').style.display = 'none';
        document.getElementById('lockout-section').style.display = 'block';
        clearInterval(lockoutTimerInterval);
        lockoutTimerInterval = setInterval(() => {
            const timeLeft = lockouts[currentTask.id] - Date.now();
            if (timeLeft <= 0) { clearInterval(lockoutTimerInterval); checkLockout(); }
            else {
                const s = Math.floor(timeLeft / 1000);
                document.getElementById('timer-display').innerText = `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
            }
        }, 1000);
    } else {
        document.getElementById('input-section').style.display = 'block';
        document.getElementById('lockout-section').style.display = 'none';
    }
}

function checkHint() {
    const btn = document.getElementById('hint-button');
    const txt = document.getElementById('hint-text');
    if (hintsUsed.includes(currentTask.id)) {
        btn.style.display = 'none'; txt.style.display = 'block';
        txt.innerText = "HINT: " + currentTask.hint;
        return;
    }
    btn.style.display = 'none'; txt.style.display = 'none';
    clearInterval(hintTimerInterval);
    hintTimerInterval = setInterval(() => {
        if (Date.now() - firstOpenedAt[currentTask.id] > 60000) {
            btn.style.display = 'block'; clearInterval(hintTimerInterval);
        }
    }, 1000);
}

function revealHint() {
    if (confirm("Unlock Hint for -25 Points?")) {
        hintsUsed.push(currentTask.id);
        localStorage.setItem('hintsUsed', JSON.stringify(hintsUsed));
        checkHint(); renderHub();
    }
}

function closeModal() {
    document.getElementById('task-modal').style.display = 'none';
    clearInterval(hintTimerInterval);
    clearInterval(lockoutTimerInterval);
}

// --- 6. ADMIN & FEEDBACK ---
function handleAdminTap() {
    adminTapCount++;
    clearTimeout(adminTapTimer);
    if (adminTapCount >= 5) { adminTapCount = 0; adminSkipTask(); }
    else { adminTapTimer = setTimeout(() => { adminTapCount = 0; }, 2000); }
}

function adminSkipTask() {
    const code = prompt("Enter Game Master Override Code:");
    if (code === "1337") {
        completedTasks.push(currentTask.id);
        localStorage.setItem('completedTasks', JSON.stringify(completedTasks));
        delete lockouts[currentTask.id];
        localStorage.setItem('lockouts', JSON.stringify(lockouts));
        closeModal(); renderHub();
    }
}

function playSound(t) { sounds[t].currentTime = 0; sounds[t].play().catch(() => {}); }

function triggerVibration(type) {
    if (!("vibrate" in navigator)) return;
    if (type === 'error') navigator.vibrate([200, 100, 200]);
    else if (type === 'success') navigator.vibrate(100);
    else if (type === 'lockout') navigator.vibrate(500);
}

// --- 7. PIT STOP & RESULTS ---
function showPitStop() {
    document.getElementById('pit-stop-screen').style.display = 'flex';
    document.getElementById('final-team-name').innerText = teamName;
    const dur = Date.now() - startTime;
    const s = Math.floor(dur / 1000);
    document.getElementById('final-time-display').innerText = `Time: ${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m ${s%60}s`;
    
    let totalScore = 0;
    let body = "";
    allTasks.forEach(t => {
        let p = t.points; if (hintsUsed.includes(t.id)) p -= 25;
        totalScore += p; body += `<tr><td>${t.title}</td><td>${p}</td></tr>`;
    });
    document.getElementById('summary-body').innerHTML = body;
    document.getElementById('final-total-points').innerText = totalScore + " Pts";
}

function downloadResults() {
    let report = `TEAM: ${teamName}\nTIME: ${document.getElementById('final-time-display').innerText}\nSCORE: ${document.getElementById('final-total-points').innerText}\n`;
    const blob = new Blob([report], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `Results_${teamName.replace(/\s+/g, '_')}.txt`; a.click();
}

function resetGame() { if (confirm("Wipe all data and restart?")) { localStorage.clear(); location.reload(); } }