/**
 * =====================================================
 *  DESTRUYE Y ORDENA — Parche Supabase v2
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

// 2. Cargar progreso desde Supabase ANTES de que el jugador haga click
let sbHighScore = 0;
let sbMonedas   = 0;
let sbCompras   = [];

const { data: progreso } = await supabase
    .from("progreso")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

if (progreso) {
    sbHighScore = progreso.puntaje_maximo || 0;
    sbMonedas   = progreso.monedas        || 0;
} else {
    await supabase.from("progreso").insert({
        user_id: userId,
        puntaje_maximo: 0,
        monedas: 0,
        actualizado: new Date().toISOString()
    });
}

// 3. Cargar lista de items comprados
const { data: comprasData } = await supabase
    .from("compras")
    .select("item_id")
    .eq("user_id", userId);

if (comprasData) {
    sbCompras = comprasData.map(c => c.item_id);
}

console.log("Supabase listo — highScore:", sbHighScore, "| monedas:", sbMonedas, "| compras:", sbCompras.length);

// Helpers para guardar en Supabase
async function sbGuardarProgreso(puntaje_maximo, monedas) {
    await supabase.from("progreso").upsert(
        { user_id: userId, puntaje_maximo, monedas, actualizado: new Date().toISOString() },
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

// Restaurar items/paletas/profesores comprados en las variables del juego
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

// 4. Interceptar startGame() — esperar a que el script principal declare funciones
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

        restaurarCompras();
        if (typeof initShop === "function") initShop();
    }, 150);
};

// 5. Guardar highScore nuevo en Supabase
const _origUpdateHS = window.updateHighScore;
window.updateHighScore = function() {
    const antes = typeof game !== "undefined" ? game.highScore : 0;
    _origUpdateHS.apply(this, arguments);
    const despues = typeof game !== "undefined" ? game.highScore : 0;
    if (despues > antes) {
        sbHighScore = despues;
        sbGuardarProgreso(despues, typeof game !== "undefined" ? game.coins : 0);
    }
};

// 6. Guardar monedas en Supabase al guardar datos permanentes
const _origSavePerm = window.savePermanentData;
window.savePermanentData = function() {
    _origSavePerm.apply(this, arguments);
    if (typeof game !== "undefined") {
        sbMonedas = game.coins;
        sbGuardarProgreso(game.highScore, game.coins);
    }
};

// 7. Registrar compra de objeto de tienda
const _origBuyItem = window.buyItem;
window.buyItem = function(item, category) {
    const antesOwned = item ? item.owned : false;
    _origBuyItem.apply(this, arguments);
    if (item && item.owned && !antesOwned) {
        sbRegistrarCompra(item.id);
        sbCompras.push(item.id);
    }
};

// 8. Registrar compra de profesor
const _origBuyTeacher = window.buyTeacher;
window.buyTeacher = function(teacher) {
    const antesOwned = teacher ? teacher.owned : false;
    _origBuyTeacher.apply(this, arguments);
    if (teacher && teacher.owned && !antesOwned) {
        sbRegistrarCompra(teacher.id);
        sbCompras.push(teacher.id);
    }
};

// 9. Registrar compra de paleta (detectar via initShop)
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
console.log("Parche Supabase v2 listo y esperando jugador");
