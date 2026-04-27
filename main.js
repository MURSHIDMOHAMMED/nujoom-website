// main.js
let allData = {};
let documents = [];
let currentBranch = localStorage.getItem('nujoom_current_branch') || null;
let editingId = null, editingDocId = null, activeDocType = 'employee', selectedMonth = null;
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Export to window for email-alerts.js
window.allData = allData;
window.documents = documents;

window.onload = function() {
    setupListeners();
    // Wait for auth
    window.fb.onAuthStateChanged(window.fb.auth, async (user) => {
        if (user) {
            document.getElementById('login-view').classList.remove('active');
            document.querySelectorAll('.logout-btn').forEach(b => b.style.display = 'block');
            await loadDataFromFirestore(user.uid);
            if (!currentBranch || !allData[currentBranch]) {
                showBranchPicker();
            } else {
                startApp(currentBranch);
            }
            if (typeof checkExpiryAlerts === 'function') checkExpiryAlerts();
        } else {
            document.getElementById('login-view').classList.add('active');
            document.getElementById('branch-selection-view').classList.remove('active');
            document.querySelector('.content').style.display = 'none';
            document.querySelectorAll('.logout-btn').forEach(b => b.style.display = 'none');
        }
    });
};

async function loadDataFromFirestore(uid) {
    const settingsRef = window.fb.doc(window.fb.db, `users/${uid}/settings/main`);
    const settingsSnap = await window.fb.getDoc(settingsRef);
    
    // Clear current data before loading
    for (let key in allData) delete allData[key];
    documents.length = 0;

    if (settingsSnap.exists() && settingsSnap.data().branches) {
        settingsSnap.data().branches.forEach(b => allData[b] = []);
    } else {
        allData["Branch 1"] = [];
        await saveBranchesList();
    }
    
    // Load documents
    const docSnap = await window.fb.getDocs(window.fb.collection(window.fb.db, `users/${uid}/documents`));
    docSnap.forEach(d => documents.push(d.data()));
}

async function loadEntriesForBranch(branch) {
    const uid = window.fb.auth.currentUser.uid;
    const entriesSnap = await window.fb.getDocs(window.fb.collection(window.fb.db, `users/${uid}/branches/${branch}/entries`));
    const entries = [];
    entriesSnap.forEach(d => entries.push(d.data()));
    allData[branch] = entries;
}

async function saveBranchesList() {
    const uid = window.fb.auth.currentUser.uid;
    await window.fb.setDoc(window.fb.doc(window.fb.db, `users/${uid}/settings/main`), { branches: Object.keys(allData) }, { merge: true });
}

function showBranchPicker() { 
    document.getElementById('branch-selection-view').classList.add('active'); 
    document.querySelector('.content').style.display = 'none';
    renderBranchButtons(); 
}

function renderBranchButtons() {
    const container = document.getElementById('branch-buttons'); container.innerHTML = '';
    Object.keys(allData).forEach(name => {
        const col = document.createElement('div'); col.className = 'col-6 mb-3';
        col.innerHTML = `<div class="branch-item-btn shadow-sm"><div class="fw-bold h5 mb-2">${name}</div><div class="d-flex gap-2 justify-content-center"><button class="btn btn-sm btn-primary px-3 b-sel rounded-pill">Open</button><button class="btn btn-sm btn-light b-del rounded-pill">🗑️</button></div></div>`;
        col.querySelector('.b-sel').onclick = () => selectBranch(name);
        col.querySelector('.b-del').onclick = (e) => { e.stopPropagation(); deleteBranch(name); };
        container.appendChild(col);
    });
}

async function selectBranch(n) { 
    currentBranch = n; 
    localStorage.setItem('nujoom_current_branch', n); 
    if(!allData[n] || allData[n].length === 0) {
        await loadEntriesForBranch(n);
    }
    startApp(n); 
}

function startApp(n) { 
    document.getElementById('branch-selection-view').classList.remove('active'); 
    document.querySelector('.content').style.display = 'block'; 
    document.querySelectorAll('.active-branch-display').forEach(el => el.textContent = n); 
    switchView('dashboard'); 
}

async function deleteBranch(n) { 
    if(confirm(`Delete "${n}"?`)) { 
        delete allData[n]; 
        await saveBranchesList(); 
        renderBranchButtons(); 
    } 
}

