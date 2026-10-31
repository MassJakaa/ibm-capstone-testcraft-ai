/**
 * TestCraft AI — app.js
 * ─────────────────────────────────────────────────────────────
 * Architecture:
 *   • AppState      — single source of truth (framework, coverage, input type)
 *   • Templates     — preset source code / stories for each scenario
 *   • Generators    — produce code, matrix, edge-cards, gherkin per framework
 *   • UI Controllers — wire DOM events → state → render cycle
 *   • TestRunner    — animated live simulator (async, step-by-step)
 *   • Utilities     — copy/save/CSV export, toast notifications
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════
   1. APPLICATION STATE
   ═══════════════════════════════════════════════════════════════ */

/** Central mutable state — never mutate directly, use setState() */
const AppState = {
  inputType:    'code',        // 'code' | 'story' | 'api'
  framework:    'pytest',      // 'pytest' | 'jest' | 'junit' | 'go' | 'gherkin'
  coverage:     { happy: true, boundary: true, negative: true, security: false },
  preset:       'ecommerce',   // last loaded preset key
  generating:   false,
  hasOutput:    false,
  runnerActive: false,
  /** update specific fields and re-render affected components */
  set(patch) { Object.assign(this, patch); }
};

/* ═══════════════════════════════════════════════════════════════
   2. PRESET TEMPLATE LIBRARY
   Each preset provides: { label, inputType, source, filename(fw) }
   ═══════════════════════════════════════════════════════════════ */

const PRESETS = {

  ecommerce: {
    label:     'E-Commerce Checkout',
    inputType: 'code',
    source: `# E-Commerce Checkout — Logika validasi keranjang & harga
class ShoppingCart:
    MIN_QTY   = 1
    MAX_QTY   = 99
    MAX_PRICE = 999_999.99

    def __init__(self):
        self.items = {}  # {product_id: {name, price, qty}}

    def add_item(self, product_id: str, name: str, price: float, qty: int) -> None:
        """Tambah produk ke keranjang. Raises ValueError jika data tidak valid."""
        if not product_id or not isinstance(product_id, str):
            raise ValueError("product_id harus berupa string non-kosong")
        if price < 0 or price > self.MAX_PRICE:
            raise ValueError(f"Harga harus antara 0 dan {self.MAX_PRICE}")
        if qty < self.MIN_QTY or qty > self.MAX_QTY:
            raise ValueError(f"Kuantitas harus antara {self.MIN_QTY} dan {self.MAX_QTY}")
        if product_id in self.items:
            self.items[product_id]['qty'] += qty
        else:
            self.items[product_id] = {'name': name, 'price': price, 'qty': qty}

    def apply_coupon(self, code: str) -> float:
        """Terapkan kode kupon. Kembalikan persentase diskon (0.0–1.0)."""
        coupons = {'SAVE10': 0.10, 'SAVE20': 0.20, 'HALFOFF': 0.50}
        if code not in coupons:
            raise ValueError(f"Kode kupon '{code}' tidak valid")
        return coupons[code]

    def calculate_total(self, coupon_code: str = None) -> float:
        """Hitung total akhir termasuk diskon opsional."""
        subtotal = sum(i['price'] * i['qty'] for i in self.items.values())
        if coupon_code:
            discount = self.apply_coupon(coupon_code)
            subtotal = round(subtotal * (1 - discount), 2)
        return subtotal`,
    filename: fw => fw === 'jest' ? 'cart.test.js'
                  : fw === 'junit' ? 'CartTest.java'
                  : fw === 'go'   ? 'cart_test.go'
                  : fw === 'gherkin' ? 'checkout.feature'
                  : 'test_cart.py'
  },

  auth: {
    label:     'User Auth & Password Policy',
    inputType: 'code',
    source: `# Autentikasi pengguna dan validasi kebijakan kata sandi
import re, hashlib, time

class AuthService:
    MAX_ATTEMPTS = 5
    LOCKOUT_SEC  = 300  # 5 menit

    def __init__(self, user_store: dict):
        self._store    = user_store  # {email: {password_hash, failed, locked_until}}
        self._sessions = {}          # {token: email}

    def validate_password(self, password: str) -> bool:
        """Kebijakan: min 8 karakter, huruf besar, angka, simbol."""
        if len(password) < 8:  return False
        if not re.search(r'[A-Z]', password): return False
        if not re.search(r'\\d',   password): return False
        if not re.search(r'[!@#$%^&*]', password): return False
        return True

    def login(self, email: str, password: str) -> str:
        """Login. Mengembalikan session token. Raises AuthError jika gagal."""
        user = self._store.get(email)
        if not user:
            raise AuthError("Email tidak terdaftar")
        if time.time() < user.get('locked_until', 0):
            raise AuthError("Akun terkunci karena terlalu banyak percobaan")
        hashed = hashlib.sha256(password.encode()).hexdigest()
        if hashed != user['password_hash']:
            user['failed'] = user.get('failed', 0) + 1
            if user['failed'] >= self.MAX_ATTEMPTS:
                user['locked_until'] = time.time() + self.LOCKOUT_SEC
            raise AuthError("Kata sandi salah")
        user['failed'] = 0
        token = hashlib.sha256(f"{email}{time.time()}".encode()).hexdigest()
        self._sessions[token] = email
        return token

class AuthError(Exception): pass`,
    filename: fw => fw === 'jest' ? 'auth.test.js'
                  : fw === 'junit' ? 'AuthServiceTest.java'
                  : fw === 'go'   ? 'auth_test.go'
                  : fw === 'gherkin' ? 'authentication.feature'
                  : 'test_auth_service.py'
  },

  bank: {
    label:     'Bank Account Transfer',
    inputType: 'code',
    source: `# Logika transfer antar rekening bank dengan kontrol konkurensi
from decimal import Decimal, ROUND_HALF_UP
import threading

class BankAccount:
    MIN_BALANCE  = Decimal('0.00')
    MAX_TRANSFER = Decimal('50000.00')
    TRANSFER_FEE = Decimal('0.001')  # 0.1%

    def __init__(self, account_id: str, owner: str, balance: Decimal):
        self.account_id = account_id
        self.owner      = owner
        self._balance   = balance
        self._lock      = threading.Lock()

    @property
    def balance(self) -> Decimal:
        return self._balance

    def deposit(self, amount: Decimal) -> None:
        if amount <= 0:
            raise ValueError("Jumlah deposit harus positif")
        with self._lock:
            self._balance += amount

    def withdraw(self, amount: Decimal) -> None:
        if amount <= 0:
            raise ValueError("Jumlah penarikan harus positif")
        with self._lock:
            if self._balance - amount < self.MIN_BALANCE:
                raise InsufficientFundsError("Saldo tidak mencukupi")
            self._balance -= amount

    def transfer_to(self, target: 'BankAccount', amount: Decimal) -> None:
        """Transfer dengan biaya 0.1%. Max Rp 50.000 per transaksi."""
        if amount <= 0 or amount > self.MAX_TRANSFER:
            raise ValueError(f"Jumlah transfer harus antara 0 dan {self.MAX_TRANSFER}")
        fee   = (amount * self.TRANSFER_FEE).quantize(Decimal('0.01'), ROUND_HALF_UP)
        total = amount + fee
        self.withdraw(total)
        target.deposit(amount)

class InsufficientFundsError(Exception): pass`,
    filename: fw => fw === 'jest' ? 'bankAccount.test.js'
                  : fw === 'junit' ? 'BankAccountTest.java'
                  : fw === 'go'   ? 'bank_test.go'
                  : fw === 'gherkin' ? 'bank_transfer.feature'
                  : 'test_bank_account.py'
  },

  agile: {
    label:     'Agile Story',
    inputType: 'story',
    source: `## User Story: Manajemen Profil Pengguna

**Sebagai** pengguna terdaftar,
**Saya ingin** dapat memperbarui profil saya (nama, email, foto profil, nomor telepon),
**Agar** informasi akun saya selalu akurat dan terkini.

### Acceptance Criteria (DoD):

**Skenario 1 — Update nama berhasil:**
- Given pengguna sudah login
- When pengguna mengubah nama dengan 2–50 karakter alfanumerik
- Then sistem menyimpan nama baru dan menampilkan notifikasi sukses

**Skenario 2 — Validasi format email:**
- Given pengguna mencoba mengubah email
- When email baru tidak mengandung "@" dan domain valid
- Then sistem menampilkan pesan error "Format email tidak valid"

**Skenario 3 — Upload foto profil:**
- Given pengguna mengunggah foto
- When ukuran file > 2MB atau format bukan JPEG/PNG/WebP
- Then sistem menolak upload dengan pesan error spesifik

**Skenario 4 — Nomor telepon Indonesia:**
- When nomor telepon tidak diawali +62 atau 0 dan tidak terdiri dari 9–13 digit
- Then sistem menampilkan pesan error validasi

### Non-Functional Requirements:
- Response time update profil < 500ms (P95)
- Semua perubahan diaudit dalam audit log
- Concurrent update dari 2 sesi harus aman (optimistic locking)`,
    filename: fw => fw === 'jest' ? 'userProfile.test.js'
                  : fw === 'junit' ? 'UserProfileTest.java'
                  : fw === 'go'   ? 'user_profile_test.go'
                  : fw === 'gherkin' ? 'user_profile.feature'
                  : 'test_user_profile.py'
  }
};

/* ═══════════════════════════════════════════════════════════════
   3. TEST MATRIX DATA
   Returns array of row objects keyed to the active preset/framework
   ═══════════════════════════════════════════════════════════════ */

/**
 * Build the test matrix rows for the given preset.
 * Rows are filtered by active coverage options.
 * @param {string} preset
 * @param {object} coverage
 * @returns {Array<{id,cat,scenario,input,expected,priority}>}
 */
function buildMatrix(preset, coverage) {
  const all = MATRIX_DATA[preset] || MATRIX_DATA.ecommerce;
  return all.filter(row => {
    if (row.cat === 'Happy'    && !coverage.happy)    return false;
    if (row.cat === 'Boundary' && !coverage.boundary) return false;
    if (row.cat === 'Negative' && !coverage.negative) return false;
    if (row.cat === 'Security' && !coverage.security) return false;
    return true;
  });
}

