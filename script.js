let db;
let teamName = localStorage.getItem('teamName') || "";
let startTime = localStorage.getItem('startTime') || null;
let completedTasks = JSON.parse(localStorage.getItem('completedTasks')) || [];
let bypassedTasks = JSON.parse(localStorage.getItem('bypassedTasks')) || [];
let hintsUsed = JSON.parse(localStorage.getItem('hintsUsed')) || [];
let attempts = JSON.parse(localStorage.getItem('attempts')) || {};
let lockouts = JSON.parse(localStorage.getItem('lockouts')) || {};
let lockoutCounts = JSON.parse(localStorage.getItem('lockoutCounts')) || {};
let currentTask = null;
let lockoutTimerInterval;
let adminTapCount = 0;

// Initialize IndexedDB for Photos
const req = indexedDB.open("RacePhotoLog", 1);
req.onupgradeneeded = e => { e.target.result.createObjectStore("photos", { keyPath: "taskId" }); };
req.onsuccess = e => { 
    db = e.target.result; 
    // This was likely the bottleneck. 
    // We now check if a race is ALREADY in progress.
    if(teamName && startTime) {
        renderHub(); 
    } else {
        showWelcomeScreen();
    }
};

// Add this helper function to ensure the welcome screen is forced visible
function showWelcomeScreen() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('welcome-screen').classList.add('active');
}

function startRace() {
    try {
        const nameInput = document.getElementById('team-name-input');
        const name = nameInput.value.trim();
        
        if (!name) {
            alert("Please enter a Team Name!");
            return;
        }
        
        teamName = name;
        startTime = Date.now();
        localStorage.setItem('teamName', teamName);
        localStorage.setItem('startTime', startTime);
        
        renderHub();
    } catch (err) {
        // This will tell you EXACTLY why the button isn't working
        alert("Error starting race: " + err.message);
        console.error(err);
    }
}

function renderHub() {
    // 1. Switch Screens
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('hub-screen').classList.add('active');
    
    // 2. Safety Progress Bar Update
    const pBar = document.getElementById('progress-bar');
    if (pBar) {
        const totalTasks = allTasks.length;
        const completedCount = completedTasks.length;
        const percent = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;
        pBar.style.width = percent + "%";
        pBar.innerText = percent + "%";
    }

    // 3. Clear and Rebuild Task List
    const list = document.getElementById('task-list');
    list.innerHTML = "";
    let currentScore = 0;

    allTasks.forEach(t => {
        const isDone = completedTasks.includes(t.id);
        const isBypassed = bypassedTasks.includes(t.id);
        
        if (isDone && !isBypassed) {
            let taskScore = t.pts;
            if (hintsUsed.includes(t.id)) taskScore -= 25;
            taskScore -= ((attempts[t.id] || 0) * 10);
            currentScore += Math.max(0, taskScore);
        }

        list.innerHTML += `
            <button class="task-card ${isDone ? 'completed' : ''}" onclick="openTask('${t.id}')">
                <span style="text-align: left;">${t.title}</span>
                <span style="font-weight: bold; color: var(--gold);">${isDone ? '✅ DONE' : t.pts + ' PTS'}</span>
            </button>
        `;
    });

    document.getElementById('hub-score').innerText = `Score: ${currentScore}`;
    
    if (completedTasks.length === allTasks.length && allTasks.length > 0) {
        document.getElementById('finish-btn').style.display = 'block';
    }
}

function openTask(id) {
    currentTask = allTasks.find(t => t.id === id);
    
    // Set Text Content
    document.getElementById('modal-title').innerText = currentTask.title;
    document.getElementById('modal-desc').innerText = currentTask.desc;
    
    // --- IMAGE LOGIC ---
    const imgElement = document.getElementById('modal-image');
    if (currentTask.img) {
        imgElement.src = 'images/' + currentTask.img; // Path to your folder
        imgElement.style.display = 'block';           // Show it
    } else {
        imgElement.style.display = 'none';            // Hide if no image
    }
    // --------------------

    document.getElementById('task-modal').style.display = 'block';
    
    // Reset inputs and check for lockouts
    document.getElementById('passcode-input').value = "";
    document.getElementById('photo-preview-container').style.display = 'none';
    document.querySelector('#input-section button').disabled = true;
    
    checkLockout();
}