function switchView(v) {
    document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
    const targetId = v.endsWith('-view') ? v : v + '-view';
    const target = document.getElementById(targetId);
    if(target) target.classList.add('active');
    const titleMap = { 'dashboard': 'Dashboard', 'employee-docs': 'Employee Documents', 'company-docs': 'Company Documents', 'month-detail': 'Monthly Ledger', 'settings': 'Alert Settings', 'trash': 'Trash' };
    document.getElementById('page-title').textContent = titleMap[v] || 'Nujoom Ledger';
    document.getElementById('btn-print-ledger').style.display = v === 'month-detail' ? 'block' : 'none';
    document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
    const navBase = v.split('-')[0];
    document.querySelectorAll(`.nav-trigger-${navBase}`).forEach(x => x.classList.add('active'));
    if(v.includes('dashboard')) renderDashboard();
    if(v.includes('docs')) { const type = v.includes('employee') ? 'employee' : 'company'; activeDocType = type; renderDocuments(type); }
    if(v === 'trash') renderTrash();
    window.scrollTo(0,0);
}

function calculateEntry(e) { const bb = Number(e.bb)||0, cb = Number(e.cb)||0, cas = Number(e.cas)||0; return { bk: bb+cb, inc: (bb+cb)+cas, cas, cb, bb }; }

function renderDashboard() {
    const grid = document.getElementById('months-grid'); grid.innerHTML = '';
    let yi=0, yb=0; const entries = allData[currentBranch] || [];
    for(let m=0; m<12; m++) {
        const mEntries = entries.filter(e => new Date(e.date).getMonth() === m);
        let mi=0, mb=0; mEntries.forEach(e => { const c = calculateEntry(e); mi+=c.inc; mb+=c.bk; });
        yi+=mi; yb+=mb;
        const col = document.createElement('div'); col.className = 'col-6 col-md-3';
        col.innerHTML = `<div class="card p-4 border-0 shadow-sm stat-card h-100" style="cursor:pointer"><h5>${monthNames[m]}</h5><div class="text-success small fw-bold">₹${mi.toLocaleString()}</div><div class="text-danger small">Bills: ₹${mb.toLocaleString()}</div></div>`;
        grid.appendChild(col);
        col.onclick = () => { selectedMonth = m; switchView('month-detail'); renderMonthDetail(m); };
    }
    document.getElementById('year-income').textContent = `₹${yi.toLocaleString()}`;
    document.getElementById('year-expense').textContent = `₹${yb.toLocaleString()}`;
    document.getElementById('year-profit').textContent = `₹${(yi-yb).toLocaleString()}`;
}

function renderMonthDetail(m) {
    const body = document.getElementById('daily-entries-body'); body.innerHTML = '';
    const entries = (allData[currentBranch] || []).filter(e => new Date(e.date).getMonth() === m).sort((a,b) => new Date(a.date)-new Date(b.date));
    let cbk=0, ccs=0, cin=0, tcas=0, tcb=0, tba=0, tbb=0; const summary = {};
    entries.forEach(e => {
        const c = calculateEntry(e); cbk+=c.bk; ccs+=c.cas; cin+=c.inc; tcas+=c.cas; tcb+=c.cb; tba+=Number(e.ba)||0; tbb+=Number(e.bb)||0;
        if(e.otherExpenses) e.otherExpenses.forEach(x => summary[x.type] = (summary[x.type]||0) + Number(x.amt));
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="ps-4"><strong>${e.date}</strong></td><td>₹${c.bk}</td><td>₹${c.cas}</td><td>₹${e.ba||0}</td><td>₹${c.cb}</td><td>₹${c.bb}</td><td class="text-success fw-bold">₹${c.inc}</td><td>₹${cbk}</td><td>₹${ccs}</td><td class="text-primary fw-bold">₹${cin}</td><td class="text-center pe-4 d-flex gap-2"><button class="btn btn-sm btn-light" onclick="editEntry(${e.id})">✏️</button><button class="btn btn-sm btn-light" onclick="deleteEntry(${e.id})">🗑️</button></td>`;
        body.appendChild(tr);
    });
    document.getElementById('cash-inflow').textContent = `₹${tcas.toLocaleString()}`;
    document.getElementById('cash-outflow').textContent = `₹${tcb.toLocaleString()}`;
    document.getElementById('cash-closing').textContent = `₹${(tcas-tcb).toLocaleString()}`;
    document.getElementById('bank-inflow').textContent = `₹${tba.toLocaleString()}`;
    document.getElementById('bank-outflow').textContent = `₹${tbb.toLocaleString()}`;
    document.getElementById('bank-closing').textContent = `₹${(tba-tbb).toLocaleString()}`;
    document.getElementById('selected-month-name').textContent = monthNames[m];
    document.getElementById('print-month-name').textContent = monthNames[m];
    document.getElementById('month-net-badge').textContent = `Net: ₹${(cin - cbk).toLocaleString()}`;
    const sGrid = document.getElementById('expense-summary-grid'); sGrid.innerHTML = '';
    Object.entries(summary).forEach(([k,v]) => { const col = document.createElement('div'); col.className = 'col-6 col-md-3'; col.innerHTML = `<div class="card p-3 border-0 bg-light rounded-3 shadow-sm small"><strong>${k}</strong><div>₹${v.toLocaleString()}</div></div>`; sGrid.appendChild(col); });
}

function renderDocuments(type) {
    const body = document.querySelector(`.docs-list-body[data-type="${type}"]`); body.innerHTML = '';
    const stats = document.getElementById(`${type}-stats`);
    let exp=0, soon=0, act=0; const today = new Date(); today.setHours(0,0,0,0);
    documents.filter(d => d.docType === type && d.branch === currentBranch).forEach(d => {
        const expiry = new Date(d.expiryDate + 'T00:00:00'); const diff = Math.ceil((expiry - today)/(1000*60*60*24));
        let s = 'Active', sc = 'status-active', txt = `In ${diff} days`;
        if(diff < 0) { s = 'Expired'; sc = 'status-expired'; txt = `Expired ${Math.abs(diff)}d ago`; exp++; } else if(diff <= 30) { s = 'Soon'; sc = 'status-soon'; soon++; } else { act++; }
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="ps-4"><strong>${d.personName}</strong></td><td>${d.docName}</td><td>${d.expiryDate}<br><small class="${diff<0?'text-danger':(diff<=30?'text-warning':'text-muted')}">${txt}</small></td><td><span class="status-badge ${sc}">${s}</span></td><td class="pe-4 text-center d-flex gap-2 justify-content-center"><button class="btn btn-sm btn-light border shadow-sm" onclick="editDoc(${d.id})">✏️</button><button class="btn btn-sm btn-light border shadow-sm" onclick="deleteDoc(${d.id}, '${type}')">🗑️</button></td>`;
        body.appendChild(tr);
    });
    stats.querySelector('.count-expired').textContent = exp; stats.querySelector('.count-soon').textContent = soon; stats.querySelector('.count-active').textContent = act;
}