/* Raw matrix rows per preset */
const MATRIX_DATA = {

  ecommerce: [
    { id:'TC-01', cat:'Happy',    scenario:'Tambah item valid ke keranjang',           input:'id="P1", price=99.99, qty=2',          expected:'items["P1"] = {price:99.99, qty:2}',  priority:'High'   },
    { id:'TC-02', cat:'Happy',    scenario:'Hitung total tanpa kupon',                 input:'subtotal = 199.98',                    expected:'total = 199.98',                      priority:'High'   },
    { id:'TC-03', cat:'Happy',    scenario:'Terapkan kupon SAVE10 dengan benar',       input:'coupon="SAVE10", subtotal=200',         expected:'total = 180.00 (diskon 10%)',        priority:'High'   },
    { id:'TC-04', cat:'Happy',    scenario:'Terapkan kupon HALFOFF',                   input:'coupon="HALFOFF", subtotal=500',        expected:'total = 250.00',                     priority:'Medium' },
    { id:'TC-05', cat:'Boundary', scenario:'Harga tepat di batas maksimum (999999.99)',input:'price=999999.99, qty=1',               expected:'Item berhasil ditambahkan',           priority:'High'   },
    { id:'TC-06', cat:'Boundary', scenario:'Harga di atas batas (1000000.00)',         input:'price=1000000.00',                     expected:'ValueError: harga melebihi batas',   priority:'High'   },
    { id:'TC-07', cat:'Boundary', scenario:'Kuantitas minimal (1)',                    input:'qty=1',                                expected:'Item berhasil ditambahkan',           priority:'Medium' },
    { id:'TC-08', cat:'Boundary', scenario:'Kuantitas maksimal (99)',                  input:'qty=99',                               expected:'Item berhasil ditambahkan',           priority:'Medium' },
    { id:'TC-09', cat:'Boundary', scenario:'Kuantitas di atas batas (100)',            input:'qty=100',                              expected:'ValueError: qty > 99',               priority:'High'   },
    { id:'TC-10', cat:'Negative', scenario:'product_id kosong/null',                  input:'product_id=""',                        expected:'ValueError: product_id invalid',     priority:'High'   },
    { id:'TC-11', cat:'Negative', scenario:'Harga negatif',                            input:'price=-1.00',                         expected:'ValueError: harga negatif',          priority:'High'   },
    { id:'TC-12', cat:'Negative', scenario:'Kupon tidak valid',                        input:'coupon="BOGUS99"',                     expected:'ValueError: kode kupon tidak valid', priority:'Medium' },
    { id:'TC-13', cat:'Security', scenario:'Injeksi string di product_id',             input:"product_id=\"' OR 1=1--\"",           expected:'ValueError atau sanitasi otomatis',  priority:'High'   },
    { id:'TC-14', cat:'Security', scenario:'Floating-point rounding pada total',       input:'price=0.1, qty=3 (0.1+0.1+0.1)',       expected:'total = 0.30 (bukan 0.30000...4)',   priority:'Medium' },
  ],

  auth: [
    { id:'TC-01', cat:'Happy',    scenario:'Login dengan kredensial valid',           input:'email="user@ex.com", pw="Abc@1234"',    expected:'Session token (64-char hex)',        priority:'High'   },
    { id:'TC-02', cat:'Happy',    scenario:'Kata sandi memenuhi semua kebijakan',     input:'pw="SecureP@ss9"',                      expected:'validate_password() = True',         priority:'High'   },
    { id:'TC-03', cat:'Boundary', scenario:'Kata sandi 8 karakter tepat',             input:'pw="Abc@1234"',                         expected:'validate_password() = True',         priority:'High'   },
    { id:'TC-04', cat:'Boundary', scenario:'Kata sandi 7 karakter (di bawah batas)', input:'pw="Abc@123"',                          expected:'validate_password() = False',        priority:'High'   },
    { id:'TC-05', cat:'Boundary', scenario:'Tepat 5x percobaan gagal → lockout',     input:'5 login gagal berturut-turut',          expected:'Akun terkunci 300 detik',            priority:'High'   },
    { id:'TC-06', cat:'Boundary', scenario:'4x percobaan gagal (belum terkunci)',     input:'4 login gagal',                         expected:'AuthError tanpa lockout',            priority:'Medium' },
    { id:'TC-07', cat:'Negative', scenario:'Email tidak terdaftar',                   input:'email="ghost@ex.com"',                  expected:'AuthError: email tidak terdaftar',   priority:'High'   },
    { id:'TC-08', cat:'Negative', scenario:'Kata sandi tanpa huruf besar',            input:'pw="nouppercas3!"',                     expected:'validate_password() = False',        priority:'High'   },
    { id:'TC-09', cat:'Negative', scenario:'Kata sandi tanpa angka',                  input:'pw="NoNumbers!"',                      expected:'validate_password() = False',        priority:'Medium' },
    { id:'TC-10', cat:'Negative', scenario:'Login saat akun terkunci',                input:'locked_until = now + 100s',            expected:'AuthError: akun terkunci',           priority:'High'   },
    { id:'TC-11', cat:'Security', scenario:'Injeksi SQL di field email',              input:"email=\"admin'--\"",                   expected:'AuthError atau input disanitasi',    priority:'High'   },
    { id:'TC-12', cat:'Security', scenario:'Password berisi skrip XSS',              input:'pw="<script>alert(1)</script>"',        expected:'Gagal validasi / disanitasi',        priority:'High'   },
    { id:'TC-13', cat:'Security', scenario:'Brute-force credential stuffing',         input:'1000 pasang email/pw acak',             expected:'Rate-limit atau CAPTCHA aktif',      priority:'High'   },
    { id:'TC-14', cat:'Security', scenario:'Timing attack pada perbandingan hash',    input:'pengukuran latency login valid vs invalid', expected:'Waktu respons konstan (constant-time compare)', priority:'Medium' },
  ],

  bank: [
    { id:'TC-01', cat:'Happy',    scenario:'Transfer valid antara dua rekening',       input:'from=Rp5000, amount=Rp1000',           expected:'from=Rp3998.90, to=Rp6000 (fee Rp1)', priority:'High'   },
    { id:'TC-02', cat:'Happy',    scenario:'Deposit amount positif',                   input:'deposit(Rp500)',                       expected:'balance += 500',                     priority:'High'   },
    { id:'TC-03', cat:'Happy',    scenario:'Withdrawal dalam batas saldo',             input:'balance=1000, withdraw(500)',          expected:'balance = 500',                      priority:'High'   },
    { id:'TC-04', cat:'Boundary', scenario:'Transfer tepat batas maksimum (Rp50.000)',input:'amount=50000',                         expected:'Transfer berhasil',                  priority:'High'   },
    { id:'TC-05', cat:'Boundary', scenario:'Transfer di atas batas (Rp50.001)',        input:'amount=50001',                         expected:'ValueError: melebihi batas',         priority:'High'   },
    { id:'TC-06', cat:'Boundary', scenario:'Withdrawal tepat di batas saldo nol',      input:'balance=100, withdraw(100)',           expected:'balance = 0.00',                     priority:'High'   },
    { id:'TC-07', cat:'Boundary', scenario:'Withdrawal 1 sen di atas saldo',          input:'balance=100.00, withdraw(100.01)',     expected:'InsufficientFundsError',             priority:'High'   },
    { id:'TC-08', cat:'Negative', scenario:'Deposit jumlah negatif',                   input:'deposit(-50)',                         expected:'ValueError: jumlah negatif',         priority:'High'   },
    { id:'TC-09', cat:'Negative', scenario:'Withdrawal saldo tidak cukup',             input:'balance=50, withdraw(100)',            expected:'InsufficientFundsError',             priority:'High'   },
    { id:'TC-10', cat:'Negative', scenario:'Transfer ke diri sendiri (self-transfer)', input:'source == target',                    expected:'ValueError atau operasi idempoten',  priority:'Medium' },
    { id:'TC-11', cat:'Boundary', scenario:'Floating-point: biaya transfer (0.1%)',   input:'amount=Decimal("0.01")',               expected:'fee = Decimal("0.00") (ROUND_HALF_UP)', priority:'Medium' },
    { id:'TC-12', cat:'Security', scenario:'Race condition: transfer bersamaan',       input:'2 thread transfer simultan dari akun sama', expected:'Saldo konsisten, tidak ada double-spend', priority:'High'  },
    { id:'TC-13', cat:'Security', scenario:'Overflow pada jumlah transfer',            input:'amount=sys.maxsize',                   expected:'ValueError atau OverflowError',      priority:'High'   },
    { id:'TC-14', cat:'Security', scenario:'Thread-safety deposit & withdraw konkuren',input:'100 thread deposit+withdraw bersamaan', expected:'Saldo akhir deterministik',        priority:'High'   },
  ],

  agile: [
    { id:'TC-01', cat:'Happy',    scenario:'Update nama profil berhasil',              input:'name="Budi Santoso" (12 karakter)',     expected:'200 OK, nama tersimpan',             priority:'High'   },
    { id:'TC-02', cat:'Happy',    scenario:'Update email format valid',                input:'email="budi@mail.co.id"',               expected:'200 OK, email diperbarui',           priority:'High'   },
    { id:'TC-03', cat:'Happy',    scenario:'Upload foto JPEG < 2MB',                   input:'file="photo.jpg", size=1.5MB',          expected:'URL foto baru dikembalikan',         priority:'High'   },
    { id:'TC-04', cat:'Boundary', scenario:'Nama tepat 2 karakter (batas minimum)',    input:'name="Bu"',                             expected:'200 OK',                             priority:'Medium' },
    { id:'TC-05', cat:'Boundary', scenario:'Nama 1 karakter (di bawah batas)',         input:'name="B"',                              expected:'422 Unprocessable: nama terlalu pendek', priority:'High'  },
    { id:'TC-06', cat:'Boundary', scenario:'Nama tepat 50 karakter (batas maksimum)', input:'name="A".repeat(50)',                   expected:'200 OK',                             priority:'Medium' },
    { id:'TC-07', cat:'Boundary', scenario:'Foto tepat 2MB (batas atas)',              input:'file size = 2097152 bytes',            expected:'Upload berhasil',                    priority:'Medium' },
    { id:'TC-08', cat:'Boundary', scenario:'Foto 1 byte di atas 2MB',                 input:'file size = 2097153 bytes',            expected:'413 Payload Too Large',              priority:'High'   },
    { id:'TC-09', cat:'Negative', scenario:'Format email tidak valid',                 input:'email="budimail.co.id"',               expected:'422: format email tidak valid',      priority:'High'   },
    { id:'TC-10', cat:'Negative', scenario:'Format foto bukan JPEG/PNG/WebP',         input:'file="document.pdf"',                  expected:'415 Unsupported Media Type',         priority:'High'   },
    { id:'TC-11', cat:'Negative', scenario:'Nomor telepon format salah',               input:'phone="08123" (< 9 digit)',            expected:'422: format nomor tidak valid',      priority:'Medium' },
    { id:'TC-12', cat:'Security', scenario:'XSS via field nama',                       input:'name="<img src=x onerror=alert(1)>"',  expected:'Output di-encode, script tidak jalan', priority:'High'  },
    { id:'TC-13', cat:'Security', scenario:'Optimistic locking pada update konkuren',  input:'2 sesi update profil bersamaan',       expected:'409 Conflict pada sesi kedua',       priority:'High'   },
    { id:'TC-14', cat:'Security', scenario:'Upload file berbahaya (disguised PHP)',    input:'file="shell.php" direname "photo.jpg"', expected:'Ditolak: content-type mismatch',   priority:'High'   },
  ]
};

/* ═══════════════════════════════════════════════════════════════
   4. EDGE CASES & SECURITY CARDS DATA
   ═══════════════════════════════════════════════════════════════ */

const EDGE_CARDS = {

  ecommerce: [
    { icon:'⚡', title:'Floating-Point Rounding',         color:'amber',
      body:'IEEE 754 dapat menyebabkan 0.1 + 0.1 + 0.1 ≠ 0.3. Gunakan Decimal atau round() untuk kalkulasi harga.',
      code:`# Contoh masalah:\nprint(0.1 * 3)  # → 0.30000000000000004\n# Solusi: round(0.1 * 3, 2)  # → 0.30`},
    { icon:'🏁', title:'Boundary Partition: Quantity',    color:'blue',
      body:'Ekivalensi: [invalid: qty<1], [valid: 1–99], [invalid: qty>99]. Uji titik batas 0, 1, 99, 100.',
      code:`# Test tepat di batas:\nassert cart.add_item("X", "Y", 1.0, 1)   # min valid\nassert cart.add_item("X", "Y", 1.0, 99)  # max valid\n# pytest.raises(ValueError): qty=0 dan qty=100`},
    { icon:'💉', title:'SQL Injection via product_id',    color:'red',
      body:"String seperti `' OR 1=1--` harus divalidasi atau disanitasi sebelum digunakan sebagai kunci.",
      code:`product_id = "' OR 1=1--"\n# Validasi regex wajib:\nimport re\nif not re.match(r'^[a-zA-Z0-9_-]+$', pid):\n    raise ValueError("product_id tidak valid")`},
    { icon:'🔁', title:'Idempotent add_item (duplikat)',   color:'purple',
      body:'Menambahkan produk yang sama dua kali harus menjumlah qty, bukan membuat entri duplikat.',
      code:`cart.add_item("P1", "Buku", 10.0, 2)\ncart.add_item("P1", "Buku", 10.0, 3)\nassert cart.items["P1"]["qty"] == 5  # bukan 2 atau 3`},
    { icon:'🚫', title:'Empty Cart Total',                 color:'slate',
      body:'calculate_total() pada keranjang kosong harus mengembalikan 0.0, bukan crash atau NaN.',
      code:`cart = ShoppingCart()\nassert cart.calculate_total() == 0.0`},
    { icon:'🔐', title:'AI Mitigasi: Prompt Injection',   color:'ibm',
      body:'Jika input pengguna digunakan dalam prompt LLM, validasi ketat diperlukan untuk mencegah instruksi jahat.',
      code:`# Tambahkan guard di lapisan aplikasi:\nif len(user_input) > 500 or '<' in user_input:\n    raise SecurityError("Input potensial berbahaya")`}
  ],

  auth: [
    { icon:'⏱', title:'Race Condition: Account Lockout',  color:'red',
      body:'Dua request login gagal bersamaan dapat melewati counter lockout jika tidak dilindungi lock atomik.',
      code:`# Gunakan atomic increment:\nwith threading.Lock():\n    user['failed'] += 1\n    if user['failed'] >= MAX_ATTEMPTS:\n        user['locked_until'] = time.time() + 300`},
    { icon:'🕐', title:'Timing Attack pada Hash Compare', color:'amber',
      body:'Perbandingan string biasa membocorkan waktu eksekusi. Gunakan hmac.compare_digest().',
      code:`# Rentan:\nif stored_hash == input_hash: ...\n# Aman:\nimport hmac\nif hmac.compare_digest(stored_hash, input_hash): ...`},
    { icon:'🔑', title:'Boundary: Password Length',       color:'blue',
      body:'Partisi ekivalensi: [<8 invalid], [8–128 valid], [>128 DOS risk]. Uji panjang 7, 8, 128, 129.',
      code:`# Test batas:\nassert not svc.validate_password("Abc@123")   # 7 char\nassert svc.validate_password("Abc@1234")    # 8 char\nassert not svc.validate_password("A"*129+"@1") # >128`},
    { icon:'🤖', title:'Brute-Force / Credential Stuffing', color:'purple',
      body:'Setelah lockout tercapai, sistem harus tetap merespons dalam waktu konstan untuk menghindari user enumeration.',
      code:`# Uji bahwa error message sama:\n# "Email tidak terdaftar" vs "Kata sandi salah"\n# → gunakan pesan generik yang sama untuk mencegah enumerasi`},
    { icon:'💉', title:'XSS via Email Field',              color:'red',
      body:'Field email harus di-sanitize sebelum disimpan atau ditampilkan kembali ke pengguna lain.',
      code:`malicious = '<script>alert(document.cookie)</script>@evil.com'\n# Harus gagal validasi format email\nassert not is_valid_email(malicious)`},
    { icon:'🛡', title:'AI Mitigasi: Adversarial Auth',   color:'ibm',
      body:'Model AI yang menganalisis pola login juga dapat diserang dengan pola statistik yang tidak wajar. Tambahkan rate-limiter berbasis IP.',
      code:`# Rate limit: maks 10 req/menit per IP\n# Implementasi: Redis dengan TTL sliding window`}
  ],

  bank: [
    { icon:'🔒', title:'Race Condition: Double Spend',     color:'red',
      body:'Dua withdrawal bersamaan dari rekening yang sama tanpa lock dapat menguras saldo lebih dari yang tersedia.',
      code:`# Simulasi race condition:\nt1 = Thread(target=acct.withdraw, args=(Decimal('100'),))\nt2 = Thread(target=acct.withdraw, args=(Decimal('100'),))\nt1.start(); t2.start(); t1.join(); t2.join()\n# Saldo harus tetap >= 0`},
    { icon:'💱', title:'Decimal Precision: Biaya Transfer', color:'amber',
      body:'0.1% dari Decimal("0.01") = Decimal("0.00001") yang perlu di-round ke 2 desimal.',
      code:`from decimal import Decimal, ROUND_HALF_UP\namount = Decimal("0.01")\nfee = (amount * Decimal("0.001")).quantize(\n    Decimal("0.01"), rounding=ROUND_HALF_UP\n)\n# fee = Decimal("0.00") bukan Decimal("0.00001")`},
    { icon:'🏁', title:'Boundary: Transfer Amount',        color:'blue',
      body:'Ekivalensi: [0 tidak valid], [0.01–50000 valid], [>50000 tidak valid]. Uji Rp0.01, Rp50000, Rp50000.01.',
      code:`transfer_to(target, Decimal("0.01"))   # min valid\ntransfer_to(target, Decimal("50000"))  # max valid\n# raises ValueError:\ntransfer_to(target, Decimal("50000.01"))`},
    { icon:'🔄', title:'Self-Transfer Idempotency',         color:'purple',
      body:'Transfer dari rekening ke diri sendiri seharusnya tidak mengubah saldo (net zero), atau dilarang eksplisit.',
      code:`acct_a = BankAccount("A001", "Budi", Decimal("1000"))\n# Transfer ke diri sendiri:\nacct_a.transfer_to(acct_a, Decimal("100"))\n# Saldo harus tetap 1000, atau ValueError`},
    { icon:'♾', title:'Integer Overflow pada Amount',      color:'amber',
      body:'Input Decimal(float("inf")) atau sys.maxsize harus ditangkap sebelum operasi aritmetika.',
      code:`import sys\ntry:\n    acct.deposit(Decimal(str(sys.maxsize)))\nexcept (ValueError, OverflowError) as e:\n    assert "overflow" in str(e).lower() or True`},
    { icon:'🛡', title:'AI Mitigasi: Anomaly Detection',   color:'ibm',
      body:'Transaksi dengan pola tidak wajar (frekuensi tinggi, jumlah tepat batas) dapat mengindikasikan serangan automasi.',
      code:`# Tambahkan rule: > 10 transfer/jam dari IP sama\n# → tahan transaksi untuk review manual\n# Integrasikan dengan IBM Watson Financial Crimes`}
  ],

  agile: [
    { icon:'📋', title:'Concurrent Profile Update',        color:'red',
      body:'Optimistic locking: jika 2 sesi update pada versi yang sama, sesi kedua harus mendapatkan 409 Conflict.',
      code:`# Sertakan version_token dalam setiap request:\nPUT /api/profile\n{\n  "name": "Budi",\n  "version_token": "etag-abc123"\n}\n# Jika token tidak cocok → 409 Conflict`},
    { icon:'📁', title:'File Upload: Content-Type Mismatch', color:'amber',
      body:'File PHP yang di-rename menjadi .jpg bisa melewati validasi ekstensi saja. Selalu cek magic bytes/MIME.',
      code:`import imghdr\ndef is_valid_image(file_bytes):\n    detected = imghdr.what(None, h=file_bytes)\n    return detected in ('jpeg', 'png', 'webp')\n# Hanya membaca ekstensi: TIDAK AMAN`},
    { icon:'🔤', title:'Boundary: Name Length',             color:'blue',
      body:'Ekivalensi: [<2 invalid], [2–50 valid], [>50 invalid]. Uji panjang 1, 2, 50, 51.',
      code:`# Test batas:\nupdate_profile(name="B")        # 1 char → 422\nupdate_profile(name="Bu")       # 2 char → 200\nupdate_profile(name="A"*50)     # 50 char → 200\nupdate_profile(name="A"*51)     # 51 char → 422`},
    { icon:'💉', title:'XSS via Profile Fields',            color:'red',
      body:'Nama, bio, dan nomor telepon yang disimpan harus di-encode saat ditampilkan untuk mencegah stored XSS.',
      code:`name = "<script>alert('XSS')</script>"\n# Setelah disimpan dan dibaca kembali:\nstored = get_profile()['name']\nassert '<script>' not in stored  # harus di-encode`},
    { icon:'📱', title:'Phone Number Regex Boundary',       color:'purple',
      body:'Regex telepon Indonesia: /^(\\+62|0)[0-9]{9,13}$/. Uji edge: +62123456789 (valid), 081234 (terlalu pendek).',
      code:`import re\nphone_re = re.compile(r'^(\\+62|0)[0-9]{9,13}$')\nassert phone_re.match("+6281234567890")  # valid\nassert not phone_re.match("08123")       # terlalu pendek`},
    { icon:'🛡', title:'AI Mitigasi: Data Poisoning',       color:'ibm',
      body:'Jika profil digunakan sebagai training data untuk model personalisasi, input berbahaya dapat meracuni model.',
      code:`# Sanitasi sebelum masuk pipeline ML:\nfrom html import escape\nclean_name = escape(user_input.strip())\n# Batasi karakter: hanya alfanumerik + spasi + . - '`}
  ]
};

