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
var timerInterval = null; // Use 'var' to ensure it's globally attached to the window
let taskCompletionTimes = JSON.parse(localStorage.getItem('taskCompletionTimes')) || {};

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
    // 0. START TIMER ON FIRST INTERACTION
    // We check if startTime is "null", undefined, or 0
    if (!startTime || startTime === "null" || startTime === 0) {
        startTime = Date.now().toString(); // Store as string for localStorage
        localStorage.setItem('startTime', startTime);
        console.log("Race Clock Started!"); 
    }

    startLiveTimer();

    // 1. Check if the task is already done
    if (completedTasks.includes(id)) {
        alert("🎖️ MISSION ACCOMPLISHED!\nYour team has already secured these points. Move on to the next station!");
        return; 
    }

    // 2. Otherwise, continue with opening the task normally
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
            canvas.width = img.width; 
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            // 1. WATERMARK POSITIONING
            const fs = Math.floor(canvas.width / 20);
            ctx.font = `bold ${fs}px sans-serif`; 
            ctx.fillStyle = "yellow";
            ctx.shadowColor = "black"; 
            ctx.shadowBlur = 10;

            // Shifted UP (fs * 1.5) and IN (fs) from the bottom-left corner
            const xPos = fs;
            const yPos = canvas.height - (fs * 1.5); 
            
            ctx.fillText(`${teamName} | ${new Date().toLocaleTimeString()}`, xPos, yPos);
            
            // 2. RENDER PREVIEW
            const data = canvas.toDataURL('image/jpeg', 0.7);
            const previewImg = document.getElementById('task-photo-preview');
            previewImg.src = data;
            document.getElementById('photo-preview-container').style.display = 'block';
            
            // Enable Submit Button
            document.querySelector('#input-section button').disabled = false;
            
            // 3. THE MISSING SCROLL LOGIC
            // Using a tiny timeout ensures the browser has rendered the image 
            // before calculating the scroll position.
            setTimeout(() => {
                document.getElementById('input-section').scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center' 
                });
            }, 150);

            // 4. SAVE TO DATABASE
            const tx = db.transaction(["photos"], "readwrite");
            tx.objectStore("photos").put({taskId: currentTask.id, data: data});
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function submitPasscode() {
    const val = document.getElementById('passcode-input').value.trim().toUpperCase();
    if(val === currentTask.code.toUpperCase()) {

        // --- NEW LOGIC: Record completion time ---
        if (!taskCompletionTimes[currentTask.id]) {
            taskCompletionTimes[currentTask.id] = Date.now();
            localStorage.setItem('taskCompletionTimes', JSON.stringify(taskCompletionTimes));
        }
        
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

async function showPitStop() {
    // 1. Stop the ticking
    clearInterval(timerInterval); // STOP THE CLOCK

    // 2. Hide the moving global timer bar
    const globalTimer = document.getElementById('global-timer-bar');
    if (globalTimer) globalTimer.style.display = 'none';

    closeModal();
    hideAllScreens();
    document.getElementById('pit-stop-screen').style.display = 'block';

    // Calculate final time string
    const totalSeconds = Math.floor((Date.now() - startTime) / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    const finalTimeStr = `${m}:${s.toString().padStart(2, '0')}`;

    // Update the UI
    document.getElementById('pit-stop-screen').style.display = 'block';
    document.getElementById('final-time-display').innerText = `Total Race Time: ${finalTimeStr}`;

    const logContainer = document.getElementById('station-breakdown');
    logContainer.innerHTML = "<p style='text-align:center;'>Loading Mission Log...</p>";

    // 1. Get Photos from Database
    let photoData = {};
    try {
        const tx = db.transaction(["photos"], "readonly");
        const store = tx.objectStore("photos");
        const allPhotos = await new Promise((resolve) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
        });
        allPhotos.forEach(p => photoData[p.taskId] = p.data);
    } catch (e) { console.warn("Photo fetch failed", e); }

    // 2. Build the Integrated Cards
    let totalScore = 0;
    let htmlBuilder = "";

    allTasks.forEach(t => {
        const isDone = completedTasks.includes(t.id);
        const h = hintsUsed.includes(t.id) ? 25 : 0;
        const e = (attempts[t.id] || 0) * 10;
        const final = isDone ? Math.max(0, t.pts - h - e) : 0;
        if(isDone) totalScore += final;

        // --- NEW LOGIC: Calculate duration for this task ---
        let timeTakenText = "Incomplete";
        if (isDone && taskCompletionTimes[t.id]) {
            const durationMs = taskCompletionTimes[t.id] - startTime;
            const totalSecs = Math.floor(durationMs / 1000);
            const m = Math.floor(totalSecs / 60);
            const s = totalSecs % 60;
            timeTakenText = `${m}m ${s}s since start`;
        }
        // ---------------------------------------------------
        
        const imgHtml = photoData[t.id] ? 
            `<img src="${photoData[t.id]}" class="log-card-img" onclick="openZoom('${photoData[t.id]}')">` : 
            `<div style="color:#444; font-size:0.7rem; padding:10px;">(No photo captured)</div>`;

        htmlBuilder += `
            <div class="log-card">
                <div class="log-header">${t.title}</div>
                ${imgHtml}
                <div class="log-row" style="color: #888; font-style: italic;">
                    <span>Completed at:</span> <span>${timeTakenText}</span>
                </div>
                <div class="log-row"><span>Base Points:</span> <span>${t.pts}</span></div>
                <div class="log-row"><span>Hint Penalty:</span> <span style="color:${h > 0 ? '#ff4444' : '#666'}">-${h}</span></div>
                <div class="log-row"><span>Error Penalties:</span> <span style="color:${e > 0 ? '#ff4444' : '#666'}">-${e}</span></div>
                <div class="log-row" style="margin-top:8px; border-top:1px dashed #444; padding-top:8px; font-weight:bold;">
                    <span>Earned:</span> <span style="color:#4CAF50;">${final} PTS</span>
                </div>
            </div>`;
    });

    logContainer.innerHTML = htmlBuilder;

    // 3. Update Text Fields
    document.getElementById('final-team-name').innerText = teamName;
    document.getElementById('final-total-points').innerText = totalScore;
    const timerText = document.getElementById('timer') ? document.getElementById('timer').innerText : "Completed";
    document.getElementById('final-time-display').innerText = `${timerText}`;
}

function downloadResults() {
    // 1. Calculate Start and End Strings
    const startStr = new Date(parseInt(startTime)).toLocaleTimeString();
    const endStr = new Date().toLocaleTimeString();
    const totalScore = document.getElementById('final-total-points').innerText;
    const finalTime = document.getElementById('final-time-display').innerText;

    let report = `==========================================\n`;
    report += `       AMAZING RACE OFFICIAL LOG\n`;
    report += `==========================================\n\n`;
    report += `TEAM NAME   : ${teamName}\n`;
    report += `TOTAL SCORE : ${totalScore} PTS\n`;
    report += `DURATION    : ${finalTime}\n\n`;
    report += `START TIME : ${startStr}\n`;
    report += `FINISH TIME: ${endStr}\n`;
    report += `\n------------------------------------------\n`;
    report += `             STATION BREAKDOWN\n`;
    report += `------------------------------------------\n\n`;

    allTasks.forEach((t, index) => {
        const isDone = completedTasks.includes(t.id);
        const h = hintsUsed.includes(t.id) ? 25 : 0;
        const e = (attempts[t.id] || 0) * 10;
        const final = isDone ? Math.max(0, t.pts - h - e) : 0;

        // Calculate split time for this task
        let splitTime = "N/A";
        if (isDone && taskCompletionTimes[t.id]) {
            const diff = Math.floor((taskCompletionTimes[t.id] - startTime) / 1000);
            const m = Math.floor(diff / 60);
            const s = diff % 60;
            splitTime = `${m}m ${s}s since start`;
        }

        report += `${index + 1}. ${t.title.toUpperCase()}\n`;
        report += `   Status    : ${isDone ? 'COMPLETED' : 'MISSING'}\n`;
        report += `   Timestamp : ${splitTime}\n`;
        report += `   Base Pts  : ${t.pts}\n`;
        report += `   Penalties : -${h} (Hint), -${e} (Errors)\n`;
        report += `   EARNED    : ${final} PTS\n`;
        report += `------------------------------------------\n`;
    });

    report += `\nGenerated on: ${new Date().toLocaleString()}\n`;

    // Create and trigger download
    const blob = new Blob([report], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Race_Log_${teamName.replace(/\s+/g, '_')}.txt`;
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

function hideAllScreens() {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(s => {
        s.style.display = 'none';
        s.classList.remove('active');
    });
}

async function downloadPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    let y = 20; // Vertical position tracker

    // 1. Header & Official Times
    const startStr = new Date(parseInt(startTime)).toLocaleTimeString();
    const endStr = new Date().toLocaleTimeString();
    const finalScore = document.getElementById('final-total-points').innerText;
    const finalTime = document.getElementById('final-time-display').innerText;

    doc.setFontSize(22);
    doc.setTextColor(184, 134, 11); // Gold color
    doc.text("AMAZING RACE OFFICIAL RESULTS", 20, y);
    
    y += 15;
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text(`Team name   : ${teamName}`, 20, y);
    
    doc.text(`Total Score : ${finalScore} points`, 120, y);
    y += 10;
    doc.text(`Duration     : ${finalTime} seconds`, 120, y);

    y += 5;
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.text(`Start: ${startStr}`, 120, y);
    y += 5;
    doc.text(`Finish: ${endStr}`, 120, y);

    y += 5;
    doc.setLineWidth(0.5);
    doc.setDrawColor(184, 134, 11);
    doc.line(20, y, 190, y);
    y += 5;

    // 2. Fetch Photos from DB
    let photoData = {};
    try {
        const tx = db.transaction(["photos"], "readonly");
        const photos = await new Promise(resolve => {
            const req = tx.objectStore("photos").getAll();
            req.onsuccess = () => resolve(req.result);
        });
        photos.forEach(p => photoData[p.taskId] = p.data);
    } catch (e) { console.error(e); }

    // 3. Loop through tasks
    doc.setFontSize(12);
    allTasks.forEach((t, index) => {
        const isDone = completedTasks.includes(t.id);
        const h = hintsUsed.includes(t.id) ? 25 : 0;
        const e = (attempts[t.id] || 0) * 10;
        const final = isDone ? Math.max(0, t.pts - h - e) : 0;

        // Check if we need a new page
        if (y > 240) {
            doc.addPage();
            y = 20;
        }

        //Task header
        doc.setFont(undefined, 'bold');
        doc.text(`${index + 1}. ${t.title}`, 20, y);
        y += 7;

        //timer report start Inside allTasks.forEach in downloadPDF():
        const timeTaken = taskCompletionTimes[t.id] ? 
            Math.floor((taskCompletionTimes[t.id] - startTime) / 1000) : 0;
        const m = Math.floor(timeTaken / 60);
        const s = timeTaken % 60;

        doc.setFont(undefined, 'italic');
        doc.text(`Time taken: ${m}m ${s}s from start`, 20, y);
        doc.setFont(undefined, 'normal');
        y += 5;
        //timer report end

        //points report
        doc.setFont(undefined, 'normal');
        doc.text(`Score: ${final} pts (Base: ${t.pts}, Hint: -${h}, Errors: -${e})`, 20, y);
        y += 5;

        // Add Photo if it exists
        if (photoData[t.id]) {
            try {
                // PDF images need to be squeezed to fit
                doc.addImage(photoData[t.id], 'JPEG', 20, y, 60, 45);
                y += 55;
            } catch (err) {
                doc.text("[Image Error]", 20, y);
                y += 5;
            }
        } else {
            doc.setTextColor(150, 150, 150);
            doc.text("No photo captured.", 25, y);
            doc.setTextColor(0, 0, 0);
            y += 5;
        }

        doc.setLineWidth(0.5);
        doc.setDrawColor(184, 134, 11);
        doc.line(20, y, 190, y);
        y += 5;
    });

    // 4. Save the file
    doc.save(`Race_Results_${teamName.replace(/\s+/g, '_')}.pdf`);
}

function startLiveTimer() {
    // Clear any existing interval first
    // 1. Clear any existing timer to prevent double-speed ticking
    if (window.timerInterval) clearInterval(window.timerInterval);

    console.log("Timer Tick Started...");

    // 2. Set the interval
    window.timerInterval = setInterval(() => {
        const timerDisplay = document.getElementById('timer');

        // If the element doesn't exist, we can't update it (safety check)
        if (!timerDisplay) return;

        // Force the startTime to be a number
        const start = parseInt(startTime);
        if (isNaN(start)) return;

        const now = Date.now();
        const diff = Math.floor((now - start) / 1000);
        
        if (diff < 0) return; // Prevent negative time

        const m = Math.floor(diff / 60);
        const s = diff % 60;
        
        // Update the text, This line actually updates the screen every 1 second
        timerDisplay.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }, 1000);
}

// Add this to the very bottom of script.js
window.onload = function() {
    // If a race was already started, resume the timer
    if (startTime && startTime !== "null") {
        startLiveTimer();
    }
};

// This runs automatically whenever the page loads
window.addEventListener('load', () => {
    // Check if a race is already underway
    if (startTime && startTime !== "null" && !completedTasks.includes('finished')) {
        startLiveTimer();
    }
});

// Call this immediately at the bottom of script.js to be safe
showWelcomeScreen();