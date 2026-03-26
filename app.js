import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy, serverTimestamp, where, getDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// Menggunakan Config yang kamu berikan
const firebaseConfig = {
    apiKey: "AIzaSyBlGxf4oifqu5SllyB_pxRtdrsqjASyjHw",
    authDomain: "warung-ice-bubble.firebaseapp.com",
    projectId: "warung-ice-bubble",
    storageBucket: "warung-ice-bubble.firebasestorage.app",
    messagingSenderId: "962374853255",
    appId: "1:962374853255:web:b2785c5afa267f9d3b4e22",
    measurementId: "G-ZVV74N3BPJ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let allProducts = [];
let myChart;
let userRole = "staff"; // Default role

// --- LOGIKA ROLE & AUTH ---
onAuthStateChanged(auth, async (user) => {
    const loginPage = document.getElementById('loginPage');
    const mainContent = document.getElementById('mainContent');

    if (user) {
        // Tarik data role dari koleksi 'users' berdasarkan UID
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        
        userRole = userSnap.exists() ? userSnap.data().role : "staff";

        loginPage.classList.add('hidden');
        mainContent.classList.remove('hidden');
        document.getElementById('userDisplay').innerText = `${user.email} (${userRole})`;

        handleUIPermissions(userRole);
        loadData();
    } else {
        loginPage.classList.remove('hidden');
        mainContent.classList.add('hidden');
    }
});

function handleUIPermissions(role) {
    const isOwner = role === 'owner';
    // Sembunyikan Nav Laporan & Form Tambah jika bukan owner
    document.getElementById('navLaporan').classList.toggle('hidden', !isOwner);
    document.getElementById('navStok').classList.toggle('hidden', !isOwner);
    document.getElementById('adminForm').classList.toggle('hidden', !isOwner);
    
    // Sembunyikan tombol hapus secara global via CSS
    let styleTag = document.getElementById('role-style');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'role-style';
        document.head.appendChild(styleTag);
    }
    styleTag.innerHTML = isOwner ? "" : ".btn-hapus { display: none !important; }";
}

// --- FUNGSI LOGIN / LOGOUT ---
document.getElementById('btnLogin').onclick = async () => {
    const e = document.getElementById('email').value;
    const p = document.getElementById('password').value;
    try { 
        await signInWithEmailAndPassword(auth, e, p); 
    } catch (err) { 
        document.getElementById('authMsg').innerText = "Login Gagal! Cek Email/Pass."; 
    }
};

document.getElementById('btnLogout').onclick = () => signOut(auth);

// --- KELOLA STOK (CRUD) ---
function loadData() {
    // Listen data stok real-time
    onSnapshot(query(collection(db, "stok_warung"), orderBy("nama", "asc")), (snap) => {
        allProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderInventory(allProducts);
    });
    
    // Hanya jalankan render laporan jika owner
    if (userRole === 'owner') renderLaporan();
}

document.getElementById('btnSave').onclick = async () => {
    const nama = document.getElementById('prodName').value;
    const modal = parseInt(document.getElementById('prodBuy').value);
    const jual = parseInt(document.getElementById('prodSell').value);
    const stok = parseInt(document.getElementById('prodStock').value);

    if (nama && modal && jual) {
        await addDoc(collection(db, "stok_warung"), { 
            nama, harga_modal: modal, harga_jual: jual, stok: stok || 0, waktu: serverTimestamp() 
        });
        // Reset form
        ['prodName', 'prodBuy', 'prodSell', 'prodStock'].forEach(id => document.getElementById(id).value = "");
    }
};