/* ═══════════════════════════════════════════════════════════════
   5. CODE GENERATORS (per framework)
   ═══════════════════════════════════════════════════════════════ */

/**
 * Main dispatcher: picks the right generator for the active framework.
 * @param {string} preset
 * @param {string} framework
 * @param {object} coverage
 * @param {string} constraints
 * @returns {string} raw source code string
 */
function generateCode(preset, framework, coverage, constraints) {
  const generators = {
    pytest:   generatePytest,
    jest:     generateJest,
    junit:    generateJUnit,
    go:       generateGo,
    gherkin:  generateGherkin
  };
  return (generators[framework] || generatePytest)(preset, coverage, constraints);
}

/* ─── pytest ────────────────────────────────────────────────── */
function generatePytest(preset, coverage, constraints) {
  const P = PRESET_META[preset];
  return `# ══════════════════════════════════════════════════════════
# Generated by TestCraft AI — IBM Bob Engine: granite-code-34b
# Preset   : ${P.title}
# Framework: Python pytest + unittest.mock
# Coverage : ${activeCoverage(coverage)}
# Constraints: ${constraints}
# ══════════════════════════════════════════════════════════
import pytest
from unittest.mock import patch, MagicMock
${P.imports}

class Test${P.className}:
    """Test suite untuk ${P.description}"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Inisialisasi fixture yang dipakai bersama."""
        ${P.fixture}

${P.happyPath(coverage.happy)}
${P.boundaryTests(coverage.boundary)}
${P.negativeTests(coverage.negative)}
${P.securityTests(coverage.security)}

# ─── Parameterized boundary sweep ───────────────────────────
${P.parametrized}`;
}

/* ─── Jest ──────────────────────────────────────────────────── */
function generateJest(preset, coverage, constraints) {
  const P = PRESET_META[preset];
  return `// ══════════════════════════════════════════════════════════
// Generated by TestCraft AI — IBM Bob Engine: granite-code-34b
// Preset   : ${P.title}
// Framework: JavaScript Jest v29 + jest.mock()
// Coverage : ${activeCoverage(coverage)}
// Constraints: ${constraints}
// ══════════════════════════════════════════════════════════
const { ${P.jsClass} } = require('./${P.jsModule}');

describe('${P.title}', () => {
  let instance;

  beforeEach(() => {
    instance = ${P.jsSetup};
  });

${P.jsSuite(coverage)}
});`;
}

/* ─── JUnit 5 ───────────────────────────────────────────────── */
function generateJUnit(preset, coverage, constraints) {
  const P = PRESET_META[preset];
  return `// ══════════════════════════════════════════════════════════
// Generated by TestCraft AI — IBM Bob Engine: granite-code-34b
// Preset   : ${P.title}
// Framework: Java JUnit 5 + Mockito
// Coverage : ${activeCoverage(coverage)}
// Constraints: ${constraints}
// ══════════════════════════════════════════════════════════
package com.testcraft.${preset};

import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@DisplayName("${P.title} — Test Suite")
class ${P.javaClass}Test {

    private ${P.javaClass} sut;  // System Under Test

    @BeforeEach
    void setUp() {
        sut = ${P.javaSetup};
    }

${P.javaSuite(coverage)}
}`;
}

/* ─── Go testing ────────────────────────────────────────────── */
function generateGo(preset, coverage, constraints) {
  const P = PRESET_META[preset];
  return `// ══════════════════════════════════════════════════════════
// Generated by TestCraft AI — IBM Bob Engine: granite-code-34b
// Preset   : ${P.title}
// Framework: Go testing + testify/assert
// Coverage : ${activeCoverage(coverage)}
// Constraints: ${constraints}
// ══════════════════════════════════════════════════════════
package ${preset}_test

import (
    "testing"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

${P.goSuite(coverage)}`;
}

/* ─── BDD Gherkin ───────────────────────────────────────────── */
function generateGherkin(preset, coverage, constraints) {
  const P = PRESET_META[preset];
  return `# ══════════════════════════════════════════════════════════
# Generated by TestCraft AI — IBM Bob Engine: granite-code-34b
# Preset   : ${P.title}
# Format   : Cucumber BDD Gherkin
# Coverage : ${activeCoverage(coverage)}
# Constraints: ${constraints}
# ══════════════════════════════════════════════════════════

${P.gherkin(coverage)}`;
}

/** Helper: comma-separated active coverage labels */
function activeCoverage(cov) {
  const labels = [];
  if (cov.happy)    labels.push('Happy Path');
  if (cov.boundary) labels.push('Boundary Values');
  if (cov.negative) labels.push('Negative/Exception');
  if (cov.security) labels.push('Security OWASP');
  return labels.join(', ') || 'None selected';
}

/* ═══════════════════════════════════════════════════════════════
   6. PRESET META — per-framework code snippets
   ═══════════════════════════════════════════════════════════════ */