function previewPhoto(event) {
    const file = event.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width; canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            const fs = Math.floor(canvas.width / 20);
            ctx.font = `bold ${fs}px sans-serif`; ctx.fillStyle = "yellow";
            ctx.shadowColor = "black"; ctx.shadowBlur = 7;
            ctx.fillText(`${teamName} | ${new Date().toLocaleTimeString()}`, fs, canvas.height - fs);
            const data = canvas.toDataURL('image/jpeg', 0.7);
            document.getElementById('task-photo-preview').src = data;
            document.getElementById('photo-preview-container').style.display = 'block';
            document.querySelector('#input-section button').disabled = false;
            db.transaction(["photos"],"readwrite").objectStore("photos").put({taskId:currentTask.id, data});
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function submitPasscode() {
    const val = document.getElementById('passcode-input').value.trim().toUpperCase();
    if(val === currentTask.code.toUpperCase()) {
        completedTasks.push(currentTask.id);
        localStorage.setItem('completedTasks', JSON.stringify(completedTasks));
        closeModal(); renderHub();
    } else {
        attempts[currentTask.id] = (attempts[currentTask.id]||0)+1;
        localStorage.setItem('attempts', JSON.stringify(attempts));
        if(attempts[currentTask.id] >= 3) {
            lockoutCounts[currentTask.id] = (lockoutCounts[currentTask.id]||0)+1;
            lockouts[currentTask.id] = Date.now() + (60000 * lockoutCounts[currentTask.id]);
            localStorage.setItem('lockouts', JSON.stringify(lockouts));
            checkLockout();
        } else { alert(`Wrong! ${3 - (attempts[currentTask.id]%3)} tries until lockout.`); }
    }
}

function checkLockout() {
    clearInterval(lockoutTimerInterval);
    const until = lockouts[currentTask.id];
    if(until && Date.now() < until) {
        document.getElementById('input-section').style.display='none';
        document.getElementById('lockout-section').style.display='block';
        lockoutTimerInterval = setInterval(() => {
            let left = Math.ceil((until - Date.now())/1000);
            if(left<=0) { clearInterval(lockoutTimerInterval); checkLockout(); }
            document.getElementById('timer-display').innerText = left + "s";
        }, 1000);
    } else {
        document.getElementById('input-section').style.display='block';
        document.getElementById('lockout-section').style.display='none';
    }
}

function revealHint() {
    if(confirm("Use hint for -25 points?")) {
        alert("HINT: " + currentTask.hint);
        if(!hintsUsed.includes(currentTask.id)) {
            hintsUsed.push(currentTask.id);
            localStorage.setItem('hintsUsed', JSON.stringify(hintsUsed));
        }
    }
}

function showPitStop() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('pit-stop-screen').classList.add('active');
    document.getElementById('final-team-name').innerText = teamName;
    const diff = Math.floor((Date.now() - startTime) / 1000);
    document.getElementById('final-time-display').innerText = `Total Time: ${Math.floor(diff/60)}m ${diff%60}s`;

    const body = document.getElementById('summary-table-body');
    body.innerHTML = ""; let total = 0;
    allTasks.forEach(t => {
        let h = hintsUsed.includes(t.id)?25:0;
        let e = (attempts[t.id]||0)*10;
        let skip = bypassedTasks.includes(t.id);
        let f = skip ? 0 : Math.max(0, t.pts - h - e);
        if(completedTasks.includes(t.id)) total += f;
        body.innerHTML += `<tr><td>${t.title}</td><td>${t.pts}</td><td>-${h}</td><td>-${e}</td><td>${f}</td></tr>`;
    });
    document.getElementById('final-total-points').innerText = total + " POINTS";

    const gal = document.getElementById('photo-gallery');
    gal.innerHTML = "";
    db.transaction(["photos"]).objectStore("photos").openCursor().onsuccess = e => {
        const c = e.target.result;
        if(c) { gal.innerHTML += `<div class="gallery-item"><img src="${c.value.data}"></div>`; c.continue(); }
    };
}

function downloadResults() {
    let report = `TEAM: ${teamName}\nSCORE: ${document.getElementById('final-total-points').innerText}\n\nSTATION BREAKDOWN:\n`;
    allTasks.forEach(t => {
        report += `${t.title}: ${completedTasks.includes(t.id)?'DONE':'FAIL'} | Hints: ${hintsUsed.includes(t.id)?'YES':'NO'} | Errs: ${attempts[t.id]||0}\n`;
    });
    const blob = new Blob([report], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Results_${teamName.replace(/\s/g,'_')}.txt`;
    a.click();
}

function handleAdminTap() {
    adminTapCount++;
    if(adminTapCount >= 5) {
        let pw = prompt("Admin Code:");
        if(pw === "1337") {
            let id = prompt("Bypass Task ID:");
            if(id) {
                completedTasks.push(id); bypassedTasks.push(id);
                localStorage.setItem('completedTasks', JSON.stringify(completedTasks));
                localStorage.setItem('bypassedTasks', JSON.stringify(bypassedTasks));
                renderHub();
            }
        }
        adminTapCount = 0;
    }
}

function resetGame() {
    if(confirm("Wipe everything?") && prompt("Master Code") === "1337") {
        localStorage.clear();
        db.transaction(["photos"],"readwrite").objectStore("photos").clear().onsuccess = () => location.reload();
    }
}

function closeModal() { document.getElementById('task-modal').style.display='none'; clearInterval(lockoutTimerInterval); }
// Function to enlarge the image
function zoomImage() {
    const smallImg = document.getElementById('modal-image');
    const overlay = document.getElementById('image-overlay');
    const largeImg = document.getElementById('overlay-img');
    
    if (smallImg.src) {
        largeImg.src = smallImg.src; // Copy the source
        overlay.style.display = 'flex'; // Show the overlay
    }
}

// Function to close the enlarged view
function closeZoom() {
    document.getElementById('image-overlay').style.display = 'none';
}

function adminResetTrigger() {
    // 1. Ask for the secret code
    const adminCode = prompt("ADMIN ONLY: Enter passcode to reset the race:");

    if (adminCode === "1337") {
        const confirmClear = confirm("WARNING: This will delete ALL progress, scores, and photos. Are you sure?");
        
        if (confirmClear) {
            // Clear scores and team data
            localStorage.clear();

            // Clear the Photo Database (IndexedDB)
            const transaction = db.transaction(["photos"], "readwrite");
            const objectStore = transaction.objectStore("photos");
            const clearRequest = objectStore.clear();

            clearRequest.onsuccess = () => {
                alert("Race data wiped successfully.");
                window.location.reload(); // Refresh to the Welcome Screen
            };
        }
    } else if (adminCode !== null) {
        alert("Access Denied: Incorrect Admin Passcode.");
    }
}

// Call this immediately at the bottom of script.js to be safe
showWelcomeScreen();