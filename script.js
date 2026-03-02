let allTasks = [], completedTasks = JSON.parse(localStorage.getItem('completedTasks')) || [];
let hintsUsed = JSON.parse(localStorage.getItem('hintsUsed')) || [], firstOpenedAt = JSON.parse(localStorage.getItem('firstOpenedAt')) || {};
let lockouts = JSON.parse(localStorage.getItem('lockouts')) || {}, attempts = JSON.parse(localStorage.getItem('attempts')) || {};
let teamName = localStorage.getItem('teamName') || "", startTime = localStorage.getItem('startTime');
let currentTask = null, hintTimerInterval, lockoutTimerInterval;

const sounds = { success: new Audio('success.wav'), error: new Audio('error.wav'), lockout: new Audio('lockout.wav') };

function parseTasks() {
    allTasks = EMBEDDED_TASKS.split('\n').filter(l => l.trim() !== "").map(line => {
        const [id, title, pts, code, clue, hint] = line.split('|');
        return { id: id.trim(), title: title.trim(), points: parseInt(pts), passcode: code.trim(), clue: clue.trim(), hint: hint.trim() };
    });
}

window.onload = () => {
    parseTasks();
    if (teamName) {
        document.getElementById('welcome-screen').style.display = 'none';
        document.getElementById('team-name-display').innerText = teamName;
        renderHub();
    }
};

function startRace() {
    const name = document.getElementById('team-name-input').value.trim();
    if (!name) return alert("Enter team name!");
    teamName = name; startTime = Date.now();
    localStorage.setItem('teamName', teamName); localStorage.setItem('startTime', startTime);
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('team-name-display').innerText = teamName;
    renderHub();
}

function renderHub() {
    const hub = document.getElementById('task-list');
    let totalScore = 0;
    if (allTasks.length > 0 && completedTasks.length === allTasks.length) return showPitStop();
    hub.innerHTML = '';
    allTasks.forEach(t => {
        const isDone = completedTasks.includes(t.id);
        if (isDone) totalScore += (hintsUsed.includes(t.id) ? t.points - 25 : t.points);
        hub.innerHTML += `<div class="task-card ${isDone?'completed':''}">
            <div><strong>${t.title}</strong><br><small>${t.points} Pts</small></div>
            <button onclick="openTask('${t.id}')">${isDone?'DONE':'GO'}</button>
        </div>`;
    });
    document.getElementById('score').innerText = totalScore;
}

function openTask(id) {
    currentTask = allTasks.find(t => t.id === id);
    if (completedTasks.includes(id)) return;
    if (!firstOpenedAt[id]) { firstOpenedAt[id] = Date.now(); localStorage.setItem('firstOpenedAt', JSON.stringify(firstOpenedAt)); }
    document.getElementById('modal-title').innerText = currentTask.title;
    document.getElementById('modal-clue').innerText = currentTask.clue;
    document.getElementById('task-modal').style.display = 'block';
    checkLockout(); checkHint();
}

function submitPasscode() {
    const input = document.getElementById('passcode-input').value.trim().toUpperCase();
    if (input === currentTask.passcode.toUpperCase()) {
        playSound('success'); completedTasks.push(currentTask.id);
        localStorage.setItem('completedTasks', JSON.stringify(completedTasks));
        closeModal(); renderHub();
    } else {
        attempts[currentTask.id] = (attempts[currentTask.id] || 0) + 1;
        localStorage.setItem('attempts', JSON.stringify(attempts));
        if (attempts[currentTask.id] >= 3) {
            playSound('lockout'); lockouts[currentTask.id] = Date.now() + 120000;
            localStorage.setItem('lockouts', JSON.stringify(lockouts));
            attempts[currentTask.id] = 0; checkLockout();
        } else { playSound('error'); alert("Wrong!"); }
    }
}