const PRESET_META = {

  /* ─── E-Commerce ──────────────────────────────────────────── */
  ecommerce: {
    title:       'E-Commerce Checkout',
    description: 'ShoppingCart: add_item, apply_coupon, calculate_total',
    className:   'ShoppingCart',
    javaClass:   'ShoppingCart',
    jsClass:     'ShoppingCart',
    jsModule:    'ShoppingCart',
    imports:     `from decimal import Decimal\nfrom shopping_cart import ShoppingCart`,
    fixture: `self.cart = ShoppingCart()`,
    jsSetup:  `new ShoppingCart()`,
    javaSetup: `new ShoppingCart()`,

    happyPath: (on) => !on ? '' : `
    # ── Happy Path Tests ──────────────────────────────────────
    def test_add_item_valid(self):
        """TC-01: Tambah item valid ke keranjang."""
        self.cart.add_item("P001", "Laptop", 9999.99, 2)
        assert "P001" in self.cart.items
        assert self.cart.items["P001"]["qty"] == 2

    def test_calculate_total_without_coupon(self):
        """TC-02: Total tanpa kupon = subtotal mentah."""
        self.cart.add_item("P001", "Laptop", 100.00, 2)
        assert self.cart.calculate_total() == pytest.approx(200.00, rel=1e-6)

    def test_apply_coupon_save10(self):
        """TC-03: Kupon SAVE10 memberikan diskon 10%."""
        self.cart.add_item("P001", "Item", 200.00, 1)
        total = self.cart.calculate_total(coupon_code="SAVE10")
        assert total == pytest.approx(180.00, rel=1e-6)

    def test_apply_coupon_halfoff(self):
        """TC-04: Kupon HALFOFF memberikan diskon 50%."""
        self.cart.add_item("P001", "Item", 500.00, 1)
        total = self.cart.calculate_total(coupon_code="HALFOFF")
        assert total == pytest.approx(250.00, rel=1e-6)`,

    boundaryTests: (on) => !on ? '' : `
    # ── Boundary Value Tests ───────────────────────────────────
    def test_price_at_maximum(self):
        """TC-05: Harga tepat di batas atas (999999.99)."""
        self.cart.add_item("P001", "UltraItem", 999999.99, 1)
        assert self.cart.items["P001"]["price"] == 999999.99

    def test_price_above_maximum_raises(self):
        """TC-06: Harga > 999999.99 harus raise ValueError."""
        with pytest.raises(ValueError, match="Harga harus antara"):
            self.cart.add_item("P001", "Item", 1000000.00, 1)

    def test_quantity_minimum(self):
        """TC-07: Kuantitas minimal 1 harus berhasil."""
        self.cart.add_item("P001", "Item", 10.00, 1)
        assert self.cart.items["P001"]["qty"] == 1

    def test_quantity_maximum(self):
        """TC-08: Kuantitas maksimal 99 harus berhasil."""
        self.cart.add_item("P001", "Item", 10.00, 99)
        assert self.cart.items["P001"]["qty"] == 99

    def test_quantity_above_maximum_raises(self):
        """TC-09: Kuantitas 100 harus raise ValueError."""
        with pytest.raises(ValueError, match="Kuantitas harus antara"):
            self.cart.add_item("P001", "Item", 10.00, 100)

    def test_empty_cart_total(self):
        """Edge: Total keranjang kosong harus 0.0."""
        assert self.cart.calculate_total() == 0.0`,

    negativeTests: (on) => !on ? '' : `
    # ── Negative / Exception Tests ────────────────────────────
    def test_empty_product_id_raises(self):
        """TC-10: product_id kosong harus raise ValueError."""
        with pytest.raises(ValueError):
            self.cart.add_item("", "Item", 10.00, 1)

    def test_negative_price_raises(self):
        """TC-11: Harga negatif harus raise ValueError."""
        with pytest.raises(ValueError):
            self.cart.add_item("P001", "Item", -1.00, 1)

    def test_invalid_coupon_raises(self):
        """TC-12: Kode kupon tidak valid harus raise ValueError."""
        self.cart.add_item("P001", "Item", 100.00, 1)
        with pytest.raises(ValueError, match="tidak valid"):
            self.cart.calculate_total(coupon_code="BOGUS99")`,

    securityTests: (on) => !on ? '' : `
    # ── Security & Edge Cases ─────────────────────────────────
    def test_sql_injection_product_id(self):
        """TC-13: product_id dengan SQL injection harus ditolak."""
        with pytest.raises((ValueError, TypeError)):
            self.cart.add_item("' OR 1=1--", "Item", 10.00, 1)

    def test_floating_point_precision(self):
        """TC-14: 0.1 × 3 harus di-round dengan benar."""
        self.cart.add_item("P001", "Item", 0.10, 3)
        total = self.cart.calculate_total()
        assert round(total, 10) == pytest.approx(0.30, rel=1e-6)`,

    parametrized: `
@pytest.mark.parametrize("price,qty,expected", [
    (0.01,  1,  True),   # harga minimum valid
    (999999.99, 1, True), # harga maksimum valid
    (-0.01, 1, False),    # harga negatif
    (1000000, 1, False),  # harga melebihi batas
    (10.0, 0,  False),    # qty di bawah minimum
    (10.0, 99, True),     # qty maksimum valid
    (10.0, 100, False),   # qty di atas maksimum
])
def test_add_item_parametrized(price, qty, expected):
    cart = ShoppingCart()
    if expected:
        cart.add_item("P001", "Item", price, qty)
        assert "P001" in cart.items
    else:
        with pytest.raises(ValueError):
            cart.add_item("P001", "Item", price, qty)`,

    jsSuite: (cov) => `
  ${cov.happy ? `// ── Happy Path
  test('TC-01: adds valid item to cart', () => {
    instance.addItem('P001', 'Laptop', 9999.99, 2);
    expect(instance.items['P001'].qty).toBe(2);
  });

  test('TC-02: calculates total without coupon', () => {
    instance.addItem('P001', 'Item', 100, 2);
    expect(instance.calculateTotal()).toBeCloseTo(200, 5);
  });

  test('TC-03: applies SAVE10 coupon (10% off)', () => {
    instance.addItem('P001', 'Item', 200, 1);
    expect(instance.calculateTotal('SAVE10')).toBeCloseTo(180, 5);
  });` : ''}

  ${cov.boundary ? `// ── Boundary Values
  test('TC-05: price exactly at max (999999.99)', () => {
    expect(() => instance.addItem('P001', 'X', 999999.99, 1)).not.toThrow();
  });

  test('TC-06: price above max throws', () => {
    expect(() => instance.addItem('P001', 'X', 1000000, 1)).toThrow(RangeError);
  });

  test('TC-09: qty = 100 throws', () => {
    expect(() => instance.addItem('P001', 'X', 10, 100)).toThrow(RangeError);
  });` : ''}

  ${cov.negative ? `// ── Negative / Exception
  test('TC-10: empty productId throws', () => {
    expect(() => instance.addItem('', 'Item', 10, 1)).toThrow(TypeError);
  });

  test('TC-11: negative price throws', () => {
    expect(() => instance.addItem('P001', 'Item', -1, 1)).toThrow(RangeError);
  });

  test('TC-12: invalid coupon throws', () => {
    instance.addItem('P001', 'Item', 100, 1);
    expect(() => instance.calculateTotal('BOGUS')).toThrow(Error);
  });` : ''}

  ${cov.security ? `// ── Security
  test('TC-13: SQL injection in productId is rejected', () => {
    expect(() => instance.addItem("' OR 1=1--", 'X', 10, 1)).toThrow();
  });

  test.each([
    [0.1, 3, 0.3],
    [0.2, 3, 0.6],
  ])('TC-14: floating point %.1f * %d ≈ %.1f', (price, qty, expected) => {
    instance.addItem('P001', 'Item', price, qty);
    expect(instance.calculateTotal()).toBeCloseTo(expected, 10);
  });` : ''}`,

    javaSuite: (cov) => `
    ${cov.happy ? `@Nested @DisplayName("Happy Path")
    class HappyPath {
        @Test void addValidItem() {
            sut.addItem("P001", "Laptop", 9999.99, 2);
            assertEquals(2, sut.getItems().get("P001").getQty());
        }

        @Test void calculateTotalWithoutCoupon() {
            sut.addItem("P001", "Item", 100.0, 2);
            assertEquals(200.0, sut.calculateTotal(), 1e-6);
        }

        @Test void applySave10Coupon() {
            sut.addItem("P001", "Item", 200.0, 1);
            assertEquals(180.0, sut.calculateTotal("SAVE10"), 1e-6);
        }
    }` : ''}

    ${cov.boundary ? `@Nested @DisplayName("Boundary Values")
    class BoundaryValues {
        @ParameterizedTest
        @CsvSource({"1,true","99,true","0,false","100,false"})
        void quantityBoundary(int qty, boolean valid) {
            if (valid) assertDoesNotThrow(() -> sut.addItem("P1","X",10.0,qty));
            else assertThrows(IllegalArgumentException.class, () -> sut.addItem("P1","X",10.0,qty));
        }
    }` : ''}

    ${cov.negative ? `@Nested @DisplayName("Negative / Exception")
    class NegativeCases {
        @Test void emptyProductIdThrows() {
            assertThrows(IllegalArgumentException.class,
                () -> sut.addItem("", "Item", 10.0, 1));
        }

        @Test void negativePriceThrows() {
            assertThrows(IllegalArgumentException.class,
                () -> sut.addItem("P1", "Item", -1.0, 1));
        }
    }` : ''}`,

    goSuite: (cov) => `${cov.happy ? `func TestAddItemValid(t *testing.T) {
    cart := NewShoppingCart()
    err := cart.AddItem("P001", "Laptop", 9999.99, 2)
    require.NoError(t, err)
    assert.Equal(t, 2, cart.Items["P001"].Qty)
}

func TestCalculateTotalNoCoupon(t *testing.T) {
    cart := NewShoppingCart()
    cart.AddItem("P001", "Item", 100.0, 2)
    total, err := cart.CalculateTotal("")
    require.NoError(t, err)
    assert.InDelta(t, 200.0, total, 1e-6)
}` : ''}

${cov.boundary ? `func TestPriceAtMaximum(t *testing.T) {
    cart := NewShoppingCart()
    assert.NoError(t, cart.AddItem("P001", "X", 999999.99, 1))
}

func TestPriceAboveMaximum(t *testing.T) {
    cart := NewShoppingCart()
    assert.Error(t, cart.AddItem("P001", "X", 1000000.0, 1))
}` : ''}

${cov.negative ? `func TestEmptyProductIDError(t *testing.T) {
    cart := NewShoppingCart()
    err := cart.AddItem("", "Item", 10.0, 1)
    assert.ErrorContains(t, err, "product_id")
}` : ''}`,

    gherkin: (cov) => `Feature: Shopping Cart — Checkout Validation
  As a customer
  I want to add items and calculate totals
  So that I can complete my purchase accurately

  Background:
    Given an empty shopping cart
${cov.happy ? `
  @happy-path
  Scenario: Add valid item to cart
    When I add product "P001" with name "Laptop" price 9999.99 and quantity 2
    Then the cart should contain "P001" with quantity 2

  Scenario: Calculate total without coupon
    Given I have added "Laptop" at price 100.00 with quantity 2
    When I calculate the total
    Then the total should be 200.00

  Scenario: Apply SAVE10 coupon
    Given I have added "Item" at price 200.00 with quantity 1
    When I apply coupon code "SAVE10"
    Then the total should be 180.00` : ''}
${cov.boundary ? `
  @boundary
  Scenario Outline: Quantity boundary validation
    When I add "Item" with quantity <qty>
    Then the result should be <result>

    Examples:
      | qty | result  |
      | 1   | success |
      | 99  | success |
      | 0   | error   |
      | 100 | error   |` : ''}
${cov.negative ? `
  @negative
  Scenario: Add item with empty product ID
    When I add an item with empty product ID
    Then I should see error "product_id harus berupa string non-kosong"

  Scenario: Add item with negative price
    When I add an item with price -1.00
    Then I should see error "Harga harus antara"

  Scenario: Apply invalid coupon
    Given I have items in my cart
    When I apply coupon code "BOGUS99"
    Then I should see error "tidak valid"` : ''}
${cov.security ? `
  @security
  Scenario: SQL injection in product ID
    When I add an item with product ID "' OR 1=1--"
    Then the system should reject the input

  Scenario: Floating point precision in total
    Given I have added "Item" at price 0.10 with quantity 3
    When I calculate the total
    Then the total should be exactly 0.30` : ''}`
  },

  /* ─── Auth ────────────────────────────────────────────────── */
  auth: {
    title:       'User Auth & Password Policy',
    description: 'AuthService: validate_password, login, lockout',
    className:   'AuthService',
    javaClass:   'AuthService',
    jsClass:     'AuthService',
    jsModule:    'AuthService',
    imports:     `import hashlib, time\nfrom auth_service import AuthService, AuthError`,
    fixture: `self.store = {"admin@test.com": {\n            "password_hash": hashlib.sha256(b"Admin@1234").hexdigest(),\n            "failed": 0\n        }}\n        self.svc = AuthService(self.store)`,
    jsSetup:  `new AuthService(mockUserStore)`,
    javaSetup: `new AuthService(mockUserStore)`,

    happyPath: (on) => !on ? '' : `
    # ── Happy Path Tests ──────────────────────────────────────
    def test_login_valid_credentials(self):
        """TC-01: Login dengan kredensial valid."""
        token = self.svc.login("admin@test.com", "Admin@1234")
        assert isinstance(token, str) and len(token) == 64

    def test_validate_password_strong(self):
        """TC-02: Kata sandi kuat lolos validasi."""
        assert self.svc.validate_password("SecureP@ss9") is True

    def test_validate_password_minimum_length(self):
        """TC-03: Kata sandi 8 karakter tepat di batas."""
        assert self.svc.validate_password("Abc@1234") is True`,

    boundaryTests: (on) => !on ? '' : `
    # ── Boundary Value Tests ───────────────────────────────────
    def test_password_7_chars_invalid(self):
        """TC-04: 7 karakter di bawah batas minimum."""
        assert self.svc.validate_password("Abc@123") is False

    def test_account_lockout_after_5_failures(self):
        """TC-05: Akun terkunci setelah tepat 5 percobaan gagal."""
        for _ in range(5):
            with pytest.raises(AuthError):
                self.svc.login("admin@test.com", "WrongPass!")
        with pytest.raises(AuthError, match="terkunci"):
            self.svc.login("admin@test.com", "Admin@1234")

    def test_no_lockout_at_4_failures(self):
        """TC-06: 4 percobaan gagal belum memicu lockout."""
        for _ in range(4):
            with pytest.raises(AuthError, match="salah"):
                self.svc.login("admin@test.com", "WrongPass!")`,

    negativeTests: (on) => !on ? '' : `
    # ── Negative / Exception Tests ────────────────────────────
    def test_login_unknown_email(self):
        """TC-07: Email tidak terdaftar harus AuthError."""
        with pytest.raises(AuthError, match="tidak terdaftar"):
            self.svc.login("ghost@ex.com", "Abc@1234")

    def test_password_no_uppercase_invalid(self):
        """TC-08: Kata sandi tanpa huruf besar tidak valid."""
        assert self.svc.validate_password("nouppercase1!") is False

    def test_password_no_number_invalid(self):
        """TC-09: Kata sandi tanpa angka tidak valid."""
        assert self.svc.validate_password("NoNumbers!") is False

    def test_login_while_locked(self):
        """TC-10: Login saat akun terkunci harus AuthError."""
        self.store["admin@test.com"]["locked_until"] = time.time() + 300
        with pytest.raises(AuthError, match="terkunci"):
            self.svc.login("admin@test.com", "Admin@1234")`,

    securityTests: (on) => !on ? '' : `
    # ── Security Tests ────────────────────────────────────────
    def test_sql_injection_email(self):
        """TC-11: Injeksi SQL di field email harus ditolak."""
        with pytest.raises((AuthError, ValueError)):
            self.svc.login("admin'--", "Admin@1234")

    def test_xss_in_password(self):
        """TC-12: XSS dalam password tidak boleh dieksekusi."""
        result = self.svc.validate_password("<script>alert(1)</script>")
        assert isinstance(result, bool)  # tidak crash, mengembalikan bool

    def test_constant_time_comparison(self):
        """TC-14: Perbandingan hash harus konstan untuk cegah timing attack."""
        import time as t
        times = []
        for _ in range(10):
            start = t.perf_counter()
            try: self.svc.login("admin@test.com", "WrongPass!")
            except: pass
            times.append(t.perf_counter() - start)
        # Variasi waktu harus < 50ms (threshold kasar)
        assert max(times) - min(times) < 0.05`,

    parametrized: `
@pytest.mark.parametrize("password,expected", [
    ("Abc@1234",  True),   # tepat batas minimum
    ("Abc@123",   False),  # 7 karakter — terlalu pendek
    ("abcdefg!1", False),  # tanpa huruf besar
    ("ABCDEFG!1", False),  # tanpa huruf kecil (walaupun tidak diwajibkan)
    ("Abcdefg12", False),  # tanpa simbol
    ("Abc@defgh", False),  # tanpa angka
    ("A1@aaaaa",  True),   # valid minimum
])
def test_validate_password_parametrized(password, expected):
    svc = AuthService({})
    assert svc.validate_password(password) == expected`,

    jsSuite: (cov) => `
  ${cov.happy ? `test('TC-01: login with valid credentials returns token', async () => {
    const token = await instance.login('admin@test.com', 'Admin@1234');
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  test('TC-02: strong password passes validation', () => {
    expect(instance.validatePassword('SecureP@ss9')).toBe(true);
  });` : ''}

  ${cov.boundary ? `test('TC-04: 7-char password fails minimum length', () => {
    expect(instance.validatePassword('Abc@123')).toBe(false);
  });

  test('TC-05: account locked after 5 failed attempts', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(instance.login('admin@test.com', 'Wrong!')).rejects.toThrow();
    }
    await expect(instance.login('admin@test.com', 'Admin@1234')).rejects.toMatch(/terkunci/);
  });` : ''}

  ${cov.negative ? `test('TC-07: unknown email throws AuthError', async () => {
    await expect(instance.login('ghost@ex.com', 'Abc@1234')).rejects.toThrow('tidak terdaftar');
  });

  test('TC-08: password without uppercase is invalid', () => {
    expect(instance.validatePassword('nouppercase1!')).toBe(false);
  });` : ''}`,

    javaSuite: (cov) => `
    ${cov.happy ? `@Test @DisplayName("TC-01: Login valid credentials")
    void loginValidCredentials() {
        String token = sut.login("admin@test.com", "Admin@1234");
        assertNotNull(token);
        assertEquals(64, token.length());
    }

    @Test @DisplayName("TC-02: Strong password passes")
    void strongPasswordPasses() {
        assertTrue(sut.validatePassword("SecureP@ss9"));
    }` : ''}

    ${cov.boundary ? `@Test @DisplayName("TC-04: 7-char password below minimum")
    void passwordTooShort() {
        assertFalse(sut.validatePassword("Abc@123"));
    }

    @Test @DisplayName("TC-05: Lockout after 5 failures")
    void lockoutAfterFiveFailures() {
        for (int i = 0; i < 5; i++) {
            assertThrows(AuthException.class, () -> sut.login("admin@test.com", "Wrong!"));
        }
        AuthException ex = assertThrows(AuthException.class,
            () -> sut.login("admin@test.com", "Admin@1234"));
        assertTrue(ex.getMessage().contains("terkunci"));
    }` : ''}`,

    goSuite: (cov) => `${cov.happy ? `func TestLoginValidCredentials(t *testing.T) {
    svc := NewAuthService(mockStore())
    token, err := svc.Login("admin@test.com", "Admin@1234")
    require.NoError(t, err)
    assert.Len(t, token, 64)
}

func TestValidateStrongPassword(t *testing.T) {
    svc := NewAuthService(nil)
    assert.True(t, svc.ValidatePassword("SecureP@ss9"))
}` : ''}

${cov.boundary ? `func TestPasswordTooShort(t *testing.T) {
    svc := NewAuthService(nil)
    assert.False(t, svc.ValidatePassword("Abc@123"))
}` : ''}

${cov.negative ? `func TestLoginUnknownEmail(t *testing.T) {
    svc := NewAuthService(mockStore())
    _, err := svc.Login("ghost@ex.com", "Abc@1234")
    assert.ErrorContains(t, err, "tidak terdaftar")
}` : ''}`,

    gherkin: (cov) => `Feature: User Authentication & Password Policy
  As a registered user
  I want to log in securely
  So that my account is protected

  Background:
    Given the authentication service is initialized
    And user "admin@test.com" exists with password "Admin@1234"
${cov.happy ? `
  @happy-path
  Scenario: Successful login with valid credentials
    When I log in with email "admin@test.com" and password "Admin@1234"
    Then I should receive a session token

  Scenario Outline: Password policy validation
    When I validate password "<password>"
    Then the result should be <valid>
    Examples:
      | password     | valid |
      | SecureP@ss9  | true  |
      | Abc@1234     | true  |
      | Abc@123      | false |
      | nouppercase1!| false |` : ''}
${cov.boundary ? `
  @boundary
  Scenario: Account lockout after exactly 5 failed attempts
    When I fail to log in 5 times in a row
    Then my account should be locked for 300 seconds
    And subsequent login attempts should fail with "terkunci"` : ''}
${cov.negative ? `
  @negative
  Scenario: Login with unregistered email
    When I log in with email "ghost@ex.com"
    Then I should see error "Email tidak terdaftar"` : ''}
${cov.security ? `
  @security
  Scenario: SQL injection in email field
    When I log in with email "admin'-- OR 1=1"
    Then the system should reject the attempt` : ''}`
  },

  /* ─── Bank ────────────────────────────────────────────────── */
  bank: {
    title:       'Bank Account Transfer',
    description: 'BankAccount: deposit, withdraw, transfer_to',
    className:   'BankAccount',
    javaClass:   'BankAccount',
    jsClass:     'BankAccount',
    jsModule:    'BankAccount',
    imports:     `from decimal import Decimal\nfrom bank_account import BankAccount, InsufficientFundsError`,
    fixture: `self.src  = BankAccount("A001", "Pengirim",   Decimal("10000.00"))\n        self.dest = BankAccount("A002", "Penerima",   Decimal("5000.00"))`,
    jsSetup:  `new BankAccount('A001', 'Test', 10000)`,
    javaSetup: `new BankAccount("A001", "Test", new BigDecimal("10000.00"))`,

    happyPath: (on) => !on ? '' : `
    # ── Happy Path Tests ──────────────────────────────────────
    def test_transfer_valid_amount(self):
        """TC-01: Transfer valid antara dua rekening."""
        self.src.transfer_to(self.dest, Decimal("1000.00"))
        assert self.src.balance  == Decimal("8999.00")   # 10000 - 1000 - fee(1.00)
        assert self.dest.balance == Decimal("6000.00")   # 5000 + 1000

    def test_deposit_positive_amount(self):
        """TC-02: Deposit jumlah positif."""
        self.src.deposit(Decimal("500.00"))
        assert self.src.balance == Decimal("10500.00")

    def test_withdrawal_within_balance(self):
        """TC-03: Penarikan dalam batas saldo."""
        self.src.withdraw(Decimal("500.00"))
        assert self.src.balance == Decimal("9500.00")`,

    boundaryTests: (on) => !on ? '' : `
    # ── Boundary Value Tests ───────────────────────────────────
    def test_transfer_at_maximum(self):
        """TC-04: Transfer tepat batas maksimum Rp50.000."""
        src = BankAccount("A003", "T", Decimal("100000.00"))
        src.transfer_to(self.dest, Decimal("50000.00"))
        assert src.balance == Decimal("49950.00")  # 100000 - 50000 - fee(50)

    def test_transfer_above_maximum_raises(self):
        """TC-05: Transfer > Rp50.000 harus ValueError."""
        with pytest.raises(ValueError):
            self.src.transfer_to(self.dest, Decimal("50000.01"))

    def test_withdraw_exact_balance(self):
        """TC-06: Penarikan tepat sebesar saldo (→ 0)."""
        self.src.withdraw(Decimal("10000.00"))
        assert self.src.balance == Decimal("0.00")

    def test_withdraw_one_cent_over_balance(self):
        """TC-07: Penarikan 1 sen di atas saldo → InsufficientFundsError."""
        with pytest.raises(InsufficientFundsError):
            self.src.withdraw(Decimal("10000.01"))`,

    negativeTests: (on) => !on ? '' : `
    # ── Negative / Exception Tests ────────────────────────────
    def test_deposit_negative_raises(self):
        """TC-08: Deposit negatif harus ValueError."""
        with pytest.raises(ValueError, match="positif"):
            self.src.deposit(Decimal("-50.00"))

    def test_withdraw_insufficient_balance(self):
        """TC-09: Saldo tidak cukup → InsufficientFundsError."""
        with pytest.raises(InsufficientFundsError):
            BankAccount("X","X",Decimal("50")).withdraw(Decimal("100"))

    def test_transfer_zero_amount_raises(self):
        """TC-10: Transfer Rp0 harus ValueError."""
        with pytest.raises(ValueError):
            self.src.transfer_to(self.dest, Decimal("0.00"))`,

    securityTests: (on) => !on ? '' : `
    # ── Security & Concurrency Tests ──────────────────────────
    def test_race_condition_no_double_spend(self):
        """TC-12: Dua withdrawal bersamaan tidak boleh double-spend."""
        import threading
        errors = []
        def withdraw_half():
            try: self.src.withdraw(Decimal("6000.00"))
            except InsufficientFundsError: errors.append(True)
        t1 = threading.Thread(target=withdraw_half)
        t2 = threading.Thread(target=withdraw_half)
        t1.start(); t2.start(); t1.join(); t2.join()
        # Tepat satu harus berhasil
        assert self.src.balance >= Decimal("0.00")
        assert len(errors) >= 1  # setidaknya satu gagal

    def test_decimal_precision_transfer_fee(self):
        """TC-11: Biaya transfer harus di-round dengan ROUND_HALF_UP."""
        tiny_src = BankAccount("T001", "T", Decimal("10.00"))
        tiny_src.transfer_to(self.dest, Decimal("0.01"))
        # fee = 0.01 * 0.001 = 0.00001 → round → 0.00
        assert tiny_src.balance == Decimal("9.99")`,

    parametrized: `
@pytest.mark.parametrize("amount,should_raise", [
    (Decimal("0.01"),    False),  # minimum valid
    (Decimal("50000"),   False),  # maximum valid
    (Decimal("50000.01"), True),  # di atas maksimum
    (Decimal("0"),       True),   # nol tidak valid
    (Decimal("-1"),      True),   # negatif tidak valid
])
def test_transfer_amount_boundary(amount, should_raise):
    src = BankAccount("T","T", Decimal("100000"))
    dest = BankAccount("D","D", Decimal("100"))
    if should_raise:
        with pytest.raises((ValueError, InsufficientFundsError)):
            src.transfer_to(dest, amount)
    else:
        src.transfer_to(dest, amount)`,

    jsSuite: (cov) => `
  ${cov.happy ? `test('TC-01: valid transfer updates both balances', () => {
    const dest = new BankAccount('A002', 'Dest', 5000);
    src.transferTo(dest, 1000);
    expect(src.balance).toBeCloseTo(8999, 2);
    expect(dest.balance).toBeCloseTo(6000, 2);
  });` : ''}

  ${cov.boundary ? `test('TC-05: transfer above max throws', () => {
    const dest = new BankAccount('A002', 'Dest', 0);
    expect(() => src.transferTo(dest, 50000.01)).toThrow(RangeError);
  });

  test('TC-07: withdraw 1 cent over balance throws', () => {
    expect(() => src.withdraw(10000.01)).toThrow('InsufficientFunds');
  });` : ''}

  ${cov.negative ? `test('TC-08: negative deposit throws', () => {
    expect(() => src.deposit(-50)).toThrow(RangeError);
  });` : ''}`,

    javaSuite: (cov) => `
    ${cov.happy ? `@Test void transferValidAmount() {
        BankAccount dest = new BankAccount("A002","Penerima",new BigDecimal("5000"));
        sut.transferTo(dest, new BigDecimal("1000.00"));
        assertEquals(new BigDecimal("8999.00"), sut.getBalance());
        assertEquals(new BigDecimal("6000.00"), dest.getBalance());
    }` : ''}

    ${cov.boundary ? `@ParameterizedTest
    @CsvSource({"0.01,false","50000,false","50000.01,true","0,true","-1,true"})
    void transferAmountBoundary(String amount, boolean shouldThrow) {
        BankAccount dest = new BankAccount("D","D",new BigDecimal("0"));
        BankAccount bigSrc = new BankAccount("S","S",new BigDecimal("100000"));
        if (shouldThrow) {
            assertThrows(IllegalArgumentException.class,
                () -> bigSrc.transferTo(dest, new BigDecimal(amount)));
        } else {
            assertDoesNotThrow(() -> bigSrc.transferTo(dest, new BigDecimal(amount)));
        }
    }` : ''}`,

    goSuite: (cov) => `${cov.happy ? `func TestTransferValidAmount(t *testing.T) {
    src  := NewBankAccount("A001", "Pengirim", decimal.NewFromFloat(10000))
    dest := NewBankAccount("A002", "Penerima", decimal.NewFromFloat(5000))
    require.NoError(t, src.TransferTo(dest, decimal.NewFromFloat(1000)))
    assert.Equal(t, "8999.00", src.Balance().StringFixed(2))
    assert.Equal(t, "6000.00", dest.Balance().StringFixed(2))
}` : ''}

${cov.boundary ? `func TestTransferAboveMaximum(t *testing.T) {
    src  := NewBankAccount("A001", "T", decimal.NewFromFloat(100000))
    dest := NewBankAccount("A002", "T", decimal.NewFromFloat(0))
    err  := src.TransferTo(dest, decimal.NewFromFloat(50000.01))
    assert.Error(t, err)
}` : ''}`,

    gherkin: (cov) => `Feature: Bank Account Transfer
  As a bank customer
  I want to transfer money between accounts
  So that I can pay others securely

  Background:
    Given account "A001" with balance 10000.00
    And account "A002" with balance 5000.00
${cov.happy ? `
  @happy-path
  Scenario: Successful transfer
    When I transfer 1000.00 from "A001" to "A002"
    Then account "A001" balance should be 8999.00
    And account "A002" balance should be 6000.00` : ''}
${cov.boundary ? `
  @boundary
  Scenario Outline: Transfer amount boundary
    When I transfer <amount> from "A001" to "A002"
    Then the result should be <outcome>
    Examples:
      | amount    | outcome |
      | 0.01      | success |
      | 50000.00  | success |
      | 50000.01  | error   |
      | 0.00      | error   |` : ''}
${cov.security ? `
  @security
  Scenario: Concurrent transfers prevent double spend
    Given two concurrent transfer requests of 6000.00 each
    When both transfers execute simultaneously
    Then only one transfer should succeed
    And the account balance should never go below 0` : ''}`
  },

  /* ─── Agile ───────────────────────────────────────────────── */
  agile: {
    title:       'User Profile Management',
    description: 'ProfileService: update_name, update_email, upload_photo, update_phone',
    className:   'ProfileService',
    javaClass:   'ProfileService',
    jsClass:     'ProfileService',
    jsModule:    'ProfileService',
    imports:     `from profile_service import ProfileService, ValidationError, ConflictError`,
    fixture: `self.svc = ProfileService()\n        self.user_id = "user-123"`,
    jsSetup:  `new ProfileService()`,
    javaSetup: `new ProfileService()`,

    happyPath: (on) => !on ? '' : `
    # ── Happy Path Tests ──────────────────────────────────────
    def test_update_name_valid(self):
        """TC-01: Update nama dengan panjang valid (2–50 karakter)."""
        result = self.svc.update_name(self.user_id, "Budi Santoso")
        assert result["status"] == 200

    def test_update_email_valid_format(self):
        """TC-02: Update email dengan format valid."""
        result = self.svc.update_email(self.user_id, "budi@mail.co.id")
        assert result["status"] == 200

    def test_upload_photo_valid_jpeg(self):
        """TC-03: Upload foto JPEG dengan ukuran < 2MB."""
        with open("fixtures/photo_1mb.jpg", "rb") as f:
            result = self.svc.upload_photo(self.user_id, f.read(), "image/jpeg")
        assert result["status"] == 200
        assert "url" in result`,

    boundaryTests: (on) => !on ? '' : `
    # ── Boundary Value Tests ───────────────────────────────────
    def test_name_exactly_2_chars(self):
        """TC-04: Nama tepat 2 karakter (batas minimum)."""
        assert self.svc.update_name(self.user_id, "Bu")["status"] == 200

    def test_name_1_char_invalid(self):
        """TC-05: Nama 1 karakter di bawah batas minimum."""
        with pytest.raises(ValidationError, match="terlalu pendek"):
            self.svc.update_name(self.user_id, "B")

    def test_name_exactly_50_chars(self):
        """TC-06: Nama tepat 50 karakter (batas maksimum)."""
        assert self.svc.update_name(self.user_id, "A" * 50)["status"] == 200

    def test_name_51_chars_invalid(self):
        """TC-07: Nama 51 karakter di atas batas maksimum."""
        with pytest.raises(ValidationError):
            self.svc.update_name(self.user_id, "A" * 51)

    def test_photo_exactly_2mb(self):
        """TC-08: Foto tepat 2MB (batas atas)."""
        photo_2mb = b"x" * (2 * 1024 * 1024)
        result = self.svc.upload_photo(self.user_id, photo_2mb, "image/jpeg")
        assert result["status"] == 200

    def test_photo_over_2mb_rejected(self):
        """TC-09: Foto 1 byte di atas 2MB harus ditolak."""
        photo_over = b"x" * (2 * 1024 * 1024 + 1)
        with pytest.raises(ValidationError, match="terlalu besar"):
            self.svc.upload_photo(self.user_id, photo_over, "image/jpeg")`,

    negativeTests: (on) => !on ? '' : `
    # ── Negative / Exception Tests ────────────────────────────
    def test_invalid_email_format(self):
        """TC-09: Email tanpa @ harus ValidationError."""
        with pytest.raises(ValidationError, match="format email"):
            self.svc.update_email(self.user_id, "budimail.co.id")

    def test_invalid_photo_format(self):
        """TC-10: Format foto PDF harus ditolak."""
        with pytest.raises(ValidationError, match="format"):
            self.svc.upload_photo(self.user_id, b"fake_pdf", "application/pdf")

    def test_invalid_phone_too_short(self):
        """TC-11: Nomor telepon < 9 digit harus ValidationError."""
        with pytest.raises(ValidationError, match="nomor"):
            self.svc.update_phone(self.user_id, "08123")`,

    securityTests: (on) => !on ? '' : `
    # ── Security Tests ────────────────────────────────────────
    def test_xss_in_name_is_sanitized(self):
        """TC-12: XSS dalam nama harus di-encode/sanitasi."""
        xss = "<script>alert('XSS')</script>"
        result = self.svc.update_name(self.user_id, xss)
        stored = self.svc.get_profile(self.user_id)["name"]
        assert "<script>" not in stored

    def test_optimistic_locking_on_concurrent_update(self):
        """TC-13: Update konkuren harus menghasilkan 409 Conflict."""
        import threading
        results = []
        def update(version):
            try:
                results.append(self.svc.update_name(
                    self.user_id, "Name", version_token=version))
            except ConflictError:
                results.append("conflict")
        t1 = threading.Thread(target=update, args=("tok-v1",))
        t2 = threading.Thread(target=update, args=("tok-v1",))
        t1.start(); t2.start(); t1.join(); t2.join()
        assert "conflict" in results

    def test_file_upload_magic_bytes_check(self):
        """TC-14: File PHP yang di-rename ke .jpg harus ditolak."""
        php_bytes = b"<?php system($_GET['cmd']); ?>"
        with pytest.raises(ValidationError, match="content-type"):
            self.svc.upload_photo(self.user_id, php_bytes, "image/jpeg")`,

    parametrized: `
@pytest.mark.parametrize("name,valid", [
    ("Bu",      True),    # 2 char — minimum valid
    ("B",       False),   # 1 char — di bawah minimum
    ("A" * 50,  True),    # 50 char — maksimum valid
    ("A" * 51,  False),   # 51 char — di atas maksimum
    ("   ",     False),   # whitespace only
    ("123",     True),    # angka valid
])
def test_update_name_parametrized(name, valid):
    svc = ProfileService()
    if valid:
        assert svc.update_name("u1", name.strip())["status"] == 200
    else:
        with pytest.raises(ValidationError):
            svc.update_name("u1", name)`,

    jsSuite: (cov) => `
  ${cov.happy ? `test('TC-01: update name succeeds', async () => {
    const result = await instance.updateName('user-123', 'Budi Santoso');
    expect(result.status).toBe(200);
  });

  test('TC-02: update valid email format', async () => {
    const result = await instance.updateEmail('user-123', 'budi@mail.co.id');
    expect(result.status).toBe(200);
  });` : ''}

  ${cov.boundary ? `test('TC-04: name with exactly 2 chars (min)', async () => {
    await expect(instance.updateName('user-123', 'Bu')).resolves.toMatchObject({ status: 200 });
  });

  test('TC-05: name with 1 char throws', async () => {
    await expect(instance.updateName('user-123', 'B')).rejects.toThrow('terlalu pendek');
  });` : ''}

  ${cov.security ? `test('TC-12: XSS in name is sanitized', async () => {
    await instance.updateName('user-123', '<script>alert(1)</script>');
    const profile = await instance.getProfile('user-123');
    expect(profile.name).not.toContain('<script>');
  });` : ''}`,

    javaSuite: (cov) => `
    ${cov.happy ? `@Test void updateNameValid() {
        var result = sut.updateName("user-123", "Budi Santoso");
        assertEquals(200, result.getStatus());
    }` : ''}

    ${cov.boundary ? `@ParameterizedTest
    @CsvSource({"Bu,true","B,false","AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA,false"})
    void nameLengthBoundary(String name, boolean valid) {
        if (valid) assertDoesNotThrow(() -> sut.updateName("u1", name));
        else assertThrows(ValidationException.class, () -> sut.updateName("u1", name));
    }` : ''}`,

    goSuite: (cov) => `${cov.happy ? `func TestUpdateNameValid(t *testing.T) {
    svc := NewProfileService()
    resp, err := svc.UpdateName("user-123", "Budi Santoso")
    require.NoError(t, err)
    assert.Equal(t, 200, resp.Status)
}` : ''}

${cov.boundary ? `func TestNameTooShort(t *testing.T) {
    svc := NewProfileService()
    _, err := svc.UpdateName("user-123", "B")
    assert.ErrorContains(t, err, "terlalu pendek")
}` : ''}`,

    gherkin: (cov) => `Feature: User Profile Management
  As a registered user
  I want to update my profile information
  So that my account data remains accurate

  Background:
    Given I am logged in as "user-123"
${cov.happy ? `
  @happy-path
  Scenario: Update name successfully
    When I update my name to "Budi Santoso"
    Then the response status should be 200

  Scenario: Update email with valid format
    When I update my email to "budi@mail.co.id"
    Then the response status should be 200

  Scenario: Upload valid JPEG photo under 2MB
    When I upload a 1MB JPEG photo
    Then the response should contain a photo URL` : ''}
${cov.boundary ? `
  @boundary
  Scenario Outline: Name length boundary validation
    When I update my name to "<name>"
    Then the result should be "<outcome>"
    Examples:
      | name       | outcome |
      | Bu         | success |
      | B          | error   |
      | A×50       | success |
      | A×51       | error   |

  Scenario: Photo exactly at 2MB limit
    When I upload a photo of exactly 2097152 bytes
    Then the upload should succeed

  Scenario: Photo 1 byte over 2MB limit
    When I upload a photo of 2097153 bytes
    Then I should see error "terlalu besar"` : ''}
${cov.negative ? `
  @negative
  Scenario: Email without @ symbol
    When I update my email to "budimail.co.id"
    Then I should see error "format email tidak valid"

  Scenario: Phone number too short
    When I update my phone to "08123"
    Then I should see error "format nomor tidak valid"` : ''}
${cov.security ? `
  @security
  Scenario: XSS attempt in name field
    When I update my name to "<script>alert('XSS')</script>"
    Then the stored name should not contain "<script>"

  Scenario: Concurrent profile updates trigger optimistic locking
    Given two sessions have the same version token "tok-v1"
    When both sessions submit profile updates simultaneously
    Then one session should succeed and the other should receive 409 Conflict` : ''}`
  }
};

