/**
 * =====================================================
 *  DESTRUYE Y ORDENA — Parche Supabase v3
 *  Agrega esta linea justo antes de </body> en tu HTML:
 *  <script type="module" src="supabase_patch.js"></script>
 * =====================================================
 */

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://ugfsvolregmdtwagmkbk.supabase.co";
const SUPABASE_KEY = "sb_publishable_tw9_SXAyNJEiUpEERqmHvA_qqJhy7Id";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 1. Verificar sesion activa
const { data: { session } } = await supabase.auth.getSession();
if (!session) {
    window.location.href = "index.html";
}
const userId = session.user.id;

// 2. Cargar progreso (highScore, monedas, logros) desde Supabase
let sbHighScore = 0;
let sbMonedas   = 0;
let sbCompras   = [];
let sbLogros    = [];

const { data: progreso } = await supabase
    .from("progreso")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

if (progreso) {
    sbHighScore = progreso.puntaje_maximo || 0;
    sbMonedas   = progreso.monedas        || 0;
    try {
        sbLogros = JSON.parse(progreso.logros || "[]");
    } catch(e) {
        sbLogros = [];
    }
} else {
    await supabase.from("progreso").insert({
        user_id: userId,
        puntaje_maximo: 0,
        monedas: 0,
        logros: "[]",
        actualizado: new Date().toISOString()
    });
}

// 3. Cargar compras
const { data: comprasData } = await supabase
    .from("compras")
    .select("item_id")
    .eq("user_id", userId);

if (comprasData) {
    sbCompras = comprasData.map(c => c.item_id);
}

console.log("Supabase listo — highScore:", sbHighScore, "| monedas:", sbMonedas, "| logros:", sbLogros.length, "| compras:", sbCompras.length);

// Helpers para guardar en Supabase
async function sbGuardarProgreso(puntaje_maximo, monedas, logrosArr) {
    await supabase.from("progreso").upsert(
        {
            user_id: userId,
            puntaje_maximo,
            monedas,
            logros: JSON.stringify(logrosArr || sbLogros),
            actualizado: new Date().toISOString()
        },
        { onConflict: "user_id" }
    );
}

async function sbRegistrarCompra(item_id) {
    await supabase.from("compras").insert({
        user_id: userId,
        item_id: String(item_id),
        comprado_en: new Date().toISOString()
    });
}

// Restaurar items/paletas/profesores comprados
function restaurarCompras() {
    if (!sbCompras.length) return;
    sbCompras.forEach(id => {
        if (typeof palettes !== "undefined") {
            const pal = palettes.find(p => p.id === id);
            if (pal) { pal.owned = true; return; }
        }
        if (typeof teachers !== "undefined") {
            const t = teachers.find(t => t.id === id);
            if (t) { t.owned = true; return; }
        }
        if (typeof shopItems !== "undefined") {
            Object.keys(shopItems).forEach(cat => {
                const item = shopItems[cat].find(i => i.id === id);
                if (item) item.owned = true;
            });
        }
    });
    console.log("Compras restauradas:", sbCompras.length, "items");
}

// Restaurar logros desbloqueados
function restaurarLogros() {
    if (!sbLogros.length) return;
    if (typeof achievements === "undefined") return;
    sbLogros.forEach(id => {
        const ach = achievements.find(a => a.id === id);
        if (ach) {
            ach.unlocked = true;
            ach.progress = ach.count;
        }
    });
    console.log("Logros restaurados:", sbLogros.length);
}

// Obtener lista actual de logros desbloqueados
function obtenerLogrosActuales() {
    if (typeof achievements === "undefined") return [];
    return achievements.filter(a => a.unlocked).map(a => a.id);
}

// 4. Interceptar startGame()
await new Promise(r => setTimeout(r, 200));

const _origStartGame = window.startGame;
window.startGame = function() {
    _origStartGame.apply(this, arguments);
    setTimeout(() => {
        if (typeof game === "undefined") return;

        if (sbHighScore > game.highScore) {
            game.highScore = sbHighScore;
            if (typeof setStorage === "function") setStorage("highScore", sbHighScore);
            const el = document.getElementById("highScoreValue");
            if (el) el.textContent = sbHighScore;
        }

        if (sbMonedas > game.coins) {
            game.coins = sbMonedas;
            const menuCoins = document.getElementById("menuCoins");
            if (menuCoins) menuCoins.textContent = game.coins;
            if (typeof updateHUD === "function") updateHUD();
        }

        restaurarLogros();
        restaurarCompras();
        if (typeof initShop === "function") initShop();
        if (typeof initAchievements === "function") initAchievements();

    }, 150);
};

// 5. Guardar highScore en Supabase
const _origUpdateHS = window.updateHighScore;
window.updateHighScore = function() {
    const antes = typeof game !== "undefined" ? game.highScore : 0;
    _origUpdateHS.apply(this, arguments);
    const despues = typeof game !== "undefined" ? game.highScore : 0;
    if (despues > antes) {
        sbHighScore = despues;
        sbGuardarProgreso(despues, typeof game !== "undefined" ? game.coins : 0, obtenerLogrosActuales());
    }
};

// 6. Guardar monedas y logros al guardar datos permanentes
const _origSavePerm = window.savePermanentData;
window.savePermanentData = function() {
    _origSavePerm.apply(this, arguments);
    if (typeof game !== "undefined") {
        sbMonedas = game.coins;
        const logrosActuales = obtenerLogrosActuales();
        sbLogros = logrosActuales;
        sbGuardarProgreso(game.highScore, game.coins, logrosActuales);
    }
};

// 7. Guardar logro inmediatamente cuando se desbloquea
const _origUnlockAch = window.unlockAchievement;
window.unlockAchievement = function(ach) {
    _origUnlockAch.apply(this, arguments);
    setTimeout(() => {
        if (typeof game === "undefined") return;
        const logrosActuales = obtenerLogrosActuales();
        sbLogros = logrosActuales;
        sbGuardarProgreso(game.highScore, game.coins, logrosActuales);
        console.log("Logro guardado en Supabase:", ach.id);
    }, 100);
};

// 8. Registrar compra de objeto
const _origBuyItem = window.buyItem;
window.buyItem = function(item, category) {
    const antesOwned = item ? item.owned : false;
    _origBuyItem.apply(this, arguments);
    if (item && item.owned && !antesOwned) {
        sbRegistrarCompra(item.id);
        sbCompras.push(item.id);
    }
};

// 9. Registrar compra de profesor
const _origBuyTeacher = window.buyTeacher;
window.buyTeacher = function(teacher) {
    const antesOwned = teacher ? teacher.owned : false;
    _origBuyTeacher.apply(this, arguments);
    if (teacher && teacher.owned && !antesOwned) {
        sbRegistrarCompra(teacher.id);
        sbCompras.push(teacher.id);
    }
};

// 10. Registrar compra de paleta
let _palSnap = [];
function tomarSnapshotPaletas() {
    if (typeof palettes !== "undefined") {
        _palSnap = palettes.map(p => ({ id: p.id, owned: p.owned }));
    }
}

const _origInitShop = window.initShop;
window.initShop = function() {
    const antesOwned = new Set(_palSnap.filter(p => p.owned).map(p => p.id));
    _origInitShop.apply(this, arguments);
    if (typeof palettes !== "undefined") {
        palettes.forEach(p => {
            if (p.owned && !antesOwned.has(p.id)) {
                sbRegistrarCompra(p.id);
                sbCompras.push(p.id);
            }
        });
        tomarSnapshotPaletas();
    }
};

setTimeout(tomarSnapshotPaletas, 600);
console.log("Parche Supabase v3 listo y esperando jugador");