function renderInventory(products) {
    const list = document.getElementById('inventoryList');
    list.innerHTML = "";
    products.forEach(p => {
        const isLow = (p.stok || 0) < 5 ? 'border-red-200 bg-red-50' : 'border-slate-100';
        list.innerHTML += `
            <div class="p-4 rounded-2xl border ${isLow} flex justify-between items-center shadow-sm">
                <div>
                    <h4 class="font-bold text-sm uppercase">${p.nama}</h4>
                    <p class="text-[10px] text-slate-400 font-bold">STOK: ${p.stok}</p>
                    <p class="text-xs font-black text-blue-600">Rp ${p.harga_jual?.toLocaleString()}</p>
                </div>
                <div class="flex gap-2 items-center">
                    <button onclick="updateQty('${p.id}', ${p.stok - 1}, '${p.nama}', ${p.harga_modal}, ${p.harga_jual}, 'jual')" class="w-10 h-10 bg-slate-100 rounded-xl font-bold hover:bg-orange-100">-</button>
                    <button onclick="updateQty('${p.id}', ${p.stok + 1})" class="w-10 h-10 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700">+</button>
                    <button onclick="hapusBarang('${p.id}')" class="btn-hapus ml-2 text-slate-300 hover:text-red-500">🗑️</button>
                </div>
            </div>`;
    });
}

window.updateQty = async (id, newQty, nama, modal, jual, tipe) => {
    if (newQty < 0) return;
    await updateDoc(doc(db, "stok_warung", id), { stok: newQty });
    if (tipe === 'jual') {
        await addDoc(collection(db, "log_penjualan"), { 
            nama, modal, jual, profit: jual - modal, waktu: serverTimestamp() 
        });
        showReceipt(nama, jual);
    }
};

window.hapusBarang = async (id) => { 
    if(confirm("Hapus barang dari daftar?")) await deleteDoc(doc(db, "stok_warung", id)); 
};

// --- LAPORAN & GRAFIK ---
function renderLaporan() {
    const awal = new Date(); awal.setHours(0,0,0,0);
    const q = query(collection(db, "log_penjualan"), where("waktu", ">=", awal), orderBy("waktu", "asc"));
    
    onSnapshot(q, (snap) => {
        let omzet = 0, profit = 0, chartLabels = [], chartData = [];
        const log = document.getElementById('transactionLog');
        log.innerHTML = "";

        snap.forEach(d => {
            const data = d.data();
            omzet += data.jual; profit += data.profit;
            const jam = data.waktu?.toDate().toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) || "";
            chartLabels.push(jam);
            chartData.push(profit);

            log.innerHTML += `
                <div class="p-4 flex justify-between text-xs">
                    <span><b>${data.nama}</b><br><small class="text-slate-400">${jam}</small></span>
                    <span class="text-right text-emerald-600 font-bold">+Rp ${data.jual.toLocaleString()}</span>
                </div>`;
        });
        document.getElementById('statOmzet').innerText = omzet.toLocaleString();
        document.getElementById('statProfit').innerText = profit.toLocaleString();
        updateChart(chartLabels, chartData);
    });
}

function updateChart(labels, data) {
    const ctx = document.getElementById('salesChart').getContext('2d');
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{ label: 'Profit', data, borderColor: '#2563eb', tension: 0.4, fill: true, backgroundColor: 'rgba(37,99,235,0.1)' }]
        },
        options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
}

// --- NAVIGASI & SEARCH ---
document.getElementById('navStok').onclick = () => switchTab('stok');
document.getElementById('navLaporan').onclick = () => switchTab('laporan');

function switchTab(t) {
    document.getElementById('pageStok').classList.toggle('hidden', t !== 'stok');
    document.getElementById('pageLaporan').classList.toggle('hidden', t !== 'laporan');
    document.getElementById('navStok').className = `nav-item ${t === 'stok' ? 'text-blue-600' : 'text-slate-400'}`;
    document.getElementById('navLaporan').className = `nav-item ${t === 'laporan' ? 'text-blue-600' : 'text-slate-400'}`;
}

document.getElementById('searchInput').oninput = (e) => {
    const filtered = allProducts.filter(p => p.nama.toLowerCase().includes(e.target.value.toLowerCase()));
    renderInventory(filtered);
};

// --- STRUK ---
window.closeReceipt = () => document.getElementById('receiptModal').classList.add('hidden');
function showReceipt(n, h) {
    document.getElementById('resItemName').innerText = n;
    document.getElementById('resItemPrice').innerText = "Rp " + h.toLocaleString();
    document.getElementById('resTime').innerText = new Date().toLocaleString('id-ID');
    document.getElementById('receiptModal').classList.remove('hidden');
}