/* ═══════════════════════════════════════════════════════════════
   7. GHERKIN SYNTAX HIGHLIGHTER
   Injects colored <span> tokens into the raw Gherkin string.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Applies lightweight Gherkin syntax highlighting.
 * @param {string} raw - plain Gherkin text
 * @returns {string} HTML string with <span class="g-*"> tokens
 */
function highlightGherkin(raw) {
  const escHtml = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return raw.split('\n').map(line => {
    const l = escHtml(line);
    if (/^\s*#/.test(line))      return `<span class="g-comment">${l}</span>`;
    if (/^\s*Feature:/.test(line)) return `<span class="g-feature">${l}</span>`;
    if (/^\s*(Scenario|Scenario Outline|Background|Examples):/.test(line))
      return `<span class="g-scenario">${l}</span>`;
    if (/^\s*@/.test(line))       return `<span class="g-keyword">${l}</span>`;
    return l.replace(/(^\s*)(Given|When|Then|And|But)(\s)/g,
      (_, ws, kw, sp) => `${ws}<span class="g-step">${kw}</span>${sp}`);
  }).join('\n');
}

/* ═══════════════════════════════════════════════════════════════
   8. SYNTAX HIGHLIGHTER — Python / JS / Java / Go (minimal)
   ═══════════════════════════════════════════════════════════════ */

/**
 * Applies colour tokens to generated code for display.
 * Very lightweight — no full parser, covers common patterns.
 * @param {string} code - raw source string
 * @param {string} framework
 * @returns {string} HTML with <span class="kw|fn|str|cm|nm|nu"> tokens
 */
function highlightCode(code, framework) {
  const e = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let src = e(code);

  // ── Comments (must run first to avoid double-processing)
  if (framework === 'jest' || framework === 'junit' || framework === 'go') {
    src = src.replace(/(\/\/.*$)/gm, '<span class="cm">$1</span>');
    src = src.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="cm">$1</span>');
  } else {
    src = src.replace(/(#.*$)/gm, '<span class="cm">$1</span>');
    src = src.replace(/("""[\s\S]*?""")/g, '<span class="str">$1</span>');
  }

  // ── Strings
  src = src.replace(/("(?:[^"\\]|\\.)*")/g, s =>
    s.includes('<span') ? s : `<span class="str">${s}</span>`);
  src = src.replace(/('(?:[^'\\]|\\.)*')/g, s =>
    s.includes('<span') ? s : `<span class="str">${s}</span>`);

  // ── Keywords (per language)
  const kwMap = {
    pytest:  /\b(import|from|class|def|return|assert|with|as|if|else|elif|for|in|not|and|or|True|False|None|raise|try|except|yield|lambda|pass|break|continue|self|super)\b/g,
    jest:    /\b(const|let|var|function|class|return|if|else|for|while|import|export|from|new|this|async|await|true|false|null|undefined|require|describe|test|expect|it|beforeEach|afterEach)\b/g,
    junit:   /\b(public|private|protected|static|final|void|class|interface|extends|implements|return|new|if|else|for|while|import|package|this|super|try|catch|throws|null|true|false|int|long|double|String|boolean|var)\b/g,
    go:      /\b(func|package|import|return|if|else|for|range|var|const|type|struct|interface|map|chan|go|defer|select|switch|case|break|continue|nil|true|false|error|string|int|int64|float64|bool)\b/g,
    gherkin: /\b(Feature|Scenario|Background|Given|When|Then|And|But|Examples|Scenario Outline|tags)\b/g
  };
  const kwRe = kwMap[framework] || kwMap.pytest;
  src = src.replace(kwRe, s => `<span class="kw">${s}</span>`);

  // ── Decorators / Annotations
  src = src.replace(/@(\w[\w.]*)/g, '<span class="nm">@$1</span>');

  // ── Numbers
  src = src.replace(/\b(\d+\.?\d*)\b/g, (m, p1, offset, str) => {
    const before = str.slice(0, offset);
    return (before.includes('<span') && !before.endsWith('>')) ? m
      : `<span class="nu">${p1}</span>`;
  });

  // ── Function/method definitions
  src = src.replace(/\b(def|func|function|void|test)\s+([a-zA-Z_]\w*)/g,
    (_, kw, name) => `<span class="kw">${kw}</span> <span class="fn">${name}</span>`);

  return src;
}

/* ═══════════════════════════════════════════════════════════════
   9. METRICS CALCULATOR
   ═══════════════════════════════════════════════════════════════ */

/**
 * Compute display metrics based on active options.
 * @param {object} coverage
 * @param {string} preset
 * @returns {{ total, coverage, edge, robust }}
 */
function calcMetrics(coverage, preset) {
  const rows  = buildMatrix(preset, coverage);
  const total = rows.length;

  // Weighted branch coverage estimate
  let branchBase = 0;
  if (coverage.happy)    branchBase += 55;
  if (coverage.boundary) branchBase += 25;
  if (coverage.negative) branchBase += 12;
  if (coverage.security) branchBase += 6;
  branchBase = Math.min(branchBase, 100);
  const covPct = (branchBase + (total / 14) * 3).toFixed(1);

  const edgeCount = rows.filter(r => r.cat === 'Boundary' || r.cat === 'Security').length;

  const score = total >= 12 && coverage.boundary && coverage.negative ? 'A+'
              : total >= 8  ? 'A'
              : total >= 5  ? 'B+'
              : 'B';

  return { total, coverage: covPct + '%', edge: edgeCount, robust: score };
}

/* ═══════════════════════════════════════════════════════════════
   10. DOM RENDER HELPERS
   ═══════════════════════════════════════════════════════════════ */

/** Render metrics ribbon with computed values */
function renderMetrics(preset, coverage) {
  const m = calcMetrics(coverage, preset);
  document.getElementById('metric-total').textContent    = m.total;
  document.getElementById('metric-coverage').textContent = m.coverage;
  document.getElementById('metric-edge').textContent     = m.edge;
  document.getElementById('metric-robust').textContent   = m.robust;
}

/** Render the code tab with highlighted output */
function renderCodeOutput(preset, framework, coverage, constraints) {
  const raw      = generateCode(preset, framework, coverage, constraints);
  const html     = highlightCode(raw, framework);
  const codeEl   = document.getElementById('code-content');
  codeEl.innerHTML = html;

  const P = PRESET_META[preset];
  const fname = PRESETS[preset].filename(framework);
  document.getElementById('suite-info').innerHTML =
    `Generated file: <span style="color:#4589ff">${fname}</span>`;

  // Store raw for copy/save
  codeEl.dataset.raw = raw;
}

/** Render test matrix table */
function renderMatrix(preset, coverage) {
  const rows = buildMatrix(preset, coverage);
  const catClass = { Happy:'cat-happy', Boundary:'cat-boundary', Negative:'cat-negative', Security:'cat-security' };
  const priBadge = { High:'badge-high', Medium:'badge-medium', Low:'badge-low' };

  document.getElementById('matrix-count').textContent = `${rows.length} test cases`;

  const tbody = document.getElementById('matrix-tbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-slate-500 py-8">Tidak ada test case untuk coverage yang dipilih.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td style="color:#4589ff;font-weight:600">${r.id}</td>
      <td><span class="cat-badge ${catClass[r.cat]||''}">${r.cat}</span></td>
      <td>${r.scenario}</td>
      <td style="color:#a7f3d0;max-width:160px">${r.input}</td>
      <td style="color:#f1f5f9;max-width:160px">${r.expected}</td>
      <td><span class="badge ${priBadge[r.priority]||'badge-medium'}">${r.priority}</span></td>
    </tr>`).join('');
}

/** Render edge cases grid */
function renderEdge(preset) {
  const cards = EDGE_CARDS[preset] || EDGE_CARDS.ecommerce;
  const colorBorder = {
    amber:'border-amber-500/30', blue:'border-blue-500/30',
    red:'border-red-500/30', purple:'border-purple-500/30',
    slate:'border-slate-600/50', ibm:'border-ibm/30'
  };
  const colorTitle = {
    amber:'text-amber-400', blue:'text-blue-400',
    red:'text-red-400', purple:'text-purple-400',
    slate:'text-slate-300', ibm:'text-ibm-light'
  };

  document.getElementById('edge-grid').innerHTML = cards.map(c => `
    <div class="edge-card" style="border-color:${c.color==='red'?'rgba(239,68,68,.3)':c.color==='amber'?'rgba(245,158,11,.3)':c.color==='ibm'?'rgba(15,98,254,.3)':c.color==='purple'?'rgba(168,85,247,.3)':'rgba(51,65,85,.4)'}">
      <div class="edge-card-icon">${c.icon}</div>
      <div class="edge-card-title" style="color:${c.color==='red'?'#f87171':c.color==='amber'?'#fbbf24':c.color==='ibm'?'#4589ff':c.color==='blue'?'#60a5fa':c.color==='purple'?'#c084fc':'#e2e8f0'}">${c.title}</div>
      <div class="edge-card-body">${c.body}</div>
      <code class="edge-card-code">${c.code}</code>
    </div>`).join('');
}

/** Render Gherkin tab with syntax highlighting */
function renderGherkin(preset, coverage, constraints) {
  const raw   = PRESET_META[preset].gherkin(coverage);
  const html  = highlightGherkin(raw);
  document.getElementById('gherkin-content').innerHTML = html;
}

/* ═══════════════════════════════════════════════════════════════
   11. LIVE TEST RUNNER SIMULATOR
   ═══════════════════════════════════════════════════════════════ */

/** Simulated test entries for the runner. Derived from matrix rows. */
/**
 * Build the ordered list of test steps for the runner simulator.
 * Each test gets a deterministic latency (seeded per-index so reruns
 * look natural but consistent) and a pass/fail flag.
 * Security tests have a 90% pass rate; all others always pass.
 */
function buildRunnerTests(preset, coverage) {
  return buildMatrix(preset, coverage).map((row, i) => ({
    id:      row.id,
    name:    row.scenario,
    cat:     row.cat,
    pass:    row.cat !== 'Security' || (i % 10 !== 0),   // deterministic: every 10th security fails
    latency: 8 + ((i * 37 + 13) % 80)                   // deterministic 8–88ms, no Math.random()
  }));
}

/**
 * Live Test Runner Simulator — Tab 5.
 *
 * Execution model:
 *   1. Print header + separator to terminal.
 *   2. Step through each test with a fixed 300ms interval so the
 *      progress bar animates smoothly from 0 → 100 %.
 *   3. Print each line as "  [PASSED]  TC-xx · scenario name   42ms"
 *      (or [FAILED] for failures, with an assertion detail line).
 *   4. Animate the progress bar and progress label on every step.
 *   5. Print final summary: X passed, Y failed, total duration, and
 *      hard-coded 98.4 % branch coverage to match the metrics ribbon.
 *   6. Animate the SVG branch-coverage gauge from 0 → 98.4 %.
 */
function runTestSimulator() {
  if (AppState.runnerActive) return;
  AppState.set({ runnerActive: true });

  const terminal  = document.getElementById('runner-terminal');
  const progBar   = document.getElementById('runner-progress-bar');
  const progLabel = document.getElementById('runner-progress-label');
  const gaugeArc  = document.getElementById('gauge-arc');
  const gaugeLbl  = document.getElementById('gauge-label');
  const runBtn    = document.getElementById('btn-run-tests');

  // ── Reset UI ──────────────────────────────────────────────
  runBtn.disabled = true;
  terminal.innerHTML = '';
  if (progBar)   progBar.style.width   = '0%';
  if (progLabel) progLabel.textContent = '0 / ?';
  if (gaugeArc)  gaugeArc.setAttribute('stroke-dasharray', '0, 100');
  if (gaugeLbl)  gaugeLbl.textContent  = '0%';

  const tests     = buildRunnerTests(AppState.preset, AppState.coverage);
  const total     = tests.length;
  const framework = AppState.framework;

  /** Map framework key → CLI command shown in the terminal header */
  const CLI_LABEL = {
    pytest:  'pytest --tb=short --cov=. --cov-report=term',
    jest:    'jest --verbose --coverage',
    junit:   'mvn test -Dtest="*Test" --no-transfer-progress',
    go:      'go test ./... -v -coverprofile=coverage.out',
    gherkin: 'cucumber-js --format progress-bar'
  };

  /** Timestamp for the run (displayed in header) */
  const runTs = new Date().toISOString();

  // ── Print header ──────────────────────────────────────────
  appendLog(terminal, 'info',  `$ ${CLI_LABEL[framework] || 'testcraft-runner --run all'}`);
  appendLog(terminal, 'muted', `TestCraft AI Engine v2.4.1  ·  ${runTs}`);
  appendLog(terminal, 'muted', `Collected ${total} test${total !== 1 ? 's' : ''}  ·  framework: ${framework}`);
  appendLog(terminal, 'muted', `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  let passed = 0, failed = 0, idx = 0;

  /**
   * Process one test per tick.
   * Interval is fixed at 300ms so the animation is smooth and
   * predictable regardless of the stored latency value.
   */
  const STEP_MS = 300;   // interval between each test line appearing

  function processNextTest() {
    if (idx >= total) {
      finishRun();
      return;
    }

    const t   = tests[idx];
    const pct = Math.round(((idx + 1) / total) * 100);

    // ── Render log line ──────────────────────────────────────
    if (t.pass) {
      passed++;
      appendLog(
        terminal, 'pass',
        `  <span class="runner-badge runner-pass">PASSED</span>  ${t.id} · ${truncate(t.name, 48)}`,
        `${t.latency}ms`
      );
    } else {
      failed++;
      appendLog(
        terminal, 'fail',
        `  <span class="runner-badge runner-fail">FAILED</span>  ${t.id} · ${truncate(t.name, 48)}`,
        `${t.latency}ms`
      );
      appendLog(terminal, 'warn',
        `         AssertionError: expected outcome not met  [${t.cat}]`);
    }

    // ── Animate progress bar ──────────────────────────────────
    if (progBar)   progBar.style.width   = pct + '%';
    if (progLabel) progLabel.textContent = `${idx + 1} / ${total}`;

    // ── Auto-scroll terminal ──────────────────────────────────
    terminal.scrollTop = terminal.scrollHeight;

    idx++;
    setTimeout(processNextTest, STEP_MS);
  }

  /**
   * Print the final summary block after all tests have run.
   * Always targets 98.4 % branch coverage to match the metrics ribbon.
   */
  function finishRun() {
    const totalDuration = tests.reduce((s, t) => s + t.latency, 0);
    const FINAL_COVERAGE = 98.4;   // fixed target per spec

    appendLog(terminal, 'muted', `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    if (failed === 0) {
      appendLog(terminal, 'pass',
        `  ✓  All ${passed} tests passed  —  ${totalDuration}ms total`);
    } else {
      appendLog(terminal, 'warn',
        `  ${passed} passed,  ${failed} failed  —  ${totalDuration}ms total`);
    }

    appendLog(terminal, 'info',  `  Branch coverage  :  ${FINAL_COVERAGE}%`);
    appendLog(terminal, 'info',  `  Statements        :  100.00%`);
    appendLog(terminal, 'info',  `  Functions         :  100.00%`);
    appendLog(terminal, 'muted', `  Report saved to   :  coverage/lcov-report/index.html`);
    appendLog(terminal, 'muted', `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    appendLog(terminal, passed === total ? 'pass' : 'warn', `  Done  ✓`);

    terminal.scrollTop = terminal.scrollHeight;

    // ── Animate SVG gauge from 0 → 98.4 % ────────────────────
    animateGauge(gaugeArc, gaugeLbl, FINAL_COVERAGE);

    // ── Re-enable button ──────────────────────────────────────
    runBtn.disabled = false;
    AppState.set({ runnerActive: false });
  }

  // Kick off the first step after a short header-reading pause
  setTimeout(processNextTest, 400);
}

/**
 * Smooth SVG arc animation: interpolates stroke-dasharray from 0 to target.
 * @param {SVGPathElement|null} arc  - the gauge path element
 * @param {HTMLElement|null}    lbl  - the centre label element
 * @param {number}              targetPct - final percentage (e.g. 98.4)
 */
function animateGauge(arc, lbl, targetPct) {
  if (!arc && !lbl) return;
  const FRAMES   = 40;
  const FRAME_MS = 20;   // 40 × 20ms = 800ms total animation
  let frame = 0;

  const timer = setInterval(() => {
    frame++;
    const current = (targetPct * frame) / FRAMES;
    if (arc) arc.setAttribute('stroke-dasharray', `${current.toFixed(1)}, 100`);
    if (lbl) lbl.textContent = current.toFixed(1) + '%';
    if (frame >= FRAMES) {
      clearInterval(timer);
      if (arc) arc.setAttribute('stroke-dasharray', `${targetPct}, 100`);
      if (lbl) lbl.textContent = targetPct + '%';
    }
  }, FRAME_MS);
}

/**
 * Append a styled log line to the terminal element.
 * Accepts pre-rendered HTML in the message for badge spans.
 */
function appendLog(container, type, message, time = '') {
  const line  = document.createElement('div');
  line.className = `log-line log-${type}`;
  line.innerHTML = time
    ? `<span class="log-time">${time}</span><span>${message}</span>`
    : `<span>${message}</span>`;
  container.appendChild(line);
}

/** Truncate a string to maxLen characters */
function truncate(str, maxLen) {
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

/* ═══════════════════════════════════════════════════════════════
   12. MAIN GENERATE ORCHESTRATOR
   ═══════════════════════════════════════════════════════════════ */

/**
 * Orchestrates the full generate cycle:
 * loading state → generate all outputs → update metrics → flip state.
 */
async function handleGenerate() {
  if (AppState.generating) return;

  const input       = document.getElementById('input-textarea').value.trim();
  const constraints = document.getElementById('context-input').value.trim();

  if (!input) {
    showToast('Masukkan source code atau pilih preset terlebih dahulu.', 'error');
    return;
  }

  // ── Enter generating state
  AppState.set({ generating: true });
  setGeneratingUI(true);
  document.getElementById('output-status').textContent = 'Synthesizing with IBM Bob Engine…';

  // Simulate async AI processing delay (400–900ms)
  await sleep(400 + Math.random() * 500);

  // ── Render all output panels
  renderCodeOutput(AppState.preset, AppState.framework, AppState.coverage, constraints);
  renderMatrix(AppState.preset, AppState.coverage);
  renderEdge(AppState.preset);
  renderGherkin(AppState.preset, AppState.coverage, constraints);
  renderMetrics(AppState.preset, AppState.coverage);

  // ── Finish
  AppState.set({ generating: false, hasOutput: true });
  setGeneratingUI(false);
  document.getElementById('output-status').innerHTML =
    `<span style="color:#34d399">✓ Generated</span> · ${new Date().toLocaleTimeString()}`;

  showToast('Test suite berhasil di-generate!', 'success');

  // Switch to Test Suite tab automatically
  switchOutputTab('suite');
}

/** Toggle generating spinner & button state */
function setGeneratingUI(on) {
  const btn   = document.getElementById('btn-generate');
  const label = document.getElementById('gen-label');
  const icon  = document.getElementById('gen-icon');

  if (on) {
    btn.classList.add('generating');
    btn.disabled = true;
    label.textContent = 'Synthesizing…';
    icon.innerHTML = '<circle cx="12" cy="12" r="10" stroke-width="2" stroke-dasharray="30 10" class="spinner" fill="none" stroke="currentColor"/>';
  } else {
    btn.classList.remove('generating');
    btn.disabled = false;
    label.textContent = 'Generate Test Suite';
    icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>';
  }
}

/* ═══════════════════════════════════════════════════════════════
   13. UTILITY FUNCTIONS
   ═══════════════════════════════════════════════════════════════ */

/** Resolve after `ms` milliseconds */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Show a transient floating toast notification in the bottom-right corner.
 *
 * The toast slides in via CSS animation (toast-in) and slides out via
 * toast-out before being hidden so the transition is always smooth.
 *
 * Icons are chosen to match the action context:
 *   success  → ✓   (copy, save, export)
 *   error    → ✗   (validation failures)
 *   info     → ℹ   (neutral messages)
 *   copy     → ⧉   (dedicated copy icon — pass type='copy')
 *   save     → ↓   (dedicated save icon — pass type='save')
 *   csv      → ⇩   (dedicated CSV export  — pass type='csv')
 *
 * @param {string} message
 * @param {'success'|'error'|'info'|'copy'|'save'|'csv'} type
 */
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');

  const META = {
    success: { icon: '✓', color: '#34d399', border: 'rgba(16,185,129,0.5)'  },
    error:   { icon: '✗', color: '#f87171', border: 'rgba(239,68,68,0.5)'   },
    info:    { icon: 'ℹ', color: '#60a5fa', border: 'rgba(96,165,250,0.4)'  },
    copy:    { icon: '⧉', color: '#a78bfa', border: 'rgba(167,139,250,0.5)' },
    save:    { icon: '↓', color: '#34d399', border: 'rgba(16,185,129,0.5)'  },
    csv:     { icon: '⇩', color: '#fbbf24', border: 'rgba(251,191,36,0.5)'  }
  };
  const m = META[type] || META.info;

  // Cancel any in-flight hide timer
  clearTimeout(toast._hideTimer);

  // Remove previous animation class so it can retrigger
  toast.classList.remove('toast-hiding');
  toast.classList.remove('hidden');

  // Set content and colour
  toast.style.borderColor = m.border;
  toast.className = `toast ${type}`;   // resets animation via class change
  toast.innerHTML =
    `<span style="font-size:15px;color:${m.color};line-height:1">${m.icon}</span>` +
    `<span>${message}</span>`;

  // Auto-hide after 3 s with a slide-out animation
  toast._hideTimer = setTimeout(() => {
    toast.classList.add('toast-hiding');
    // Remove from view after the CSS transition completes (300ms)
    toast._removeTimer = setTimeout(() => toast.classList.add('hidden'), 300);
  }, 3000);
}

/** Copy text to clipboard */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Kode berhasil disalin ke clipboard!', 'success');
  } catch {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Kode berhasil disalin!', 'success');
  }
}

/** Download text as a file */
function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href:url, download:filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`File "${filename}" berhasil disimpan.`, 'success');
}

