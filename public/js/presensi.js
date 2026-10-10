(function () {
  'use strict';
  if (!window.App || window.App.VERSI !== '2026.10.10-4') {
    const v = window.App && window.App.VERSI;
    if (window.App && window.App.peringatanVersi) window.App.peringatanVersi('presensi.js 2026.10.10-4 ≠ shared.js ' + v);
    else document.addEventListener('DOMContentLoaded', () => { document.body.insertAdjacentHTML('afterbegin', '<div style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#b4161c;color:#fff;padding:12px;text-align:center;font:600 14px system-ui">File situs tidak sinkron (shared.js lama). Unggah ulang seluruh folder public.</div>'); });
    if (!window.App || !window.App.VERSI) return;
  }
  const { api, CFG, SATKER, DEMO, validasiNama, pesanError, kodeError, PESAN, rapikanNama, getDeviceId, sidikPerangkat, sidikHardware, waktu, isiQR, unduhBlob, toast } = window.App;
  const $ = (id) => document.getElementById(id);
  let DEVICE = null;
  let TIKET = null;

  // ---------- teks dari konfigurasi ----------
  const acara = CFG.NAMA_ACARA || 'Presensi Kegiatan';
  const org = CFG.PENYELENGGARA || 'BPS Provinsi Sulawesi Utara';
  const parts = acara.split(' ');
  $('judul').innerHTML = parts.length > 1
    ? `${window.App.esc(parts.slice(0, -1).join(' '))} <span>${window.App.esc(parts.at(-1))}</span>`
    : `<span>${window.App.esc(acara)}</span>`;
  $('penyelenggara').textContent = org;
  $('tAcara').textContent = acara;
  $('tOrg').textContent = org;
  $('th').textContent = new Date().getFullYear();
  document.title = `${acara} — ${org}`;
  $('demoBanner').hidden = !DEMO;

  const sel = $('satker');
  SATKER.forEach((s) => { const o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o); });

  function tampil(view) {
    ['viewForm', 'viewTiket', 'viewTunggu', 'viewLoading'].forEach((v) => { $(v).hidden = v !== view; });
  }

  // ---------- validasi ----------
  function setErr(field, errId, msg) {
    $(field).classList.toggle('invalid', !!msg);
    $(errId).textContent = msg || '';
  }
  function cekNama(tampilkan) {
    const k = validasiNama($('nama').value);
    if (tampilkan) setErr('fNama', 'eNama', k ? PESAN[k] : '');
    return !k;
  }
  function kategoriTerpilih() { const r = document.querySelector('input[name="kategori"]:checked'); return r ? r.value : ''; }

  $('nama').addEventListener('blur', () => { if ($('nama').value.trim()) cekNama(true); });
  $('nama').addEventListener('input', () => { if ($('fNama').classList.contains('invalid')) cekNama(true); });
  document.querySelectorAll('input[name="kategori"]').forEach((r) => r.addEventListener('change', () => { setErr('fKategori', 'eKategori', ''); aturKategori(); }));

  // ---------- Pegawai: pilih dari daftar ----------
  let PEGAWAI = null;        // [{nama, satker}]
  let PEGAWAI_GAGAL = false;
  let PILIH = null;          // pegawai terpilih
  let aktif = -1;            // indeks saran yang disorot
  let HASIL_CARI = [];
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['\u2019`]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

  async function muatPegawai() {
    if (PEGAWAI) return PEGAWAI;
    try {
      const rows = await api.daftarPegawai();
      PEGAWAI = rows.map((r) => {
        const inti = r.nama.split(',')[0];                // nama tanpa gelar belakang
        return { nama: r.nama, satker: r.satker, n: norm(inti), nAll: norm(r.nama + ' ' + r.satker) };
      });
      PEGAWAI_GAGAL = false;
    } catch (err) { PEGAWAI_GAGAL = true; PEGAWAI = null; }
    return PEGAWAI;
  }

  function aturKategori() {
    const kat = kategoriTerpilih();
    $('pilihDulu').hidden = !!kat;
    $('fPegawai').hidden = kat !== 'Pegawai';
    $('grupUmum').hidden = !kat || kat === 'Pegawai';
    if (kat === 'Pegawai') { muatPegawai(); if (!PILIH) setTimeout(() => $('cariPegawai').focus(), 50); }
  }

  function sorot(teks, q) {
    const esc = window.App.esc;
    if (!q) return esc(teks);
    let out = esc(teks);
    q.split(' ').filter((x) => x.length > 1).forEach((k) => {
      const re = new RegExp('(' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
      out = out.replace(re, '<mark>$1</mark>');
    });
    return out;
  }

  async function cari() {
    const qRaw = $('cariPegawai').value;
    const q = norm(qRaw);
    const ul = $('saranPegawai');
    setErr('fPegawai', 'ePegawai', '');
    if (q.length < 2) { ul.hidden = true; $('cariPegawai').setAttribute('aria-expanded', 'false'); return; }
    const data = await muatPegawai();
    if (!data) { ul.innerHTML = '<li class="kosong">Daftar pegawai gagal dimuat. Periksa internet lalu coba lagi.</li>'; ul.hidden = false; return; }
    if (norm($('cariPegawai').value) !== q) return;      // input sudah berubah
    const kata = q.split(' ');
    HASIL_CARI = data.filter((p) => kata.every((k) => p.nAll.includes(k)))
      .map((p) => ({ p, skor: (p.n.startsWith(q) ? 0 : p.n.split(' ').some((w) => w.startsWith(kata[0])) ? 1 : 2) }))
      .sort((a, b) => a.skor - b.skor || a.p.nama.localeCompare(b.p.nama, 'id'))
      .slice(0, 8).map((x) => x.p);
    aktif = HASIL_CARI.length ? 0 : -1;
    ul.innerHTML = HASIL_CARI.length
      ? HASIL_CARI.map((p, i) => `<li role="option" id="opsi${i}" data-i="${i}" aria-selected="${i === aktif}"><b>${sorot(p.nama, q)}</b><span>BPS ${window.App.esc(p.satker)}</span></li>`).join('')
      : '<li class="kosong">Nama tidak ditemukan. Coba ketik nama depan saja, atau hubungi panitia.</li>';
    ul.hidden = false;
    $('cariPegawai').setAttribute('aria-expanded', 'true');
    $('cariPegawai').setAttribute('aria-activedescendant', aktif >= 0 ? 'opsi' + aktif : '');
  }
  function geserSorot(d) {
    if (!HASIL_CARI.length) return;
    aktif = (aktif + d + HASIL_CARI.length) % HASIL_CARI.length;
    $('saranPegawai').querySelectorAll('li[role="option"]').forEach((li, i) => li.setAttribute('aria-selected', String(i === aktif)));
    const el = $('opsi' + aktif); if (el) el.scrollIntoView({ block: 'nearest' });
    $('cariPegawai').setAttribute('aria-activedescendant', 'opsi' + aktif);
  }
  function pilihPegawai(p) {
    PILIH = p;
    $('pNama').textContent = p.nama;
    $('pSatker').textContent = 'BPS ' + p.satker;
    $('comboPegawai').hidden = true; $('saranPegawai').hidden = true;
    $('pilihPegawai').hidden = false; $('pegawaiInfo').hidden = true;
    setErr('fPegawai', 'ePegawai', '');
  }
  function gantiPegawai() {
    PILIH = null;
    $('pilihPegawai').hidden = true; $('comboPegawai').hidden = false; $('pegawaiInfo').hidden = false;
    $('cariPegawai').value = ''; $('cariPegawai').focus();
  }
  let tCari = null;
  $('cariPegawai').addEventListener('input', () => { clearTimeout(tCari); tCari = setTimeout(cari, 120); });
  $('cariPegawai').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); geserSorot(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); geserSorot(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (aktif >= 0 && HASIL_CARI[aktif] && !$('saranPegawai').hidden) pilihPegawai(HASIL_CARI[aktif]); }
    else if (e.key === 'Escape') { $('saranPegawai').hidden = true; }
  });
  $('saranPegawai').addEventListener('mousedown', (e) => {
    const li = e.target.closest('li[data-i]'); if (!li) return;
    e.preventDefault(); pilihPegawai(HASIL_CARI[Number(li.dataset.i)]);
  });
  $('cariPegawai').addEventListener('blur', () => setTimeout(() => { $('saranPegawai').hidden = true; $('cariPegawai').setAttribute('aria-expanded', 'false'); }, 150));
  $('cariPegawai').addEventListener('focus', () => { if (norm($('cariPegawai').value).length >= 2) cari(); });
  $('gantiPegawai').addEventListener('click', gantiPegawai);
  sel.addEventListener('change', () => setErr('fSatker', 'eSatker', ''));

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('formAlert').hidden = true;
    const kat = kategoriTerpilih();
    setErr('fKategori', 'eKategori', kat ? '' : PESAN.KATEGORI_KOSONG);
    if (!kat) { $('fKategori').scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    let namaKirim, sat, namaTampil;
    if (kat === 'Pegawai') {
      if (!PILIH) { setErr('fPegawai', 'ePegawai', PESAN.PEGAWAI_BELUM_DIPILIH); $('cariPegawai').focus(); return; }
      namaKirim = PILIH.nama; sat = PILIH.satker; namaTampil = PILIH.nama;
    } else {
      const okNama = cekNama(true);
      sat = sel.value;
      setErr('fSatker', 'eSatker', sat ? '' : PESAN.SATKER_KOSONG);
      if (!okNama) { $('nama').focus(); return; }
      if (!sat) return;
      namaKirim = $('nama').value; namaTampil = rapikanNama(namaKirim);
    }
    if (!confirm(`Pastikan data sudah benar:\n\nNama: ${namaTampil}\nKategori: ${kat}\nSatker: ${sat}\n\nPresensi tidak dapat diubah setelah dikirim.`)) return;

    const btn = $('kirim');
    btn.disabled = true;
    const isi = btn.innerHTML;
    btn.innerHTML = '<span class="spin"></span><span>Mengirim…</span>';
    try {
      const [fp, hw] = await Promise.all([sidikPerangkat(), sidikHardware()]);
      const t = await api.daftar({ nama: namaKirim, kategori: kat, satker: sat, device: DEVICE, fingerprint: fp, sidikHw: hw });
      if (t && t.status === 'menunggu') { renderTunggu(t); return; }
      TIKET = t;
      renderTiket(t);
      toast('Presensi berhasil dicatat.', 'ok');
    } catch (err) {
      const k = kodeError(err);
      if (k === 'PERANGKAT_SUDAH_ABSEN') {
        const t = await api.statusPerangkat(DEVICE).catch(() => null);
        if (t && t.status === 'ok') { TIKET = t; renderTiket(t); toast(PESAN.PERANGKAT_SUDAH_ABSEN, 'warn'); return; }
      }
      if (k === 'PERMINTAAN_DITOLAK') { renderTunggu({ status: 'ditolak' }); return; }
      if (kat === 'Pegawai' && (k === 'NAMA_SUDAH_TERDAFTAR' || k === 'PEGAWAI_TIDAK_DIKENAL')) {
        setErr('fPegawai', 'ePegawai', PESAN[k]);
      } else if (k === 'NAMA_SUDAH_TERDAFTAR' || k === 'NAMA_TIDAK_LENGKAP' || k === 'NAMA_TIDAK_VALID') {
        setErr('fNama', 'eNama', PESAN[k]); $('nama').focus();
      } else {
        $('formAlert').textContent = pesanError(err);
        $('formAlert').hidden = false;
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = isi;
    }
  });

  // ---------- Menunggu izin panitia ----------
  let pollTunggu = null;
  function renderTunggu(t) {
    clearInterval(pollTunggu);
    const ditolak = t.status === 'ditolak';
    $('viewTunggu').classList.toggle('ditolak', ditolak);
    $('wJudul').textContent = ditolak ? 'Permintaan ditolak' : 'Perlu konfirmasi panitia';
    $('wTeks').textContent = ditolak
      ? 'Panitia menolak presensi dari perangkat ini karena perangkat ini sudah dipakai presensi. Jika menurut Anda ini keliru, temui panitia.'
      : 'Perangkat ini terdeteksi sama dengan perangkat yang sudah dipakai presensi. Jika Anda belum presensi, tunjukkan layar ini ke panitia. Tiket akan muncul otomatis setelah disetujui.';
    $('wNo').textContent = t.permintaan_id ? '#' + t.permintaan_id : '';
    $('wNoWrap').hidden = !t.permintaan_id || ditolak;
    $('wNama').textContent = t.nama || '';
    $('wSatker').textContent = t.satker ? 'BPS ' + t.satker : '';
    $('wKategori').textContent = t.kategori || '';
    $('wData').hidden = !t.nama;
    $('wCek').hidden = ditolak;
    tampil('viewTunggu');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (!ditolak) pollTunggu = setInterval(cekTunggu, 5000);
  }
  async function cekTunggu() {
    try {
      const t = await api.statusPerangkat(DEVICE);
      if (t && t.status === 'ok') { clearInterval(pollTunggu); TIKET = t; renderTiket(t); toast('Disetujui panitia. Presensi tercatat.', 'ok'); }
      else if (t && t.status === 'ditolak') renderTunggu(t);
    } catch (e) { /* coba lagi di putaran berikutnya */ }
  }
  $('wCek').addEventListener('click', cekTunggu);

  // ---------- QR ----------
  function buatQR(teks) {
    const q = window.qrcode(0, 'M');
    q.addData(teks, 'Byte');
    q.make();
    return q;
  }
  function qrSvg(q) {
    const n = q.getModuleCount();
    const pad = 2;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + pad} ${r + pad}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + pad * 2} ${n + pad * 2}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#061a33"/></svg>`;
  }

  function renderTiket(t) {
    $('qr').innerHTML = qrSvg(buatQR(isiQR(t)));
    $('tNama').textContent = t.nama;
    $('tSatker').textContent = 'BPS ' + t.satker;
    $('tKategori').textContent = t.kategori;
    $('tKode').innerHTML = String(t.kode).split('').map((d) => `<span>${d}</span>`).join('');
    $('tKode').setAttribute('aria-label', 'Kode undian ' + t.kode.split('').join(' '));
    $('tWaktu').textContent = 'Tercatat ' + waktu(t.created_at);
    tampil('viewTiket');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- Unduh tiket sebagai PNG ----------
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function wrap(ctx, text, maxW) {
    const words = text.split(' '); const lines = []; let cur = '';
    words.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur);
    return lines;
  }
  async function unduhTiket() {
    const t = TIKET; if (!t) return;
    try { await document.fonts.ready; } catch (e) { /* abaikan */ }
    const F = "'Plus Jakarta Sans', system-ui, sans-serif";
    const M = "'JetBrains Mono', ui-monospace, monospace";
    const W = 1000, H = 1380;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0b2d57'); g.addColorStop(1, '#061a33');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    for (let y = 20; y < H; y += 30) for (let x = 20; x < W; x += 30) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill(); }

    const X = 60, Y = 60, CW = W - 120, CH = H - 120;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16;
    rr(ctx, X, Y, CW, CH, 36); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();

    // kepala
    ctx.save(); rr(ctx, X, Y, CW, CH, 36); ctx.clip();
    const hg = ctx.createLinearGradient(X, Y, X + CW, Y + 230); hg.addColorStop(0, '#12407a'); hg.addColorStop(1, '#061a33');
    ctx.fillStyle = hg; ctx.fillRect(X, Y, CW, 230); ctx.restore();
    ['#2a7de1', '#2ead4a', '#f7931e'].forEach((c, i) => { rr(ctx, X + 50 + i * 38, Y + 52, 30, 10, 5); ctx.fillStyle = c; ctx.fill(); });
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = `600 26px ${F}`; ctx.textBaseline = 'alphabetic';
    ctx.fillText(org, X + 50, Y + 110);
    ctx.fillStyle = '#fff'; ctx.font = `800 46px ${F}`;
    ctx.fillText(acara, X + 50, Y + 170, CW - 100);

    // perforasi
    ctx.fillStyle = '#061a33';
    [X, X + CW].forEach((cx) => { ctx.beginPath(); ctx.arc(cx, Y + 230, 26, 0, 7); ctx.fill(); });
    ctx.strokeStyle = '#d6dde8'; ctx.setLineDash([14, 12]); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(X + 44, Y + 230); ctx.lineTo(X + CW - 44, Y + 230); ctx.stroke(); ctx.setLineDash([]);

    // QR
    const q = buatQR(isiQR(t)); const n = q.getModuleCount();
    const qs = 440; const cell = Math.floor(qs / (n + 4)); const real = cell * (n + 4);
    const qx = Math.round((W - real) / 2), qy = Y + 290;
    rr(ctx, qx - 14, qy - 14, real + 28, real + 28, 22); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#061a33';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect(qx + (c + 2) * cell, qy + (r + 2) * cell, cell, cell);

    // nama
    ctx.textAlign = 'center'; ctx.fillStyle = '#0d1b2e'; ctx.font = `800 50px ${F}`;
    let ny = qy + real + 100;
    const lines = wrap(ctx, t.nama, CW - 120).slice(0, 2);
    lines.forEach((l, i) => ctx.fillText(l, W / 2, ny + i * 60));
    ny += (lines.length - 1) * 60;

    // chip satker & kategori
    ctx.font = `700 26px ${F}`;
    const c1 = 'BPS ' + t.satker, c2 = t.kategori;
    const w1 = ctx.measureText(c1).width + 44, w2 = ctx.measureText(c2).width + 44, gap = 14;
    let cx0 = W / 2 - (w1 + w2 + gap) / 2; const cy = ny + 36;
    [[c1, w1, '#e8f1fd', '#1450a0'], [c2, w2, '#e6f7ea', '#1b7a33']].forEach(([txt, w, bg, fg]) => {
      rr(ctx, cx0, cy, w, 52, 26); ctx.fillStyle = bg; ctx.fill();
      ctx.fillStyle = fg; ctx.fillText(txt, cx0 + w / 2, cy + 35); cx0 += w + gap;
    });

    // kode
    const ky = cy + 130;
    ctx.fillStyle = '#7a879a'; ctx.font = `800 22px ${F}`;
    ctx.fillText('K O D E   U N D I A N', W / 2, ky);
    const dw = 92, dh = 116, dg = 12, extra = 18;
    const tot = dw * 6 + dg * 5 + extra; let dx = (W - tot) / 2; const dy = ky + 26;
    ctx.font = `800 64px ${M}`;
    t.kode.split('').forEach((d, i) => {
      rr(ctx, dx, dy, dw, dh, 18); ctx.fillStyle = '#0b2d57'; ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(dx + 8, dy + dh - 6, dw - 16, 4);
      ctx.fillStyle = '#fff'; ctx.fillText(d, dx + dw / 2, dy + 82);
      dx += dw + dg + (i === 2 ? extra : 0);
    });

    ctx.fillStyle = '#7a879a'; ctx.font = `500 24px ${F}`;
    ctx.fillText('Tercatat ' + waktu(t.created_at), W / 2, Y + CH - 46);

    cv.toBlob((b) => {
      const slug = t.nama.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      unduhBlob(b, `presensi-${t.kode}-${slug}.png`);
      toast('Barcode diunduh.', 'ok');
    }, 'image/png');
  }
  $('unduh').addEventListener('click', unduhTiket);

  // ---------- mulai ----------
  (async function init() {
    try {
      DEVICE = await getDeviceId();
      const t = await api.statusPerangkat(DEVICE);
      if (t && t.status === 'ok') { TIKET = t; renderTiket(t); return; }
      if (t && (t.status === 'menunggu' || t.status === 'ditolak')) { renderTunggu(t); return; }
    } catch (err) {
      console.error(err);
      if (kodeError(err) === 'JARINGAN') toast(PESAN.JARINGAN, 'err');
    }
    tampil('viewForm');
  })();
})();