function checkLockout() {
    const lockUntil = lockouts[currentTask.id];
    if (lockUntil && Date.now() < lockUntil) {
        document.getElementById('input-section').style.display = 'none';
        document.getElementById('lockout-section').style.display = 'block';
        clearInterval(lockoutTimerInterval);
        lockoutTimerInterval = setInterval(() => {
            const left = lockouts[currentTask.id] - Date.now();
            if (left <= 0) { clearInterval(lockoutTimerInterval); checkLockout(); }
            else { 
                const s = Math.floor(left/1000); 
                document.getElementById('timer-display').innerText = `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
            }
        }, 1000);
    } else {
        document.getElementById('input-section').style.display = 'block';
        document.getElementById('lockout-section').style.display = 'none';
    }
}

function checkHint() {
    const btn = document.getElementById('hint-button'), txt = document.getElementById('hint-text');
    if (hintsUsed.includes(currentTask.id)) {
        btn.style.display = 'none'; txt.style.display = 'block'; txt.innerText = "HINT: " + currentTask.hint;
    } else {
        btn.style.display = 'none'; txt.style.display = 'none';
        clearInterval(hintTimerInterval);
        hintTimerInterval = setInterval(() => {
            if (Date.now() - firstOpenedAt[currentTask.id] > 60000) { btn.style.display = 'block'; clearInterval(hintTimerInterval); }
        }, 1000);
    }
}

function revealHint() {
    if (confirm("-25 Points for hint?")) { hintsUsed.push(currentTask.id); localStorage.setItem('hintsUsed', JSON.stringify(hintsUsed)); checkHint(); renderHub(); }
}

function closeModal() { document.getElementById('task-modal').style.display = 'none'; clearInterval(hintTimerInterval); clearInterval(lockoutTimerInterval); }

function playSound(t) { sounds[t].currentTime = 0; sounds[t].play().catch(() => {}); }

function showPitStop() {
    const dur = Date.now() - startTime;
    document.getElementById('pit-stop-screen').style.display = 'flex';
    document.getElementById('final-team-name').innerText = teamName;
    let score = 0, body = "";
    allTasks.forEach(t => {
        let p = t.points; if (hintsUsed.includes(t.id)) p -= 25;
        score += p; body += `<tr><td>${t.title}</td><td>${p}</td></tr>`;
    });
    document.getElementById('summary-body').innerHTML = body;
    document.getElementById('final-total-points').innerText = score + " Pts";
    const s = Math.floor(dur/1000);
    document.getElementById('final-time-display').innerText = `Time: ${Math.floor(s/60)}m ${s%60}s`;
}

function downloadResults() {
    let res = `Team: ${teamName}\nScore: ${document.getElementById('score').innerText}\nTime: ${document.getElementById('final-time-display').innerText}\n`;
    const blob = new Blob([res], {type:'text/plain'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Results_${teamName}.txt`; a.click();
}

function resetGame() { if (confirm("Reset?")) { localStorage.clear(); location.reload(); } }

// Hidden Admin Function: Skip the current task
function adminSkipTask() {
    const adminCode = prompt("Enter Game Master Override Code:");
    
    // You can change '1337' to any secret number/word you like
    if (adminCode === "1337") {
        playSound('success');
        completedTasks.push(currentTask.id);
        localStorage.setItem('completedTasks', JSON.stringify(completedTasks));
        
        // Remove any penalties or lockout data for this task
        delete attempts[currentTask.id];
        delete lockouts[currentTask.id];
        localStorage.setItem('attempts', JSON.stringify(attempts));
        localStorage.setItem('lockouts', JSON.stringify(lockouts));

        closeModal();
        renderHub();
        alert("Task bypassed by Game Master.");
    } else {
        alert("Invalid Admin Code.");
    }
}

let adminTapCount = 0;
let adminTapTimer;

function handleAdminTap() {
    adminTapCount++;
    clearTimeout(adminTapTimer);
    
    if (adminTapCount >= 5) {
        adminTapCount = 0;
        adminSkipTask();
    } else {
        // Reset count if they don't tap fast enough (within 2 seconds)
        adminTapTimer = setTimeout(() => { adminTapCount = 0; }, 2000);
    }

}