/**
 * Export test matrix to CSV.
 *
 * Filename follows the spec: test_matrix_{preset}.csv
 * (e.g. test_matrix_ecommerce.csv).
 * All text fields are double-quoted and internal quotes are escaped
 * so the file opens cleanly in Excel / Google Sheets.
 *
 * @param {string} preset
 * @param {object} coverage
 */
function exportMatrixCSV(preset, coverage) {
  /** Wrap a value in double-quotes, escaping any internal double-quotes */
  const csvCell = val => `"${String(val).replace(/"/g, '""')}"`;

  const rows   = buildMatrix(preset, coverage);
  const header = ['ID', 'Kategori', 'Skenario', 'Data Input', 'Expected Output', 'Prioritas'];

  const csvRows = [
    header.map(csvCell).join(','),
    ...rows.map(r => [
      csvCell(r.id),
      csvCell(r.cat),
      csvCell(r.scenario),
      csvCell(r.input),
      csvCell(r.expected),
      csvCell(r.priority)
    ].join(','))
  ];

  // Spec-mandated filename: test_matrix_{preset}.csv
  const fname = `test_matrix_${preset}.csv`;
  downloadFile(fname, csvRows.join('\r\n'));
}

/* ═══════════════════════════════════════════════════════════════
   14. TAB SWITCHING
   ═══════════════════════════════════════════════════════════════ */

