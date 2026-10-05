/* 旅平險三方案報價 — 共用函式（計算、格式化、分享連結編解碼、方案卡片渲染）
 * 純前端、無需建置。index.html 與 editor.html 共用。
 */
(function (global) {
  'use strict';

  var LIFE_PRODUCT = '富邦人壽 Go安行旅平險';
  var PROPERTY_PRODUCT = '富邦產險 新快樂旅綜+';
  // 人壽 OH1 各項比例（Go安行 DM）：住院 100%、門診每日 3%、急診每日 6%（再乘以地區調整比例）
  var LIFE_OH1_RATIO = { hospital: 1, outpatient: 0.03, er: 0.06 };
  // 產險 新快樂旅綜+：門診 = 住院保額 2%、急診 = 5%
  var PROP_RATIO = { outpatient: 0.02, er: 0.05 };
  var REGION_OPTIONS = [
    { pct: 100, label: '其他地區（100%）' },
    { pct: 200, label: '日本、歐洲、紐澳、南韓（200%）' },
    { pct: 350, label: '美國、加拿大（350%）' }
  ];
  var REGION_200 = ['日本', '韓國', '南韓', '歐洲', '申根', '紐西蘭', '澳洲', '紐澳', '英國', '法國', '德國', '義大利', '西班牙', '瑞士', '奧地利', '荷蘭', '比利時', '捷克', '希臘', '葡萄牙', '冰島', '挪威', '瑞典', '芬蘭', '丹麥', '克羅埃西亞', '匈牙利', '波蘭'];
  var REGION_350 = ['美國', '加拿大', '美加', '夏威夷', '關島', '阿拉斯加'];

  function num(v) {
    if (v === null || v === undefined || v === '') return 0;
    var n = Number(String(v).replace(/,/g, ''));
    return isFinite(n) ? n : 0;
  }
  function isSet(v) { return v !== null && v !== undefined && v !== ''; }
  function comma(n) { return Math.round(n).toLocaleString('en-US'); }

  /** 金額格式：≥10萬且整萬 → 「X萬」，其餘 → 「X,XXX元」 */
  function fmtYuan(y) {
    y = Math.round(num(y));
    if (y >= 100000 && y % 10000 === 0) return comma(y / 10000) + '萬';
    return comma(y) + '元';
  }
  /** 括號內簡式（不帶「元」） */
  function fmtShort(y) {
    y = Math.round(num(y));
    if (y >= 100000 && y % 10000 === 0) return comma(y / 10000) + '萬';
    return comma(y);
  }

  function guessRegionPct(dest) {
    dest = String(dest || '');
    for (var i = 0; i < REGION_350.length; i++) if (dest.indexOf(REGION_350[i]) >= 0) return 350;
    for (var j = 0; j < REGION_200.length; j++) if (dest.indexOf(REGION_200[j]) >= 0) return 200;
    return 100;
  }

  /** 計算單一方案所有顯示用數值（單位：元） */
  function computePlan(plan, quote) {
    var life = plan.life || {};
    var prop = plan.property || {};
    var region = num(quote.lifeRegionPct || 100) / 100;
    var L = { enabled: !!life.enabled };
    if (L.enabled) {
      L.at1 = num(life.at1Wan) * 10000;
      L.oh1 = (isSet(life.oh1Wan) ? num(life.oh1Wan) : num(life.at1Wan) * 0.1) * 10000;
      L.mr = (isSet(life.mrWan) ? num(life.mrWan) : num(life.at1Wan) * 0.1) * 10000;
      L.hospital = isSet(life.hospitalYuan) ? num(life.hospitalYuan) : L.oh1 * LIFE_OH1_RATIO.hospital * region;
      L.outpatient = isSet(life.outpatientYuan) ? num(life.outpatientYuan) : L.oh1 * LIFE_OH1_RATIO.outpatient * region;
      L.er = isSet(life.erYuan) ? num(life.erYuan) : L.oh1 * LIFE_OH1_RATIO.er * region;
      L.oaa = !!life.oaa;
      L.premium = num(life.premium);
    } else {
      L.at1 = L.oh1 = L.mr = L.hospital = L.outpatient = L.er = L.premium = 0; L.oaa = false;
    }
    var P = {};
    P.death = num(prop.deathWan) * 10000;
    P.hospital = num(prop.hospitalWan) * 10000;
    P.outpatient = isSet(prop.outpatientYuan) ? num(prop.outpatientYuan) : P.hospital * PROP_RATIO.outpatient;
    P.er = isSet(prop.erYuan) ? num(prop.erYuan) : P.hospital * PROP_RATIO.er;
    P.accidentMedical = num(prop.accidentMedicalWan) * 10000;
    P.premium = num(prop.premium);
    return {
      life: L, prop: P,
      death: L.at1 + P.death,
      hospital: L.hospital + P.hospital,
      outpatient: L.outpatient + P.outpatient,
      er: L.er + P.er,
      accidentMedical: L.mr + P.accidentMedical,
      premium: L.premium + P.premium
    };
  }

  /* ---------- 日期 ---------- */
  var WD = ['日', '一', '二', '三', '四', '五', '六'];
  function parseDate(s) {
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s || ''));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  function fmtDate(s, mode) {
    var d = parseDate(s);
    if (!d) return s || '';
    var y = mode === 'ad' ? d.getFullYear() : d.getFullYear() - 1911;
    return y + '/' + (d.getMonth() + 1) + '/' + d.getDate() + '（' + WD[d.getDay()] + '）';
  }
  function daysInclusive(a, b) {
    var d1 = parseDate(a), d2 = parseDate(b);
    if (!d1 || !d2) return null;
    return Math.round((d2 - d1) / 86400000) + 1;
  }

  /* ---------- 分享連結編解碼（JSON → deflate → base64url，放在 #q=） ---------- */
  function b64urlFromBytes(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function bytesFromB64url(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function stripForShare(q) {
    var c = JSON.parse(JSON.stringify(q));
    delete c._sampleSource;
    return c;
  }
  function encodeQuote(q) {
    var json = JSON.stringify(stripForShare(q));
    var bytes = new TextEncoder().encode(json);
    if (global.pako) return 'q=' + b64urlFromBytes(global.pako.deflateRaw(bytes, { level: 9 }));
    return 'j=' + b64urlFromBytes(bytes);
  }
  function decodeHash(hash) {
    hash = String(hash || '').replace(/^#/, '');
    var params = {};
    hash.split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) params[kv.slice(0, i)] = kv.slice(i + 1);
    });
    var bytes;
    if (params.q) {
      if (!global.pako) throw new Error('缺少解壓縮元件（js/vendor/pako.min.js）');
      bytes = global.pako.inflateRaw(bytesFromB64url(params.q));
    } else if (params.j) {
      bytes = bytesFromB64url(params.j);
    } else {
      return null;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  function shareUrl(q, base) {
    // 以目前頁面所在資料夾為基準（線上編輯器 → 線上 index.html），不寫死網域
    var u = new URL(base || 'index.html', location.href);
    u.search = ''; u.hash = '';
    return u.href + '#' + encodeQuote(q);
  }

  /* ---------- 渲染 ---------- */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function bracket(lifeOn, lifeTxt, propTxt) {
    return '（' + (lifeOn ? '人壽 ' + lifeTxt + '＋產險 ' + propTxt : '產險 ' + propTxt) + '）';
  }
  function row(label, total, br, sub) {
    return '<div class="cov-row"><div class="cov-label">' + esc(label) +
      (sub ? '<span class="cov-sub">' + esc(sub) + '</span>' : '') + '</div>' +
      '<div class="cov-val"><strong>' + esc(total) + '</strong></div><div class="cov-br">' + esc(br) + '</div></div>';
  }
  function itemList(items) {
    if (!items || !items.length) return '<p class="empty">（未列項目）</p>';
    return '<ul class="items">' + items.map(function (it) {
      var amt = String(it.amount === null || it.amount === undefined ? '' : it.amount).split('，').map(function (part) {
        return '<span class="nw">' + esc(part) + '</span>';
      }).join('，<wbr>');
      return '<li><span class="it-name">' + esc(it.name) + '</span><span class="it-amt">' + (amt || '—') + '</span></li>';
    }).join('') + '</ul>';
  }

  function renderPlanCard(plan, quote, idx) {
    var c = computePlan(plan, quote);
    var L = c.life, P = c.prop, on = L.enabled;
    var h = '';
    h += '<article class="plan-card' + (plan.recommended ? ' is-reco' : '') + '" id="plan-' + (idx + 1) + '">';
    if (quote.sample) h += '<div class="card-sample">範例</div>';
    h += '<header class="plan-head"><div class="plan-title"><span class="plan-no">' + esc(plan.name || ('方案' + (idx + 1))) + '</span>' +
      (plan.recommended ? '<span class="reco-badge">推薦</span>' : '') + '</div>' +
      '<div class="plan-tagline">' + esc(plan.tagline || '') + '</div></header>';

    h += '<section class="death-box"><div class="death-label">意外身故・失能 保額</div>' +
      '<div class="death-val">' + esc(fmtYuan(c.death)) + '</div>' +
      '<div class="death-br">' + esc(on ? ('人壽 ' + fmtShort(L.at1) + '＋產險 ' + fmtShort(P.death)) : ('產險 ' + fmtShort(P.death))) + '</div></section>';

    h += '<section class="cov"><h3 class="sec-title">醫療保障</h3>';
    h += row('海外突發疾病 住院', fmtYuan(c.hospital), bracket(on, fmtShort(L.hospital), fmtShort(P.hospital)), on ? '人壽保期內最高' : '');
    h += row('海外突發疾病 門診', fmtYuan(c.outpatient), bracket(on, '每日最高 ' + fmtShort(L.outpatient), fmtShort(P.outpatient)));
    h += row('海外突發疾病 急診', fmtYuan(c.er), bracket(on, '每日最高 ' + fmtShort(L.er), fmtShort(P.er)));
    h += row('意外醫療', fmtYuan(c.accidentMedical), bracket(on, fmtShort(L.mr), fmtShort(P.accidentMedical)), on ? '人壽每一事故最高' : '');
    if (on && L.oaa) h += '<div class="oaa-chip">✈ 人壽另含 OAA 海外醫療專機運送（實物給付）</div>';
    h += '</section>';

    h += '<section class="inconv"><h3 class="sec-title">不便險（產險）</h3>' + itemList(plan.inconvenience) + '</section>';
    h += '<section class="others"><h3 class="sec-title">其他產險保障</h3>' + itemList(plan.others) + '</section>';

    h += '<footer class="premium"><div class="prem-label">保費</div>' +
      '<div class="prem-formula">壽 <b>' + comma(L.premium) + '</b> ＋ 產 <b>' + comma(P.premium) + '</b> ＝ <span class="prem-total">' + comma(c.premium) + '</span> 元</div></footer>';
    h += '</article>';
    return h;
  }

  function renderNotes(quote) {
    var notes = [];
    var anyLife = (quote.plans || []).some(function (p) { return p.life && p.life.enabled; });
    notes.push('人壽＝' + LIFE_PRODUCT + '；產險＝' + PROPERTY_PRODUCT + '。');
    if (anyLife) {
      var pct = num(quote.lifeRegionPct || 100);
      notes.push('人壽海外突發疾病（OH1）與意外醫療（MR）各為 AT1 保額之 10%' +
        (pct !== 100 ? '；人壽住院／門診／急診限額已含 ' + esc(quote.destination || '') + ' ' + pct + '% 地區調整' : '') +
        '；人壽門診、急診為每日最高。');
    }
    notes.push('產險門診為住院額度 2%、急診為 5%（保期內最高）。');
    (quote.extraNotes || []).forEach(function (n) { if (n) notes.push(n); });
    notes.push('本頁為保障內容與保費試算摘要，實際以保單條款、投保規定及核保結果為準。');
    return '<ul class="notes">' + notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>';
  }

  function renderHeader(quote) {
    var mode = quote.dateFormat === 'ad' ? 'ad' : 'roc';
    var dates = '';
    if (quote.startDate || quote.endDate) dates = fmtDate(quote.startDate, mode) + ' ～ ' + fmtDate(quote.endDate, mode);
    return '<div class="hero-kicker">旅平險 三方案報價</div>' +
      '<h1 class="hero-title"><span class="dest">' + esc(quote.destination || '—') + '</span><span class="days">' +
      esc(quote.days || '—') + '<small> 天</small></span></h1>' +
      (dates ? '<div class="hero-dates">' + esc(dates) + '</div>' : '');
  }

  function renderFooter(quote) {
    var a = quote.agent || {};
    return '<div class="sig-unit">富邦人壽 ' + esc(a.unit || '南恩通訊處') + '</div>' +
      '<div class="sig-people"><span>' + esc(a.title || '業務經理') + ' <b>' + esc(a.name || '陳銘旭') + '</b></span>' +
      '<span class="sep">／</span><span>' + esc(a.managerTitle || '處經理') + ' <b>' + esc(a.manager || '林秋慧') + '</b></span></div>';
  }

  function renderQuote(quote, root) {
    var plans = quote.plans || [];
    var html = '';
    if (quote.sample) html += '<div class="sample-banner" role="note">⚠ 範例資料・非正式報價（僅供版面示意）</div>';
    html += '<header class="hero">' + renderHeader(quote) + '</header>';
    html += '<nav class="plan-nav">' + plans.map(function (p, i) {
      return '<a href="#plan-' + (i + 1) + '" data-target="plan-' + (i + 1) + '">' + esc(p.name || ('方案' + (i + 1))) + '</a>';
    }).join('') + '</nav>';
    html += '<main class="plans">' + plans.map(function (p, i) { return renderPlanCard(p, quote, i); }).join('') + '</main>';
    html += '<section class="notes-wrap">' + renderNotes(quote) + '</section>';
    html += '<footer class="site-footer">' + renderFooter(quote) + '</footer>';
    root.innerHTML = html;
    // 方案導覽：用 scrollIntoView，避免改動 #q= 分享資料
    Array.prototype.forEach.call(root.querySelectorAll('.plan-nav a'), function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var t = root.querySelector('#' + a.getAttribute('data-target'));
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function titleFor(q) {
    return (q.sample ? '【範例】' : '') + (q.destination || '') + ' ' + (q.days || '') + '天 旅平險三方案';
  }

  global.TQ = {
    LIFE_PRODUCT: LIFE_PRODUCT, PROPERTY_PRODUCT: PROPERTY_PRODUCT,
    LIFE_OH1_RATIO: LIFE_OH1_RATIO, PROP_RATIO: PROP_RATIO, REGION_OPTIONS: REGION_OPTIONS,
    num: num, isSet: isSet, comma: comma, fmtYuan: fmtYuan, fmtShort: fmtShort,
    guessRegionPct: guessRegionPct, computePlan: computePlan,
    fmtDate: fmtDate, daysInclusive: daysInclusive,
    encodeQuote: encodeQuote, decodeHash: decodeHash, shareUrl: shareUrl,
    renderQuote: renderQuote, renderPlanCard: renderPlanCard, titleFor: titleFor, esc: esc
  };
})(window);