function editDoc(id) {
    editingDocId = id; const d = documents.find(x => x.id == id); activeDocType = d.docType;
    const isC = activeDocType === 'company';
    document.getElementById('lblDocName').textContent = isC ? 'COMPANY DOC' : 'DOC NAME';
    document.getElementById('lblPersonName').textContent = isC ? 'OWNER NAME' : 'EMPLOYEE NAME';
    document.getElementById('doc-form').reset();
    Object.keys(d).forEach(k => { if(document.getElementById('doc-form').elements[k]) document.getElementById('doc-form').elements[k].value = d[k]; });
    document.getElementById('btn-save-doc').textContent = 'Update Document';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('doc-modal')).show();
}

function updateLiveCalc() { const bb = Number(document.getElementById('bb').value)||0, cb = Number(document.getElementById('cb').value)||0, cas = Number(document.getElementById('cas').value)||0; document.getElementById('preview-bk').textContent = `₹${(bb+cb).toLocaleString()}`; document.getElementById('preview-inc').textContent = `₹${((bb+cb)+cas).toLocaleString()}`; }

function setupListeners() {
    // Auth listeners
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.onclick = async () => {
            const e = document.getElementById('login-email').value.trim().toLowerCase();
            const p = document.getElementById('login-pwd').value.trim();
            console.log("Attempting login with:", e);
            try { await window.fb.signInWithEmailAndPassword(window.fb.auth, e, p); } catch (err) { alert("Login Error: " + err.message); }
        };
    }
    const signupBtn = document.getElementById('signup-btn');
    if (signupBtn) {
        signupBtn.onclick = async () => {
            const e = document.getElementById('login-email').value.trim().toLowerCase();
            const p = document.getElementById('login-pwd').value.trim();
            console.log("Attempting signup with:", e);
            try { await window.fb.createUserWithEmailAndPassword(window.fb.auth, e, p); } catch (err) { alert("Signup Error: " + err.message); }
        };
    }
    
    document.querySelectorAll('.logout-btn').forEach(b => b.onclick = () => window.fb.signOut(window.fb.auth));

    document.getElementById('add-branch-btn').onclick = async () => { 
        const n = document.getElementById('new-branch-name').value.trim(); 
        if(n){ 
            try {
                if(!allData[n]) allData[n]=[]; 
                await saveBranchesList(); 
                renderBranchButtons(); 
                document.getElementById('new-branch-name').value = ''; 
            } catch (err) {
                alert("Failed to add branch: " + err.message);
            }
        } 
    };
    
    document.getElementById('entry-form').onsubmit = async (e) => { 
        e.preventDefault(); 
        try {
            const f = new FormData(e.target); 
            const d = Object.fromEntries(f.entries()); 
            d.otherExpenses = []; 
            document.querySelectorAll('.exp-row').forEach(r => d.otherExpenses.push({type: r.querySelector('.e-t').value, amt: r.querySelector('.e-a').value})); 
            d.id = editingId || Date.now(); 
            const uid = window.fb.auth.currentUser.uid;
            if(!currentBranch) throw new Error("Please select a branch first.");
            await window.fb.setDoc(window.fb.doc(window.fb.db, `users/${uid}/branches/${currentBranch}/entries`, d.id.toString()), d);
            if(editingId) allData[currentBranch] = allData[currentBranch].map(x => x.id == editingId ? d : x); 
            else { if(!allData[currentBranch]) allData[currentBranch]=[]; allData[currentBranch].push(d); } 
            bootstrap.Modal.getOrCreateInstance(document.getElementById('entry-modal')).hide(); 
            if (selectedMonth !== null) renderMonthDetail(selectedMonth); else renderDashboard();
            if (typeof checkExpiryAlerts === 'function') checkExpiryAlerts(); 
        } catch (err) {
            alert("Failed to save entry: " + err.message);
        }
    };

    document.getElementById('doc-form').onsubmit = async (e) => { 
        e.preventDefault(); 
        try {
            const formData = new FormData(e.target); 
            const d = Object.fromEntries(formData.entries()); 
            if(!editingDocId) { d.id = Date.now(); d.docType = activeDocType; d.branch = currentBranch; } 
            else { d.id = editingDocId; d.docType = activeDocType; d.branch = currentBranch; }
            const uid = window.fb.auth.currentUser.uid;
            await window.fb.setDoc(window.fb.doc(window.fb.db, `users/${uid}/documents`, d.id.toString()), d);
            if(editingDocId) {
                 const idx = documents.findIndex(x => x.id == editingDocId);
                 if(idx !== -1) documents[idx] = {...documents[idx], ...d};
            } else documents.push(d); 
            bootstrap.Modal.getOrCreateInstance(document.getElementById('doc-modal')).hide(); 
            renderDocuments(activeDocType); 
            editingDocId = null; 
            if (typeof checkExpiryAlerts === 'function') checkExpiryAlerts(); 
        } catch (err) {
            alert("Failed to save document: " + err.message);
        }
    };
    
    document.querySelectorAll('.nav-trigger-dashboard').forEach(el => el.onclick = () => switchView('dashboard'));
    document.querySelectorAll('.nav-trigger-employee').forEach(el => el.onclick = () => switchView('employee-docs'));
    document.querySelectorAll('.nav-trigger-company').forEach(el => el.onclick = () => switchView('company-docs'));
    document.querySelectorAll('.nav-trigger-settings').forEach(el => el.onclick = () => switchView('settings'));
    document.querySelectorAll('.nav-trigger-trash').forEach(el => el.onclick = () => switchView('trash'));
    document.querySelectorAll('.branch-switch-trigger').forEach(el => el.onclick = () => showBranchPicker());
    
    const checkBtn = document.getElementById('check-expiry-btn');
    if (checkBtn) checkBtn.onclick = () => { checkExpiryAlerts(); alert('Expiry check triggered.'); };
    document.getElementById('back-to-dashboard').onclick = () => switchView('dashboard');
    document.getElementById('btn-print-ledger').onclick = () => window.print();
    document.getElementById('add-entry-btn').onclick = () => { editingId = null; document.getElementById('entry-form').reset(); document.getElementById('other-expenses-container').innerHTML = ''; updateLiveCalc(); };
    ['cas','ba','cb','bb'].forEach(id => document.getElementById(id).oninput = updateLiveCalc);
    document.querySelectorAll('.add-doc-btn').forEach(b => b.onclick = () => { editingDocId = null; document.getElementById('doc-form').reset(); document.getElementById('btn-save-doc').textContent = 'Save Document'; activeDocType = b.dataset.type; const isC = activeDocType === 'company'; document.getElementById('lblDocName').textContent = isC ? 'COMPANY DOC' : 'DOC NAME'; document.getElementById('lblPersonName').textContent = isC ? 'OWNER NAME' : 'EMPLOYEE NAME'; document.getElementById('docCategory').value = isC ? 'License' : 'Passport'; });
}