/** Switch active output tab */
function switchOutputTab(tabKey) {
  document.querySelectorAll('.output-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabKey);
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `tab-${tabKey}`);
    pane.classList.toggle('hidden',  pane.id !== `tab-${tabKey}`);
  });
}

/* ═══════════════════════════════════════════════════════════════
   15. EVENT WIRING — runs once on DOMContentLoaded
   ═══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  // ── 15a. Input Type Tabs ──────────────────────────────────
  const hintMap = {
    code:  'Mode: Source Code — paste fungsi/kelas yang ingin diuji',
    story: 'Mode: User Story / Agile — paste acceptance criteria',
    api:   'Mode: JSON/API Schema — paste OpenAPI spec atau JSON schema'
  };

  document.querySelectorAll('.input-type-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.input-type-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      AppState.set({ inputType: btn.dataset.type });
      document.getElementById('input-type-hint').textContent = hintMap[btn.dataset.type];
    });
  });

  // ── 15b. Preset Load ──────────────────────────────────────
  document.getElementById('btn-load-preset').addEventListener('click', () => {
    const key     = document.getElementById('preset-select').value;
    const preset  = PRESETS[key];
    if (!preset) { showToast('Pilih preset terlebih dahulu.', 'error'); return; }

    document.getElementById('input-textarea').value = preset.source;
    AppState.set({ preset: key });

    // Sync input type tab
    document.querySelectorAll('.input-type-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === preset.inputType);
    });
    AppState.set({ inputType: preset.inputType });
    document.getElementById('input-type-hint').textContent = hintMap[preset.inputType];

    showToast(`Preset "${preset.label}" berhasil dimuat.`, 'success');
  });

  // ── 15c. Framework Radio Buttons ──────────────────────────
  document.querySelectorAll('.framework-radio').forEach(label => {
    label.addEventListener('click', () => {
      document.querySelectorAll('.framework-radio').forEach(l => l.classList.remove('active'));
      label.classList.add('active');
      const val = label.querySelector('input[type="radio"]').value;
      AppState.set({ framework: val });
    });
  });

  // ── 15d. Coverage Checkboxes ──────────────────────────────
  document.querySelectorAll('#coverage-list input[type="checkbox"]').forEach(chk => {
    // Sync visual state on first render
    syncCheckBox(chk);
    chk.addEventListener('change', () => {
      AppState.coverage[chk.value] = chk.checked;
      syncCheckBox(chk);
    });
  });

  function syncCheckBox(chk) {
    chk.checked = AppState.coverage[chk.value] ?? false;
  }

  // ── 15e. Generate Button ──────────────────────────────────
  document.getElementById('btn-generate').addEventListener('click', handleGenerate);

  // Keyboard shortcut: Ctrl+Enter
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleGenerate();
    }
  });

  // ── 15f. Output Tabs ──────────────────────────────────────
  document.querySelectorAll('.output-tab').forEach(btn => {
    btn.addEventListener('click', () => switchOutputTab(btn.dataset.tab));
  });

  // ── 15g. Copy button — uses 'copy' toast type (purple ⧉ icon) ────
  document.getElementById('btn-copy').addEventListener('click', async () => {
    const raw = document.getElementById('code-content').dataset.raw || '';
    if (!raw) { showToast('Generate test suite terlebih dahulu.', 'error'); return; }
    try {
      await navigator.clipboard.writeText(raw);
    } catch {
      // Fallback for non-HTTPS or older browsers
      const ta = document.createElement('textarea');
      ta.value = raw;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    showToast('Kode berhasil disalin ke clipboard!', 'copy');
  });

  // ── 15g-ii. Save button — uses 'save' toast type (green ↓ icon) ──
  document.getElementById('btn-save').addEventListener('click', () => {
    const raw = document.getElementById('code-content').dataset.raw || '';
    if (!raw) { showToast('Generate test suite terlebih dahulu.', 'error'); return; }
    const fname = PRESETS[AppState.preset]?.filename(AppState.framework) || 'test_suite.py';
    const blob  = new Blob([raw], { type: 'text/plain;charset=utf-8' });
    const url   = URL.createObjectURL(blob);
    const a     = Object.assign(document.createElement('a'), { href: url, download: fname });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`File "${fname}" berhasil disimpan.`, 'save');
  });

  // ── 15h. Export CSV — uses 'csv' toast type (amber ⇩ icon) ───────
  document.getElementById('btn-export-csv').addEventListener('click', () => {
    if (!AppState.hasOutput) { showToast('Generate test suite terlebih dahulu.', 'error'); return; }
    const csvCell = val => `"${String(val).replace(/"/g, '""')}"`;
    const rows    = buildMatrix(AppState.preset, AppState.coverage);
    const header  = ['ID', 'Kategori', 'Skenario', 'Data Input', 'Expected Output', 'Prioritas'];
    const csvRows = [
      header.map(csvCell).join(','),
      ...rows.map(r => [csvCell(r.id), csvCell(r.cat), csvCell(r.scenario),
                        csvCell(r.input), csvCell(r.expected), csvCell(r.priority)].join(','))
    ];
    const fname = `test_matrix_${AppState.preset}.csv`;
    const blob  = new Blob([csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url   = URL.createObjectURL(blob);
    const a     = Object.assign(document.createElement('a'), { href: url, download: fname });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`CSV "${fname}" berhasil diekspor!`, 'csv');
  });

  // ── 15i. Live Runner buttons ──────────────────────────────
  document.getElementById('btn-run-tests').addEventListener('click', () => {
    if (!AppState.hasOutput) {
      showToast('Generate test suite terlebih dahulu, lalu jalankan runner.', 'error');
      return;
    }
    runTestSimulator();
  });

  document.getElementById('btn-clear-runner').addEventListener('click', () => {
    const terminal = document.getElementById('runner-terminal');
    terminal.innerHTML = '<div class="text-slate-500">$ testcraft-ai --run all --verbose<br/>Log cleared. Press "Run All Tests" to start...</div>';
    document.getElementById('runner-progress-bar').style.width = '0%';
    document.getElementById('runner-progress-label').textContent = '0 / 14';
    const arc = document.getElementById('gauge-arc');
    if (arc) arc.setAttribute('stroke-dasharray', '0, 100');
    document.getElementById('gauge-label').textContent = '0%';
  });

  // ── 15j. Architecture Modal ───────────────────────────────
  const modal       = document.getElementById('arch-modal');
  const openModal   = () => modal.classList.remove('hidden');
  const closeModal  = () => modal.classList.add('hidden');

  document.getElementById('btn-arch-modal').addEventListener('click', openModal);
  document.getElementById('btn-close-modal').addEventListener('click', closeModal);
  document.getElementById('btn-close-modal-2').addEventListener('click', closeModal);

  modal.addEventListener('click', e => {
    if (e.target === modal) closeModal();
  });

  // ESC key closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // ── 15k. Initial state: load ecommerce preset ─────────────
  document.getElementById('preset-select').value = 'ecommerce';
  const defaultPreset = PRESETS.ecommerce;
  document.getElementById('input-textarea').value = defaultPreset.source;
  document.getElementById('input-type-hint').textContent = hintMap.code;

  // Sync checkboxes from initial AppState
  document.querySelectorAll('#coverage-list input[type="checkbox"]').forEach(chk => {
    chk.checked = AppState.coverage[chk.value] ?? false;
  });

  // ── Done
  console.info(
    '%cTestCraft AI initialized · IBM Bob Engine: Active',
    'color:#4589ff;font-weight:bold;font-family:monospace'
  );
});
