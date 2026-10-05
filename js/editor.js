/* 報價編輯器：填寫 → 即時預覽 → 產生分享連結（資料編碼在網址 # 後）／下載 JSON */
(function () {
  'use strict';
  var STORE_KEY = 'tq-editor-draft-v1';
  var PRESETS = (window.PROPERTY_PRESETS && window.PROPERTY_PRESETS.plans) || [];
  var form = document.getElementById('form');
  var preview = document.getElementById('preview');
  var planTabs = document.getElementById('planTabs');
  var planForms = document.getElementById('planForms');
  var activePlan = 0;
  var Q;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) { return TQ.esc(s); }
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2200);
  }
  function blankPlan(i) {
    var tag = ['雙實支＋醫療額度高＋不便險', '雙實支保障＋不便險', '基本保障＋不便險'][i] || '';
    return {
      name: '方案' + '一二三'[i], tagline: tag, recommended: i === 0,
      life: { enabled: i < 2, at1Wan: [500, 300, null][i], oh1Wan: null, mrWan: null, oaa: true, hospitalYuan: null, outpatientYuan: null, erYuan: null, premium: null },
      property: { label: '', deathWan: [500, 300, 300][i], hospitalWan: null, outpatientYuan: null, erYuan: null, accidentMedicalWan: null, premium: null },
      inconvenience: [], others: []
    };
  }
  function normalize(q) {
    q = q || {};
    q.v = 1;
    q.plans = q.plans || [];
    for (var i = 0; i < 3; i++) if (!q.plans[i]) q.plans[i] = blankPlan(i);
    q.plans.forEach(function (p) {
      p.life = p.life || {}; p.property = p.property || {};
      p.inconvenience = p.inconvenience || []; p.others = p.others || [];
    });
    q.agent = q.agent || { unit: '南恩通訊處', name: '陳銘旭', title: '業務經理', manager: '林秋慧', managerTitle: '處經理' };
    if (!q.lifeRegionPct) q.lifeRegionPct = TQ.guessRegionPct(q.destination);
    if (!q.dateFormat) q.dateFormat = 'roc';
    return q;
  }

  /* ---------- 路徑存取 ---------- */
  function getPath(obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }
  function setPath(obj, path, val) {
    var ks = path.split('.'), o = obj;
    for (var i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = val;
  }

  /* ---------- 方案表單 ---------- */
  function field(label, key, opts) {
    opts = opts || {};
    return '<label>' + esc(label) + '<input type="' + (opts.type || 'number') + '" data-k="' + key + '"' +
      (opts.type === 'text' ? '' : ' inputmode="numeric" min="0" step="any"') +
      (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : '') + '>' +
      (opts.hint ? '<span class="hint' + (opts.auto ? ' auto' : '') + '" data-hint="' + key + '">' + esc(opts.hint) + '</span>' : '') + '</label>';
  }
  function presetOptions() {
    var h = '<option value="">— 選擇方案帶入（新快樂旅綜+ 115.04 DM）—</option>';
    PRESETS.forEach(function (p) { h += '<option value="' + esc(p.code) + '">' + esc(p.label + '（' + p.ageLabel + '）') + '</option>'; });
    return h;
  }
  function listEditor(i, kind, title) {
    var items = Q.plans[i][kind];
    var h = '<h3>' + esc(title) + '（' + items.length + ' 項）</h3><div class="list-ed">';
    items.forEach(function (it, j) {
      var base = 'plans.' + i + '.' + kind + '.' + j;
      h += '<div class="list-row">' +
        '<input type="text" data-k="' + base + '.name" placeholder="項目名稱">' +
        '<input type="text" data-k="' + base + '.amount" placeholder="保額／給付（照條款填寫）">' +
        '<div class="row-btns">' +
        '<button type="button" class="btn btn-sm" data-act="up" data-i="' + i + '" data-kind="' + kind + '" data-j="' + j + '" title="上移">↑</button>' +
        '<button type="button" class="btn btn-sm" data-act="down" data-i="' + i + '" data-kind="' + kind + '" data-j="' + j + '" title="下移">↓</button>' +
        '<button type="button" class="btn btn-sm btn-danger" data-act="del" data-i="' + i + '" data-kind="' + kind + '" data-j="' + j + '" title="刪除">✕</button>' +
        '</div></div>';
    });
    h += '</div><button type="button" class="btn btn-sm" style="margin-top:8px" data-act="add" data-i="' + i + '" data-kind="' + kind + '">＋ 新增項目</button>';
    return h;
  }
  function planForm(i) {
    var b = 'plans.' + i + '.';
    var h = '<section class="ed-card plan-form" data-plan="' + i + '"' + (i === activePlan ? '' : ' hidden') + '>';
    h += '<h2>' + esc(Q.plans[i].name || ('方案' + (i + 1))) + '</h2>';
    h += '<div class="grid g2">' + field('方案名稱', b + 'name', { type: 'text' }) + field('副標（例：雙實支保障＋不便險）', b + 'tagline', { type: 'text' }) + '</div>';
    h += '<label class="check" style="margin-top:8px"><input type="checkbox" data-k="' + b + 'recommended"> 標示「推薦」</label>';

    h += '<div class="sub-box life-box"><label class="check"><input type="checkbox" data-k="' + b + 'life.enabled"> <b>含人壽（富邦人壽 Go安行）</b></label>';
    h += '<div class="grid g3" style="margin-top:8px">' +
      field('AT1 主約（萬）', b + 'life.at1Wan') +
      field('OH1 海外突發疾病（萬）', b + 'life.oh1Wan', { hint: '空白＝自動 AT1×10%', auto: true }) +
      field('MR 意外醫療（萬）', b + 'life.mrWan', { hint: '空白＝自動 AT1×10%', auto: true }) +
      '</div>';
    h += '<label class="check" style="margin-top:8px"><input type="checkbox" data-k="' + b + 'life.oaa"> OAA 海外醫療專機運送（限亞洲14國）</label>';
    h += '<div class="grid g3" style="margin-top:8px">' +
      field('人壽 住院限額（元）', b + 'life.hospitalYuan', { hint: '空白＝自動 OH1×地區%', auto: true }) +
      field('人壽 門診每日（元）', b + 'life.outpatientYuan', { hint: '空白＝自動 OH1×3%×地區%', auto: true }) +
      field('人壽 急診每日（元）', b + 'life.erYuan', { hint: '空白＝自動 OH1×6%×地區%', auto: true }) +
      '</div>';
    h += '<div class="grid g2" style="margin-top:8px">' + field('人壽保費（元）', b + 'life.premium', { hint: '以 GPTA 系統試算為準' }) + '</div></div>';

    h += '<div class="sub-box"><b>產險（富邦產險 新快樂旅綜+）</b>';
    h += '<div class="preset-row" style="margin-top:8px"><label>套用方案預設<select data-preset="' + i + '">' + presetOptions() + '</select></label></div>';
    h += '<div class="grid g3">' +
      field('方案名稱（內部參考）', b + 'property.label', { type: 'text' }) +
      field('意外身故失能（萬）', b + 'property.deathWan') +
      field('突發疾病 住院（萬）', b + 'property.hospitalWan') +
      field('突發疾病 門診（元）', b + 'property.outpatientYuan', { hint: '空白＝自動 住院×2%', auto: true }) +
      field('突發疾病 急診（元）', b + 'property.erYuan', { hint: '空白＝自動 住院×5%', auto: true }) +
      field('意外醫療（萬）', b + 'property.accidentMedicalWan') +
      field('產險保費（元）', b + 'property.premium') +
      '</div>';
    h += listEditor(i, 'inconvenience', '不便險項目');
    h += listEditor(i, 'others', '其他產險保障');
    h += '</div>';
    h += '<div class="sumbar" data-sum="' + i + '"></div>';
    h += '</section>';
    return h;
  }
  function buildPlanUI() {
    planTabs.innerHTML = Q.plans.map(function (p, i) {
      return '<button type="button" data-tab="' + i + '"' + (i === activePlan ? ' class="on"' : '') + '>' + esc(p.name || ('方案' + (i + 1))) + '</button>';
    }).join('');
    planForms.innerHTML = Q.plans.map(function (_, i) { return planForm(i); }).join('');
    fillInputs(planForms);
    refreshDerived();
  }

  /* ---------- 表單 ↔ 資料 ---------- */
  function fillInputs(scope) {
    Array.prototype.forEach.call(scope.querySelectorAll('[data-k]'), function (el) {
      var k = el.getAttribute('data-k'), v;
      if (k === 'extraNotesText') v = (Q.extraNotes || []).join('\n');
      else v = getPath(Q, k);
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = (v === null || v === undefined) ? '' : v;
    });
  }
  function readInput(el) {
    var k = el.getAttribute('data-k');
    if (k === 'extraNotesText') { Q.extraNotes = el.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean); return; }
    var v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'number' || el.tagName === 'SELECT' && k === 'lifeRegionPct') v = el.value === '' ? null : Number(el.value);
    else v = el.value;
    setPath(Q, k, v);
    if (k === 'startDate' || k === 'endDate') {
      var d = TQ.daysInclusive(Q.startDate, Q.endDate);
      if (d && d > 0) { Q.days = d; var di = form.querySelector('[data-k="days"]'); if (di) di.value = d; }
    }
    if (k === 'destination') {
      var g = TQ.guessRegionPct(Q.destination);
      if (g !== Q.lifeRegionPct) { Q.lifeRegionPct = g; form.querySelector('[data-k="lifeRegionPct"]').value = g; }
    }
    if (/\.name$/.test(k) && /^plans\.\d+\.name$/.test(k)) {
      var i = Number(k.split('.')[1]);
      planTabs.children[i].textContent = Q.plans[i].name || ('方案' + (i + 1));
    }
  }

  function refreshDerived() {
    // 自動欄位的 placeholder 顯示計算值；小計列
    Q.plans.forEach(function (p, i) {
      var c = TQ.computePlan(p, Q);
      var sec = planForms.querySelector('[data-plan="' + i + '"]');
      if (!sec) return;
      function ph(key, val, unit) {
        var el = sec.querySelector('[data-k="plans.' + i + '.' + key + '"]');
        if (el) el.placeholder = '自動：' + TQ.comma(val) + (unit || '');
      }
      ph('life.oh1Wan', c.life.enabled ? c.life.oh1 / 10000 : TQ.num(p.life.at1Wan) * 0.1);
      ph('life.mrWan', c.life.enabled ? c.life.mr / 10000 : TQ.num(p.life.at1Wan) * 0.1);
      var pct = TQ.num(Q.lifeRegionPct || 100) / 100, oh1 = (TQ.isSet(p.life.oh1Wan) ? TQ.num(p.life.oh1Wan) : TQ.num(p.life.at1Wan) * 0.1) * 10000;
      ph('life.hospitalYuan', oh1 * pct); ph('life.outpatientYuan', oh1 * 0.03 * pct); ph('life.erYuan', oh1 * 0.06 * pct);
      ph('property.outpatientYuan', c.prop.outpatient); ph('property.erYuan', c.prop.er);
      sec.querySelector('.life-box').classList.toggle('off', !p.life.enabled);
      sec.querySelector('[data-sum="' + i + '"]').innerHTML =
        '<span>意外身故失能 <b>' + TQ.fmtYuan(c.death) + '</b></span>' +
        '<span>住院 <b>' + TQ.fmtYuan(c.hospital) + '</b></span>' +
        '<span>門診 <b>' + TQ.fmtYuan(c.outpatient) + '</b></span>' +
        '<span>急診 <b>' + TQ.fmtYuan(c.er) + '</b></span>' +
        '<span>意外醫療 <b>' + TQ.fmtYuan(c.accidentMedical) + '</b></span>' +
        '<span>保費 <b>壽' + TQ.comma(c.life.premium) + '＋產' + TQ.comma(c.prop.premium) + '＝' + TQ.comma(c.premium) + '元</b></span>';
    });
    var dh = document.getElementById('daysHint');
    var d = TQ.daysInclusive(Q.startDate, Q.endDate);
    dh.textContent = d ? ('依日期計算：' + d + ' 天（含出發與回程日）') : '';
    document.getElementById('regionHint').textContent = '依目的地自動判斷，可手動調整（Go安行 DM 註3）';
  }

  function checks() {
    var out = [];
    function add(cls, msg) { out.push('<li class="' + cls + '">' + esc(msg) + '</li>'); }
    if (Q.sample) add('err', '目前標示為「範例資料」— 傳給客戶前請取消勾選並確認所有金額。');
    if (!Q.destination) add('warn', '尚未填寫目的地。');
    if (!Q.startDate || !Q.endDate) add('warn', '尚未填寫出發／回程日期。');
    var d = TQ.daysInclusive(Q.startDate, Q.endDate);
    if (d && Q.days && d !== Number(Q.days)) add('warn', '天數（' + Q.days + '）與日期計算（' + d + ' 天）不同，請確認。');
    Q.plans.forEach(function (p) {
      var n = p.name || '';
      if (p.life && p.life.enabled) {
        if (!TQ.num(p.life.at1Wan)) add('err', n + '：人壽 AT1 未填。');
        if (!TQ.isSet(p.life.premium)) add('err', n + '：人壽保費未填（請以 GPTA 試算）。');
      }
      if (!TQ.isSet(p.property.premium)) add('err', n + '：產險保費未填。');
      if (!TQ.num(p.property.deathWan)) add('warn', n + '：產險意外身故失能未填。');
      if (!p.inconvenience.length) add('warn', n + '：沒有任何不便險項目。');
      p.inconvenience.concat(p.others).forEach(function (it) {
        if (!it.amount) add('warn', n + '：「' + (it.name || '未命名') + '」保額空白。');
      });
    });
    if (!out.length) add('ok', '檢查通過，可產生分享連結。');
    document.getElementById('checks').innerHTML = '<h2>送出前檢查</h2><ul>' + out.join('') + '</ul>';
  }

  var saveTimer;
  function update() {
    refreshDerived();
    TQ.renderQuote(clone(Q), preview);
    checks();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { try { localStorage.setItem(STORE_KEY, JSON.stringify(Q)); } catch (e) {} }, 300);
    document.getElementById('sharePanel').hidden = true; // 內容變更後需重新產生連結
  }

  function load(q) {
    Q = normalize(clone(q));
    activePlan = 0;
    Array.prototype.forEach.call(form.querySelectorAll('.ed-card:not(.plan-form)'), function (c) { fillInputs(c); });
    buildPlanUI();
    update();
  }

  /* ---------- 事件 ---------- */
  form.addEventListener('input', function (e) {
    if (e.target.hasAttribute('data-k')) { readInput(e.target); update(); }
  });
  form.addEventListener('change', function (e) {
    var t = e.target;
    if (t.hasAttribute('data-preset')) {
      var code = t.value; if (!code) return;
      var p = PRESETS.filter(function (x) { return x.code === code; })[0];
      var i = Number(t.getAttribute('data-preset'));
      var plan = Q.plans[i];
      plan.property.label = p.label;
      plan.property.deathWan = p.deathWan;
      plan.property.hospitalWan = p.hospitalWan;
      plan.property.outpatientYuan = null;
      plan.property.erYuan = null;
      plan.property.accidentMedicalWan = p.accidentMedicalWan;
      var prem = p.premiumByDays[String(Q.days)];
      plan.property.premium = prem === undefined ? null : prem;
      plan.inconvenience = clone(p.inconvenience);
      plan.others = clone(p.others);
      buildPlanUI(); update();
      toast(prem === undefined ? '已帶入保障；DM 費率表只有 2～10 天，保費請另行試算' : '已帶入 ' + p.label + '，' + Q.days + ' 天保費 ' + TQ.comma(prem) + ' 元');
      return;
    }
    if (t.hasAttribute('data-k') && (t.type === 'checkbox' || t.tagName === 'SELECT')) { readInput(t); update(); }
  });
  form.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var i = Number(b.getAttribute('data-i')), kind = b.getAttribute('data-kind'), j = Number(b.getAttribute('data-j'));
    var arr = Q.plans[i][kind], act = b.getAttribute('data-act');
    if (act === 'add') arr.push({ name: '', amount: '' });
    if (act === 'del') arr.splice(j, 1);
    if (act === 'up' && j > 0) arr.splice(j - 1, 0, arr.splice(j, 1)[0]);
    if (act === 'down' && j < arr.length - 1) arr.splice(j + 1, 0, arr.splice(j, 1)[0]);
    buildPlanUI(); update();
    if (act === 'add') {
      var rows = planForms.querySelectorAll('[data-plan="' + i + '"] [data-k^="plans.' + i + '.' + kind + '."][data-k$=".name"]');
      if (rows.length) rows[rows.length - 1].focus();
    }
  });
  planTabs.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]'); if (!b) return;
    activePlan = Number(b.getAttribute('data-tab'));
    Array.prototype.forEach.call(planTabs.children, function (x, k) { x.classList.toggle('on', k === activePlan); });
    Array.prototype.forEach.call(planForms.children, function (x, k) { x.hidden = k !== activePlan; });
    var card = preview.querySelector('#plan-' + (activePlan + 1));
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.querySelectorAll('.pv-toggle button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.pv-toggle button').forEach(function (x) { x.classList.toggle('on', x === b); });
      document.getElementById('pvFrame').classList.toggle('full', b.getAttribute('data-w') === 'full');
    });
  });

  document.getElementById('btnShare').addEventListener('click', function () {
    var url = TQ.shareUrl(Q);
    var panel = document.getElementById('sharePanel');
    document.getElementById('shareUrl').value = url;
    document.getElementById('btnOpen').href = url;
    var meta = '連結長度 ' + url.length + ' 字元。';
    if (/^file:/.test(url)) meta += ' <span class="warn">目前是本機檔案路徑（file://），客戶打不開；請先把網站放到靜態主機（如 GitHub Pages / Netlify），再從該網址開啟編輯器產生連結。</span>';
    if (url.length > 4500) meta += ' <span class="warn">連結偏長，LINE 單則訊息上限約 5,000 字，建議刪減項目文字或改用 JSON 檔＋?src=。</span>';
    if (Q.sample) meta += ' <span class="warn">此報價仍標示為「範例」。</span>';
    document.getElementById('shareMeta').innerHTML = meta;
    panel.hidden = false;
    // 驗證：解碼後內容必須一致
    try {
      var back = TQ.decodeHash(url.slice(url.indexOf('#')));
      var a = clone(Q); delete a._sampleSource;
      if (JSON.stringify(back) !== JSON.stringify(a)) throw new Error('mismatch');
    } catch (err) { document.getElementById('shareMeta').innerHTML += ' <span class="warn">連結驗證失敗：' + esc(err.message) + '</span>'; }
  });
  document.getElementById('btnCopy').addEventListener('click', function () {
    var ta = document.getElementById('shareUrl');
    var txt = ta.value;
    (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(txt) : Promise.reject())
      .then(function () { toast('已複製連結'); })
      .catch(function () { ta.select(); document.execCommand('copy'); toast('已複製連結'); });
  });
  document.getElementById('btnDownload').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(Q, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'quote_' + (Q.destination || '') + (Q.days || '') + '天_' + String(Q.startDate || '').replace(/-/g, '') + (Q.sample ? '_範例' : '') + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  document.getElementById('fileImport').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try { load(JSON.parse(r.result)); toast('已匯入 ' + f.name); }
      catch (err) { alert('JSON 格式錯誤：' + err.message); }
    };
    r.readAsText(f, 'utf-8'); e.target.value = '';
  });
  document.getElementById('btnPasteLink').addEventListener('click', function () {
    var s = prompt('貼上先前產生的分享連結：');
    if (!s) return;
    try {
      var q = TQ.decodeHash(s.slice(s.indexOf('#')));
      if (!q) throw new Error('連結中沒有報價資料');
      load(q); toast('已由連結載入');
    } catch (err) { alert('無法解析連結：' + err.message); }
  });
  document.getElementById('btnSample').addEventListener('click', function () {
    if (confirm('載入範例資料會覆蓋目前內容，確定？')) { load(window.SAMPLE_QUOTE); toast('已載入範例（已標示為範例）'); }
  });
  document.getElementById('btnClear').addEventListener('click', function () {
    if (!confirm('清空所有金額與保費（保留方案名稱與項目名稱），並取消「範例」標示？')) return;
    Q.sample = false; delete Q._sampleSource;
    Q.plans.forEach(function (p) {
      ['at1Wan', 'oh1Wan', 'mrWan', 'hospitalYuan', 'outpatientYuan', 'erYuan', 'premium'].forEach(function (k) { p.life[k] = null; });
      ['deathWan', 'hospitalWan', 'outpatientYuan', 'erYuan', 'accidentMedicalWan', 'premium'].forEach(function (k) { p.property[k] = null; });
      p.property.label = '';
      p.inconvenience.concat(p.others).forEach(function (it) { it.amount = ''; });
    });
    load(Q); toast('已清空金額');
  });

  /* ---------- 初始化 ---------- */
  var regionSel = form.querySelector('[data-k="lifeRegionPct"]');
  regionSel.innerHTML = TQ.REGION_OPTIONS.map(function (o) { return '<option value="' + o.pct + '">' + esc(o.label) + '</option>'; }).join('');

  var initial = null;
  try { initial = TQ.decodeHash(location.hash); } catch (e) { alert('網址中的報價資料無法解析：' + e.message); }
  if (!initial) { try { initial = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) {} }
  load(initial || window.SAMPLE_QUOTE);
})();