function addExpenseRow(t='', a='') { const div = document.createElement('div'); div.className = 'exp-row d-flex gap-2'; div.innerHTML = `<input type="text" class="e-t form-control form-control-sm border-0 bg-transparent" placeholder="Type" value="${t}"><input type="number" class="e-a form-control form-control-sm border-0 bg-transparent" placeholder="₹" value="${a}"><button type="button" class="btn btn-sm text-danger" onclick="this.parentElement.remove()">✕</button>`; document.getElementById('other-expenses-container').appendChild(div); }

function editEntry(id) { editingId = id; const e = allData[currentBranch].find(x => x.id == id); Object.keys(e).forEach(k => { if(document.getElementById('entry-form').elements[k]) document.getElementById('entry-form').elements[k].value = e[k]; }); document.getElementById('other-expenses-container').innerHTML = ''; if(e.otherExpenses) e.otherExpenses.forEach(x => addExpenseRow(x.type, x.amt)); updateLiveCalc(); bootstrap.Modal.getOrCreateInstance(document.getElementById('entry-modal')).show(); }

async function deleteEntry(id) {
    if(confirm('Delete?')) {
        const uid = window.fb.auth.currentUser.uid;
        const e = allData[currentBranch].find(x => x.id == id);
        await window.fb.setDoc(window.fb.doc(window.fb.db, `users/${uid}/trash`, id.toString()), { originalType: 'entry', deletedAt: Date.now(), originalData: e, branch: currentBranch });
        await window.fb.deleteDoc(window.fb.doc(window.fb.db, `users/${uid}/branches/${currentBranch}/entries`, id.toString()));
        allData[currentBranch] = allData[currentBranch].filter(x => x.id != id);
        if (selectedMonth !== null) renderMonthDetail(selectedMonth); else renderDashboard();
    }
}

