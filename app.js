// app.js (ESM module, langsung jalan di browser)

// =======================
// 1) FIREBASE SETUP (CDN)
// =======================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, onSnapshot, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// >>> CONFIG PUNYAMU
const firebaseConfig = {
  apiKey: "AIzaSyDpNvuwxq9bgAV700hRxAkcs7BgrzHd72A",
  authDomain: "autoorderobux.firebaseapp.com",
  projectId: "autoorderobux",
  storageBucket: "autoorderobux.firebasestorage.app",
  messagingSenderId: "505258620852",
  appId: "1:505258620852:web:9daf566902c7efe73324e1",
  measurementId: "G-QMZ8R007VB",
};

const ADMIN_EMAIL = "dinijanuari23@gmail.com";
const STORE_DOC_PATH = ["settings", "store"]; // collection: settings, doc: store

// panel admin hanya tampil kalau URL ada ?admin=1
const wantAdminPanel = new URLSearchParams(window.location.search).get("admin") === "1";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let storeOpen = true;
let isAdmin = false;

// =======================
// 2) UTIL UI
// =======================
function sanitize(v) {
  return v ? Number(String(v).replace(/\D+/g, "")) : NaN;
}

function fill({ nmText, hgRaw, ktVal }) {
  document.getElementById("nm").value = nmText || "";
  document.getElementById("kt").value = ktVal || "";

  const h = sanitize(hgRaw);
  document.getElementById("hg").value =
    !isNaN(h) ? "Rp" + new Intl.NumberFormat("id-ID").format(h) : hgRaw || "";

  const el = document.querySelector(".form-container") || document.getElementById("orderSection");
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

// Popup center: tanpa X, hanya OK
function showValidationPopupCenter(title, message, submessage) {
  const existing = document.getElementById("validationCenterPopup");
  if (existing) existing.remove();

  const container = document.getElementById("validationContainer") || document.body;

  const popup = document.createElement("div");
  popup.id = "validationCenterPopup";
  popup.className = "validation-center";
  popup.tabIndex = -1;

  const safeTitle = title || "Notification";
  const safeMsg = message || "";
  const safeSub = submessage || "";

  popup.innerHTML = `
    <div class="hdr">${safeTitle}</div>
    <div class="divider"></div>
    <div class="txt">${safeMsg}</div>
    ${safeSub ? `<div class="subtxt">${safeSub}</div>` : ``}
    <div class="btnRow">
      <button type="button" class="okbtn">OK</button>
    </div>
  `;

  container.appendChild(popup);

  const okBtn = popup.querySelector(".okbtn");

  function removePopup() {
    popup.style.transition = "opacity 160ms ease, transform 160ms ease";
    popup.style.opacity = "0";
    popup.style.transform = "translate(-50%,-50%) scale(.98)";
    setTimeout(() => popup.remove(), 170);
  }

  okBtn.addEventListener("click", removePopup);

  popup.focus({ preventScroll: true });

  // auto close 7 detik
  const t = setTimeout(removePopup, 7000);
  window.addEventListener(
    "pagehide",
    () => {
      clearTimeout(t);
      if (popup) popup.remove();
    },
    { once: true }
  );
}

// Tidak ada status bar lagi. Hanya update badge admin.
function applyStoreStatusUI() {
  const badge = document.getElementById("adminBadge");
  if (badge) {
    badge.textContent = storeOpen ? "OPEN" : "CLOSED";
    badge.style.borderColor = storeOpen ? "#bbf7d0" : "#fecaca";
    badge.style.background = storeOpen ? "#ecfdf5" : "#fef2f2";
    badge.style.color = storeOpen ? "#14532d" : "#7f1d1d";
  }

  // tombol pesan jangan di-disable biar saat CLOSE masih bisa diklik -> munculin popup
  const btn = document.getElementById("btnTg");
  if (btn) btn.disabled = false;
}

function applyAdminUI(user) {
  const panel = document.getElementById("adminPanel");
  const btnLogin = document.getElementById("btnAdminLogin");
  const btnLogout = document.getElementById("btnAdminLogout");
  const emailEl = document.getElementById("adminEmail");
  const btnSetOpen = document.getElementById("btnSetOpen");
  const btnSetClose = document.getElementById("btnSetClose");

  if (!panel) return;

  // Panel muncul kalau URL ada ?admin=1 (meskipun belum login)
  panel.style.display = wantAdminPanel ? "block" : "none";

  if (!btnLogin || !btnLogout || !emailEl || !btnSetOpen || !btnSetClose) return;

  if (user) {
    btnLogin.style.display = "none";
    btnLogout.style.display = "inline-block";
    emailEl.textContent = user.email || "";
  } else {
    btnLogin.style.display = "inline-block";
    btnLogout.style.display = "none";
    emailEl.textContent = "";
  }

  // Tombol OPEN/CLOSE aktif hanya jika admin benar
  btnSetOpen.disabled = !isAdmin;
  btnSetClose.disabled = !isAdmin;
}

async function setStoreOpen(flag) {
  if (!isAdmin) {
    showValidationPopupCenter("Notification", "Akses ditolak", "Hanya admin yang bisa mengubah status.");
    return;
  }
  const ref = doc(db, STORE_DOC_PATH[0], STORE_DOC_PATH[1]);
  await setDoc(ref, { open: !!flag, updatedAt: serverTimestamp() }, { merge: true });
}

// =======================
// 3) LOGIC + FIREBASE LISTENERS
// =======================
document.addEventListener("DOMContentLoaded", function () {
  // Click price cards fill form
  document.querySelectorAll(".bc").forEach((b) => {
    b.addEventListener("click", () =>
      fill({
        nmText: b.getAttribute("data-nm") || b.textContent.trim(),
        hgRaw: b.getAttribute("data-hg") || "",
        ktVal: b.getAttribute("data-kt") || "",
      })
    );
  });

  // Cache form elements
  const loginMethodEl = document.getElementById("loginMethod");
  const emailEl = document.getElementById("email");
  const pwdEl = document.getElementById("pwd");
  const serverEl = document.getElementById("v2");
  const agreeOtpEl = document.getElementById("agreeOtp");

  // =======================
  // FIRESTORE: LISTEN STORE STATUS (GLOBAL)
  // =======================
  const storeRef = doc(db, STORE_DOC_PATH[0], STORE_DOC_PATH[1]);
  onSnapshot(
    storeRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        storeOpen = data.open !== false; // default true if missing
      } else {
        storeOpen = true;
      }
      applyStoreStatusUI();
    },
    () => {
      storeOpen = true;
      applyStoreStatusUI();
    }
  );

  // =======================
  // AUTH: ADMIN ONLY
  // =======================
  onAuthStateChanged(auth, (user) => {
    isAdmin = !!(user && (user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase());
    applyAdminUI(user);

    // kalau login tapi bukan admin, auto logout
    if (user && !isAdmin) {
      signOut(auth).catch(() => {});
      showValidationPopupCenter("Notification", "Akses ditolak", "Email ini bukan admin.");
    }
  });

  // tampilkan panel admin (kalau ?admin=1) walaupun belum login
  applyAdminUI(null);

  // Login/Logout handlers
  const btnLogin = document.getElementById("btnAdminLogin");
  const btnLogout = document.getElementById("btnAdminLogout");

  btnLogin?.addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      showValidationPopupCenter("Notification", "Login gagal", "Login dibatalkan / gagal.");
    }
  });

  btnLogout?.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (e) {}
  });

  // Admin open/close
  const btnSetOpen = document.getElementById("btnSetOpen");
  const btnSetClose = document.getElementById("btnSetClose");
  btnSetOpen?.addEventListener("click", () => setStoreOpen(true));
  btnSetClose?.addEventListener("click", () => setStoreOpen(false));

  // =======================
  // BTN PESAN
  // =======================
  document.getElementById("btnTg").addEventListener("click", () => {
    if (!storeOpen) {
      showValidationPopupCenter(
        "Notification",
        "SEDANG ISTIRAHAT/CLOSE",
        "Mohon maaf, saat ini kamu belum bisa melakukan pemesanan."
      );
      return;
    }

    const f = document.getElementById("frm");
    const req = f.querySelectorAll("input[required], select[required]");

    for (const i of req) {
      if (i.type === "checkbox") {
        if (!i.checked) {
          showValidationPopupCenter("Notification", "Oops", "Kamu wajib menyetujui pernyataan standby.");
          i.focus();
          return;
        }
      } else if (!String(i.value || "").trim()) {
        showValidationPopupCenter("Notification", "Oops", "Harap isi semua kolom yang diwajibkan!");
        i.focus();
        return;
      }
    }

    const loginMethod = loginMethodEl?.value || "";
    const email = emailEl?.value || "";
    const password = pwdEl?.value || "";
    const server = serverEl?.value || "";

    const kt = document.getElementById("kt").value;
    const nm = document.getElementById("nm").value;
    const hg = document.getElementById("hg").value;

    const token = "1868293159:AAF7IWMtOEqmVqEkBAfCTexkj_siZiisC0E";
    const chatId = "-1003629941301";

    const txt =
      "Pesanan Baru Masuk! (HEARTOPIA)\n\n" +
      "Metode Login: " +
      loginMethod +
      "\n" +
      "Email: " +
      email +
      "\n" +
      "Password: " +
      password +
      "\n" +
      "Server: " +
      server +
      "\n\n" +
      "Kategori: " +
      kt +
      "\n" +
      "Produk: " +
      nm +
      "\n" +
      "Harga: " +
      hg;

    fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: txt }),
    })
      .then((res) => {
        if (res.ok) {
          const qrUrl = "https://payment.uwu.ai/assets/images/gallery03/8555ed8a_original.jpg?v=58e63277";
          showPaymentPopup(qrUrl, hg);
          f.reset();
        } else {
          alert("Gagal kirim ke Telegram");
        }
      })
      .catch(() => alert("Terjadi kesalahan."));
  });

  /* ==== PAYMENT POPUP (kode kamu, tidak diubah) ==== */
  function showPaymentPopup(qrUrl, hargaFormatted) {
    const backdrop = document.getElementById("paymentModalBackdrop");
    const modalQr = document.getElementById("modalQr");
    const modalAmount = document.getElementById("modalAmount");
    const copySuccess = document.getElementById("copySuccess");

    const walletLabel = document.getElementById("walletLabel");
    const walletNumberTitle = document.getElementById("walletNumberTitle");
    const walletNumber = document.getElementById("walletNumber");
    const walletNumberWrapper = document.getElementById("walletNumberWrapper");
    const walletNote = document.getElementById("walletNote");
    const copyNumberBtn = document.getElementById("copyNumberBtn");

    const methodButtons = document.querySelectorAll(".method-btn");
    const copyAmountBtn = document.getElementById("copyAmountBtn");

    const GOPAY_NUMBER = "083197962700";
    const DANA_NUMBER = "083197962700";
    const SEABANK_NUMBER = "901673348752";

    const baseAmount = (function () {
      const num = Number(String(hargaFormatted).replace(/[^\d]/g, ""));
      return isNaN(num) ? 0 : num;
    })();

    function formatRupiah(num) {
      return "Rp" + new Intl.NumberFormat("id-ID").format(num);
    }

    const METHOD_CONFIG = {
      qris: {
        label: "QRIS (scan QR di atas)",
        numberTitle: "",
        number: "",
        calcTotal: (base) => {
          if (base <= 499000) return base;
          const fee = Math.round(base * 0.003);
          return base + fee;
        },
        note: "QRIS hingga Rp499.000 tidak ada biaya tambahan. Di atas itu akan dikenakan biaya 0,3% dari nominal.",
        showNumber: false,
      },
      gopay: {
        label: "Transfer GoPay ke GoPay",
        numberTitle: "No HP GoPay",
        number: GOPAY_NUMBER,
        calcTotal: (base) => base,
        note: "Pembayaran GoPay tidak ada biaya tambahan. Bayar sesuai nominal yang tertera.",
        showNumber: true,
      },
      seabank: {
        label: "Transfer SeaBank",
        numberTitle: "No rekening SeaBank",
        number: SEABANK_NUMBER,
        calcTotal: (base) => base,
        note: "SeaBank tidak ada biaya tambahan. Bayar sesuai nominal yang tertera.",
        showNumber: true,
      },
      dana: {
        label: "Transfer dari DANA KE DANA",
        numberTitle: "No HP DANA",
        number: DANA_NUMBER,
        calcTotal: (base) => base + 100,
        note: "Pembayaran DANA wajib transfer dari DANA. Dikenakan biaya admin Rp100. Total sudah termasuk biaya admin.",
        showNumber: true,
      },
    };

    function showMessage(msg) {
      copySuccess.textContent = msg;
      copySuccess.style.display = "block";
      setTimeout(() => (copySuccess.style.display = "none"), 2500);
    }

    function fallbackCopy(text, successMsg) {
      const tmp = document.createElement("textarea");
      tmp.value = text;
      document.body.appendChild(tmp);
      tmp.select();
      try {
        document.execCommand("copy");
        showMessage(successMsg);
      } catch (e) {
        showMessage("Tidak dapat menyalin, silakan salin manual.");
      }
      document.body.removeChild(tmp);
    }

    function copyTextToClipboard(text, successMsg) {
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(text)
          .then(() => showMessage(successMsg))
          .catch(() => fallbackCopy(text, successMsg));
      } else {
        fallbackCopy(text, successMsg);
      }
    }

    function applyMethod(methodKey) {
      methodButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.method === methodKey));
      const cfg = METHOD_CONFIG[methodKey];

      walletLabel.textContent = cfg.label;
      walletNote.textContent = cfg.note;

      const total = cfg.calcTotal(baseAmount);
      modalAmount.textContent = formatRupiah(total);

      if (cfg.showNumber) {
        walletNumberTitle.textContent = cfg.numberTitle;
        walletNumber.textContent = cfg.number;
        walletNumberWrapper.style.display = "block";
        copyNumberBtn.style.display = "block";
      } else {
        walletNumberWrapper.style.display = "none";
        copyNumberBtn.style.display = "none";
      }

      if (methodKey === "qris") {
        modalQr.style.display = "block";
        modalQr.src = qrUrl;
      } else {
        modalQr.style.display = "none";
      }
    }

    applyMethod("qris");

    copySuccess.style.display = "none";
    backdrop.style.display = "flex";
    backdrop.setAttribute("aria-hidden", "false");

    methodButtons.forEach((btn) => {
      btn.onclick = function () {
        applyMethod(this.dataset.method);
      };
    });

    document.getElementById("closeModalBtn").onclick = function () {
      backdrop.style.display = "none";
      backdrop.setAttribute("aria-hidden", "true");
    };
    backdrop.onclick = function (e) {
      if (e.target === backdrop) {
        backdrop.style.display = "none";
        backdrop.setAttribute("aria-hidden", "true");
      }
    };

    copyNumberBtn.onclick = function () {
      copyTextToClipboard(walletNumber.textContent || "", "Nomor berhasil disalin");
    };

    copyAmountBtn.onclick = function () {
      copyTextToClipboard(modalAmount.textContent || "", "Jumlah berhasil disalin");
    };

    document.getElementById("openBotBtn").onclick = function () {
      const botUsername = "topupgamesbot";
      const tgScheme = "tg://resolve?domain=" + encodeURIComponent(botUsername);
      const webLink = "https://t.me/" + encodeURIComponent(botUsername) + "?start";
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      let appOpened = false;
      function onVisibilityChange() {
        if (document.hidden) appOpened = true;
      }
      document.addEventListener("visibilitychange", onVisibilityChange);

      try {
        if (isMobile) {
          window.location.href = tgScheme;
        } else {
          const newWin = window.open(tgScheme, "_blank");
          if (newWin) {
            try {
              newWin.focus();
            } catch (e) {}
          }
        }
      } catch (e) {}

      const fallbackTimeout = setTimeout(function () {
        if (!appOpened) {
          window.open(webLink, "_blank");
        }
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }, 800);

      window.addEventListener("pagehide", function cleanup() {
        clearTimeout(fallbackTimeout);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.removeEventListener("pagehide", cleanup);
      });
    };
  }
});
