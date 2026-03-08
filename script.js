let allTasks = [];
let completedTasks = JSON.parse(localStorage.getItem('completedTasks')) || [];
let hintsUsed = JSON.parse(localStorage.getItem('hintsUsed')) || [];
let bypassedTasks = JSON.parse(localStorage.getItem('bypassedTasks')) || []; // Track zero-point tasks
let lockouts = JSON.parse(localStorage.getItem('lockouts')) || {};
let attempts = JSON.parse(localStorage.getItem('attempts')) || {};
let teamName = localStorage.getItem('teamName') || "";
let startTime = localStorage.getItem('startTime');
let currentTask = null;
let adminTapCount = 0;
let adminTapTimer;

const sounds = {
    success: new Audio('sounds/success.wav'),
    error: new Audio('sounds/error.wav'),
    lockout: new Audio('sounds/lockout.wav')
};

function parseTasks() {
    allTasks = EMBEDDED_TASKS.trim().split('\n').map(line => {
        const p = line.split('|');
        return { 
            id: p[0], title: p[1], pts: parseInt(p[2]), 
            code: p[3], clue: p[4], hint: p[5], img: p[6] 
        };
    });
}

function startRace() {
    const nameInput = document.getElementById('team-name-input').value.trim();
    if (!nameInput) return alert("Enter Team Name!");
    
    teamName = nameInput;
    startTime = startTime || Date.now(); // Don't reset time if resuming
    localStorage.setItem('teamName', teamName);
    localStorage.setItem('startTime', startTime);
    
    Object.values(sounds).forEach(s => { s.play().then(() => { s.pause(); s.currentTime = 0; }).catch(()=>{}); });
    renderHub();
}

function renderHub() {
    parseTasks();
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('game-hub').classList.add('active');
    document.getElementById('team-name-display').innerText = teamName;

    if (completedTasks.length === allTasks.length && allTasks.length > 0) {
        showPitStop();
        return;
    }

    const list = document.getElementById('task-list');
    list.innerHTML = '';
    let currentScore = 0;

    allTasks.forEach(t => {
        const isDone = completedTasks.includes(t.id);
        const isBypassed = bypassedTasks.includes(t.id);
        
        if (isDone && !isBypassed) {
            currentScore += (hintsUsed.includes(t.id) ? t.pts - 25 : t.pts);
        }
        
        list.innerHTML += `
            <div class="task-card ${isDone ? 'completed' : ''}">
                <div><b>${t.title}</b><br><small>${isBypassed ? '0' : t.pts} Pts</small></div>
                <button onclick="openTask('${t.id}')">${isDone ? 'DONE' : 'GO'}</button>
            </div>`;
    });
    document.getElementById('score').innerText = currentScore;
}

function openTask(id) {
    currentTask = allTasks.find(t => t.id === id);
    if (completedTasks.includes(id)) return;

    document.getElementById('modal-title').innerText = currentTask.title;
    document.getElementById('modal-clue').innerText = currentTask.clue;
    
    const img = document.getElementById('modal-image');
    if (currentTask.img) {
        img.src = 'images/' + currentTask.img;
        img.style.display = 'block';
        img.onclick = zoomImage; // <-- Add this line to make it clickable
    } else {
        img.style.display = 'none';
    }

    document.getElementById('task-modal').style.display = 'block';
    document.getElementById('passcode-input').value = '';
    checkLockout();
    checkHintDisplay();
}

function submitPasscode() {
    const val = document.getElementById('passcode-input').value.trim().toUpperCase();
    if (val === currentTask.code.toUpperCase()) {
        sounds.success.play();
        completedTasks.push(currentTask.id);
        localStorage.setItem('completedTasks', JSON.stringify(completedTasks));
        closeModal();
        renderHub();
    } else {
        attempts[currentTask.id] = (attempts[currentTask.id] || 0) + 1;
        if (attempts[currentTask.id] >= 3) {
            sounds.lockout.play();
            lockouts[currentTask.id] = Date.now() + 120000;
            localStorage.setItem('lockouts', JSON.stringify(lockouts));
            checkLockout();
        } else {
            sounds.error.play();
            alert("Wrong passcode!");
        }
    }
}

// --- GOD MODE OVERRIDE ---
function handleAdminTap() {
    adminTapCount++;
    clearTimeout(adminTapTimer);
    if (adminTapCount >= 5) {
        adminTapCount = 0;
        const masterCode = prompt("STATION MASTER OVERRIDE\nEnter code to bypass task (0 points awarded):");
        if (masterCode === "1337") {
            completedTasks.push(currentTask.id);
            bypassedTasks.push(currentTask.id);
            localStorage.setItem('completedTasks', JSON.stringify(completedTasks));
            localStorage.setItem('bypassedTasks', JSON.stringify(bypassedTasks));
            alert("Task Bypassed. No points awarded.");
            closeModal();
            renderHub();
        }
    } else {
        adminTapTimer = setTimeout(() => { adminTapCount = 0; }, 2000);
    }
}

function checkLockout() {
    const lockTime = lockouts[currentTask.id];
    const isLocked = lockTime && Date.now() < lockTime;
    document.getElementById('input-section').style.display = isLocked ? 'none' : 'block';
    document.getElementById('lockout-section').style.display = isLocked ? 'block' : 'none';
}

function checkHintDisplay() {
    const btn = document.getElementById('hint-button');
    const txt = document.getElementById('hint-text');
    if (hintsUsed.includes(currentTask.id)) {
        btn.style.display = 'none';
        txt.innerText = "HINT: " + currentTask.hint;
        txt.style.display = 'block';
    } else {
        btn.style.display = 'none';
        txt.style.display = 'none';
        setTimeout(() => { 
            if (document.getElementById('task-modal').style.display === 'block') btn.style.display = 'block'; 
        }, 60000);
    }
}

function revealHint() {
    if (confirm("Unlock hint for -25 points?")) {
        hintsUsed.push(currentTask.id);
        localStorage.setItem('hintsUsed', JSON.stringify(hintsUsed));
        checkHintDisplay();
        renderHub();
    }
}

function closeModal() { document.getElementById('task-modal').style.display = 'none'; }

function showPitStop() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('pit-stop-screen').classList.add('active');
    document.getElementById('final-team-name').innerText = teamName;
    const diff = Math.floor((Date.now() - startTime) / 1000);
    document.getElementById('final-time-display').innerText = `Time: ${Math.floor(diff/60)}m ${diff%60}s`;
    
    let finalScore = 0;
    allTasks.forEach(t => {
        if (!bypassedTasks.includes(t.id)) {
            finalScore += (hintsUsed.includes(t.id) ? t.pts - 25 : t.pts);
        }
    });
    document.getElementById('final-total-points').innerText = finalScore + " POINTS";
}

function downloadResults() {
    const score = document.getElementById('final-total-points').innerText;
    const time = document.getElementById('final-time-display').innerText;
    const data = `TEAM: ${teamName}\n${time}\nSCORE: ${score}\nBYPASSED TASKS: ${bypassedTasks.length}`;
    const blob = new Blob([data], {type: 'text/plain'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `Results_${teamName}.txt`; a.click();
}

function resetGame() { if (confirm("Wipe all progress?")) { localStorage.clear(); location.reload(); } }


if (teamName) renderHub();

function zoomImage() {
    const src = document.getElementById('modal-image').src;
    const overlay = document.getElementById('image-overlay');
    const overlayImg = document.getElementById('overlay-img');
    
    overlayImg.src = src;
    overlay.style.display = 'flex';
}

function closeZoom() {
    document.getElementById('image-overlay').style.display = 'none';
}