async function deleteDoc(id, type) { 
    if(confirm('Delete?')){ 
        const uid = window.fb.auth.currentUser.uid;
        const d = documents.find(x => x.id == id);
        await window.fb.setDoc(window.fb.doc(window.fb.db, `users/${uid}/trash`, id.toString()), { originalType: 'document', deletedAt: Date.now(), originalData: d });
        await window.fb.deleteDoc(window.fb.doc(window.fb.db, `users/${uid}/documents`, id.toString()));
        const idx = documents.findIndex(x => x.id == id);
        if(idx !== -1) documents.splice(idx, 1);
        renderDocuments(type); 
    } 
}

async function renderTrash() {
    const uid = window.fb.auth.currentUser.uid;
    const trashSnap = await window.fb.getDocs(window.fb.collection(window.fb.db, `users/${uid}/trash`));
    const tbody = document.getElementById('trash-list-body'); tbody.innerHTML = '';
    trashSnap.forEach(d => {
        const item = d.data();
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${item.originalType}</td><td>${new Date(item.deletedAt).toLocaleDateString()}</td><td>${item.originalType === 'document' ? (item.originalData.docName || 'Doc') : 'Entry from ' + item.originalData.date}</td><td><button class="btn btn-sm btn-success mx-1" onclick="restoreTrash('${d.id}')">Restore</button><button class="btn btn-sm btn-danger mx-1" onclick="permanentDelete('${d.id}')">Delete</button></td>`;
        tbody.appendChild(tr);
    });
}

async function restoreTrash(id) {
    const uid = window.fb.auth.currentUser.uid;
    const trashDoc = await window.fb.getDoc(window.fb.doc(window.fb.db, `users/${uid}/trash`, id));
    if(!trashDoc.exists()) return;
    const item = trashDoc.data();
    if(item.originalType === 'document') {
        await window.fb.setDoc(window.fb.doc(window.fb.db, `users/${uid}/documents`, id), item.originalData);
        documents.push(item.originalData);
    } else {
        await window.fb.setDoc(window.fb.doc(window.fb.db, `users/${uid}/branches/${item.branch}/entries`, id), item.originalData);
        if(allData[item.branch]) allData[item.branch].push(item.originalData);
    }
    await window.fb.deleteDoc(window.fb.doc(window.fb.db, `users/${uid}/trash`, id));
    renderTrash();
}

async function permanentDelete(id) {
    if(confirm("Permanent Delete?")) {
        const uid = window.fb.auth.currentUser.uid;
        await window.fb.deleteDoc(window.fb.doc(window.fb.db, `users/${uid}/trash`, id));
        renderTrash();
    }
}

window.editEntry = editEntry; window.deleteEntry = deleteEntry; window.deleteDoc = deleteDoc; window.editDoc = editDoc; window.addExpenseRow = addExpenseRow; window.restoreTrash = restoreTrash; window.permanentDelete = permanentDelete;
