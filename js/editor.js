/* 報價編輯器：填寫 → 即時預覽 → 產生分享連結（資料編碼在網址 # 後）／下載 JSON
 * 產險保費：新快樂旅綜+ DM（天數 2～10）自動帶入；人壽保費：life-rates.js 精確相符才自動帶入。
 */
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
  var rebuildingUI = false;
  /** 使用者剛手動改過保費時，略過一次自動覆寫 */
  var skipAutoOnce = { life: {}, prop: {} };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) { return TQ.esc(s); }
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2200);
  }
  function blankPlan(i) {
    var tag = ['雙實支＋醫療額度高＋不便險', '雙實支保障＋不便險', '基本保障＋不便險'][i] || '';
    var codes = ['P1-G500', 'P1-G300', 'P1-G300'];
    return {
      name: '方案' + '一二三'[i], tagline: tag, recommended: i === 0,
      life: { enabled: i < 2, at1Wan: [500, 300, null][i], oh1Wan: null, mrWan: null, oaa: true, hospitalYuan: null, outpatientYuan: null, erYuan: null, premium: null },
      property: { planCode: codes[i], label: '', deathWan: [500, 300, 300][i], hospitalWan: null, outpatientYuan: null, erYuan: null, accidentMedicalWan: null, premium: null },
      inconvenience: [], others: []
    };
  }
  function normalize(q) {
    q = q || {};
    q.v = 1;
    q.plans = q.plans || [];
    for (var i = 0; i < 3; i++) if (!q.plans[i]) q.plans[i] = blankPlan(i);
    q.plans.forEach(function (p, idx) {
      p.life = p.life || {}; p.property = p.property || {};
      p.inconvenience = p.inconvenience || []; p.others = p.others || [];
      if (!p.property.planCode) {
        var hit = TQ.findPropertyPreset(p.property);
        if (hit) p.property.planCode = hit.code;
        else if (!p.property.planCode) p.property.planCode = ['P1-G500', 'P1-G300', 'P1-G300'][idx];
      }
    });
    q.agent = q.agent || { unit: '南恩通訊處', name: '陳銘旭', title: '業務經理', manager: '林秋慧', managerTitle: '處經理' };
    if (!q.lifeRegionPct) q.lifeRegionPct = TQ.guessRegionPct(q.destination);
    if (!q.dateFormat) q.dateFormat = 'roc';
    if (!q.lifeRateType) q.lifeRateType = 'agency';
    if (!q.ageBand) q.ageBand = '18-65';
    if (typeof q.schengen !== 'boolean') q.schengen = false;
    if (!q.lifeRegion) {
      q.lifeRegion = q.schengen ? 'other' : ((window.LIFE_RATES && LIFE_RATES.guessLifeRegion(q.destination)) || 'asia14');
    }
    // 方案一／二預設含人壽；方案三不含
    q.plans.forEach(function (p, idx) {
      if (p.life && typeof p.life.enabled !== 'boolean') p.life.enabled = idx < 2;
      if (q.schengen && p.life && p.life.enabled) p.life.oaa = false;
    });
    return q;
  }


  function applySchengenMode(on) {
    Q.schengen = !!on;
    if (on) {
      Q.lifeRegion = 'other';
      // 歐洲 OH1 限額調整多為 200%
      if (!Q.lifeRegionPct || Number(Q.lifeRegionPct) === 100) Q.lifeRegionPct = 200;
      Q.plans.forEach(function (p) {
        if (p.life && p.life.enabled) {
          p.life.oaa = false;
          // 離線表無「國外其他」費率 → 清掉自動壽險保費，改手填
          if (p.life._premAuto || true) { p.life.premium = null; p.life._premAuto = false; }
        }
        p.property._appliedCode = null; // 強制改套 P2
        if (p.property.planCode && /^P1-G/.test(p.property.planCode)) p.property.planCode = '';
      });
    } else {
      Q.lifeRegion = (window.LIFE_RATES && LIFE_RATES.guessLifeRegion(Q.destination)) || 'asia14';
      Q.lifeRegionPct = TQ.guessRegionPct(Q.destination);
      Q.plans.forEach(function (p) {
        if (p.life && p.life.enabled) p.life.oaa = (Q.lifeRegion === 'asia14');
        p.property._appliedCode = null;
        if (p.property.planCode && /^P2-G/.test(p.property.planCode)) p.property.planCode = '';
      });
    }
    var lr = form.querySelector('[data-k="lifeRegion"]');
    if (lr) lr.value = Q.lifeRegion;
    var lp = form.querySelector('[data-k="lifeRegionPct"]');
    if (lp) lp.value = Q.lifeRegionPct;
  }

  /* ---------- 產險整包自動帶入（保額／天數）＋人壽保費查表 ---------- */
  /** 依保額（或進階 planCode）套用不便險／其他保障／住院醫療等；回傳是否異動項目（需重建表單） */
  function applyPropertyCoverage(plan) {
    var preset = TQ.resolvePropertyPreset(plan.property, Q);
    if (!preset) {
      plan.property._premTip = '尚無對應產險方案（請填保額 200／300／500／1000，或用進階下拉）';
      plan.property._covAuto = false;
      return false;
    }
    var changed = plan.property._appliedCode !== preset.code
      || !plan.inconvenience || !plan.inconvenience.length
      || !plan.others || !plan.others.length;
    plan.property.planCode = preset.code;
    plan.property.label = preset.label;
    plan.property.deathWan = preset.deathWan;
    plan.property.hospitalWan = preset.hospitalWan;
    plan.property.accidentMedicalWan = preset.accidentMedicalWan;
    // 門診／急診留給自動比例（null＝住院×2%／5%）
    if (!TQ.isSet(plan.property.outpatientYuan) || changed) plan.property.outpatientYuan = null;
    if (!TQ.isSet(plan.property.erYuan) || changed) plan.property.erYuan = null;
    if (changed) {
      plan.inconvenience = clone(preset.inconvenience);
      plan.others = clone(preset.others);
      plan.property._appliedCode = preset.code;
      plan.property._covAuto = true;
    }
    return changed;
  }

  function applyAutoPremiums() {
    var bannerBits = [];
    var needRebuild = false;
    Q.plans.forEach(function (p, i) {
      // 產險：先依保額套保障項目
      if (applyPropertyCoverage(p)) needRebuild = true;

      if (!skipAutoOnce.prop[i]) {
        var pr = TQ.lookupPropertyPremium(p.property, Q.days, Q);
        if (pr.preset) {
          p.property.planCode = pr.preset.code;
          if (!p.property._appliedCode) p.property._appliedCode = pr.preset.code;
        }
        if (pr.found) {
          p.property.premium = pr.premium;
          p.property._premTip = pr.tip + (p.property._covAuto ? '；不便險／其他保障已自動帶入' : '');
          p.property._premAuto = true;
        } else if (pr.outOfRange) {
          p.property.premium = null;
          p.property._premTip = pr.tip + '（保障項目仍已依保額自動帶入）';
          p.property._premAuto = false;
        } else {
          p.property._premTip = pr.tip;
          p.property._premAuto = false;
        }
      } else {
        p.property._premAuto = false;
        p.property._premTip = '已手動修改產險保費（改天數或保額可恢復自動）';
      }

      // 人壽
      if (!p.life.enabled) {
        if (!skipAutoOnce.life[i]) { p.life.premium = 0; p.life._premAuto = true; p.life._premTip = '未含人壽'; }
      } else if (!skipAutoOnce.life[i] && window.LIFE_RATES) {
        var lr = LIFE_RATES.lookupLifePremium(Q, p);
        if (lr.found) {
          p.life.premium = lr.premium;
          p.life._premTip = lr.tip;
          p.life._premAuto = true;
        } else {
          if (p.life._premAuto) p.life.premium = null;
          p.life._premTip = Q.schengen
            ? '申根人壽需 GPTA「國外其他」費率（離線表僅亞洲14國＋OAA）；請手填保費'
            : lr.tip;
          p.life._premAuto = false;
        }
      } else if (!window.LIFE_RATES) {
        p.life._premTip = '缺少 js/life-rates.js';
        p.life._premAuto = false;
      } else {
        p.life._premAuto = false;
        p.life._premTip = '已手動修改人壽保費（改天數／AT1／OAA／年齡帶可恢復自動）';
      }

      bannerBits.push(
        (p.name || ('方案' + (i + 1))) + '：壽' + (p.life._premAuto ? '自動' : '手填／缺表') +
        '／產' + (p.property._premAuto ? '自動' : (p.property._premTip && p.property._premTip.indexOf('僅列') >= 0 ? '超出DM' : '手填／未對應'))
      );
    });
    var el = document.getElementById('autoPremiumBanner');
    if (el) el.textContent = '保費狀態 — ' + bannerBits.join('；') + '｜產險：改保額或天數即自動帶不便險／保障／保費';
    return needRebuild;
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
  function presetOptions(selected) {
    var h = '<option value="">— 選擇方案帶入（新快樂旅綜+ 115.04 DM）—</option>';
    PRESETS.forEach(function (p) {
      h += '<option value="' + esc(p.code) + '"' + (selected === p.code ? ' selected' : '') + '>' +
        esc(p.label + '（' + p.ageLabel + '）') + '</option>';
    });
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
    var plan = Q.plans[i];
    var hasLife = !!(plan.life && plan.life.enabled);
    var h = '<section class="ed-card plan-form" data-plan="' + i + '"' + (i === activePlan ? '' : ' hidden') + '>';
    h += '<h2>' + esc(plan.name || ('方案' + (i + 1))) +
      (plan.recommended ? ' <span class="reco-badge" style="font-size:13px">推薦</span>' : '') + '</h2>';
    h += '<p class="plan-simple-hint">' + (hasLife
      ? '此方案只需填：人壽保額、產險保額（其餘自動）'
      : '此方案只需填：產險保額（純產險，無人壽）') +
      (Q.schengen ? '　｜已勾選申根→產險用計畫二（突發疾病 150萬）' : '') + '</p>';

    h += '<div class="grid g2">';
    if (hasLife) {
      h += field('人壽保額 AT1（萬）', b + 'life.at1Wan', { hint: 'OH1／MR 自動＝AT1×10%；保費自動查表', auto: true });
    }
    h += field('產險保額（萬）', b + 'property.deathWan', {
      hint: Q.schengen ? '對計畫二 P2-G*（200／300／500／1000／1500）' : '對計畫一 P1-G*（200／300／500／1000）',
      auto: true
    });
    h += '</div>';
    h += '<p class="hint" data-life-prem-tip="' + i + '"></p>';
    h += '<p class="hint" data-prop-prem-tip="' + i + '"></p>';

    h += '<details class="prop-advanced" style="margin-top:10px"><summary>進階（名稱／附約／細項／手改保費）</summary>';
    h += '<div class="grid g2" style="margin-top:8px">' +
      field('方案名稱', b + 'name', { type: 'text' }) +
      field('副標', b + 'tagline', { type: 'text' }) +
      '</div>';
    h += '<label class="check" style="margin-top:8px"><input type="checkbox" data-k="' + b + 'recommended"> 標示「推薦」</label>';

    h += '<div class="sub-box life-box" style="margin-top:10px"><label class="check"><input type="checkbox" data-k="' + b + 'life.enabled"> <b>含人壽</b></label>';
    h += '<div class="grid g3" style="margin-top:8px">' +
      field('OH1（萬）', b + 'life.oh1Wan', { hint: '空白＝AT1×10%', auto: true }) +
      field('MR（萬）', b + 'life.mrWan', { hint: '空白＝AT1×10%', auto: true }) +
      field('人壽保費（元）', b + 'life.premium', { hint: '可手改', auto: true }) +
      '</div>';
    h += '<label class="check" style="margin-top:8px"><input type="checkbox" data-k="' + b + 'life.oaa"> OAA（限亞洲14國）</label>';
    h += '<div class="grid g3" style="margin-top:8px">' +
      field('人壽住院（元）', b + 'life.hospitalYuan', { hint: '空白＝自動', auto: true }) +
      field('人壽門診每日（元）', b + 'life.outpatientYuan', { hint: '空白＝自動', auto: true }) +
      field('人壽急診每日（元）', b + 'life.erYuan', { hint: '空白＝自動', auto: true }) +
      '</div></div>';

    h += '<div class="sub-box" style="margin-top:10px"><b>產險細項</b>';
    h += '<div class="preset-row" style="margin-top:8px"><label>改選完整方案<select data-preset="' + i + '">' +
      presetOptions(plan.property.planCode) + '</select></label></div>';
    h += '<div class="grid g3">' +
      field('方案代碼', b + 'property.planCode', { type: 'text' }) +
      field('產險保費（元）', b + 'property.premium', { hint: '可手改', auto: true }) +
      field('突發疾病住院（萬）', b + 'property.hospitalWan') +
      field('門診（元）', b + 'property.outpatientYuan', { hint: '空白＝自動', auto: true }) +
      field('急診（元）', b + 'property.erYuan', { hint: '空白＝自動', auto: true }) +
      field('意外醫療（萬）', b + 'property.accidentMedicalWan') +
      '</div>';
    h += listEditor(i, 'inconvenience', '不便險項目');
    h += listEditor(i, 'others', '其他產險保障');
    h += '</div></details>';

    h += '<div class="sumbar" data-sum="' + i + '"></div>';
    h += '</section>';
    return h;
  }
  function buildPlanUI() {
    rebuildingUI = true;
    planTabs.innerHTML = Q.plans.map(function (p, i) {
      return '<button type="button" data-tab="' + i + '"' + (i === activePlan ? ' class="on"' : '') + '>' + esc(p.name || ('方案' + (i + 1))) + '</button>';
    }).join('');
    planForms.innerHTML = Q.plans.map(function (_, i) { return planForm(i); }).join('');
    fillInputs(planForms);
    rebuildingUI = false;
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
    else if (el.type === 'number' || (el.tagName === 'SELECT' && (k === 'lifeRegionPct'))) v = el.value === '' ? null : Number(el.value);
    else v = el.value;
    setPath(Q, k, v);

    // 手動改保費 → 跳過自動覆寫
    var mLife = /^plans\.(\d+)\.life\.premium$/.exec(k);
    var mProp = /^plans\.(\d+)\.property\.premium$/.exec(k);
    if (mLife) { skipAutoOnce.life[Number(mLife[1])] = true; Q.plans[Number(mLife[1])].life._premAuto = false; }
    if (mProp) { skipAutoOnce.prop[Number(mProp[1])] = true; Q.plans[Number(mProp[1])].property._premAuto = false; }

    // 改關鍵欄位 → 恢復自動
    if (k === 'days' || k === 'startDate' || k === 'endDate' || k === 'ageBand' || k === 'lifeRegion' || k === 'lifeRateType' || k === 'destination' || k === 'schengen') {
      skipAutoOnce.life = {}; skipAutoOnce.prop = {};
    }
    if (k === 'schengen') {
      applySchengenMode(!!v);
    }
    var mAt = /^plans\.(\d+)\.life\.(at1Wan|oh1Wan|mrWan|oaa|enabled)$/.exec(k);
    if (mAt) delete skipAutoOnce.life[Number(mAt[1])];
    var mPc = /^plans\.(\d+)\.property\.(planCode|deathWan|hospitalWan)$/.exec(k);
    if (mPc) {
      var pi = Number(mPc[1]);
      delete skipAutoOnce.prop[pi];
      // 保額或方案變了 → 強制重套不便險／保障
      if (mPc[2] === 'deathWan' || mPc[2] === 'planCode') {
        Q.plans[pi].property._appliedCode = null;
      }
    }

    if (k === 'startDate' || k === 'endDate') {
      var d = TQ.daysInclusive(Q.startDate, Q.endDate);
      if (d && d > 0) { Q.days = d; var di = form.querySelector('[data-k="days"]'); if (di) di.value = d; }
    }
    if (k === 'destination') {
      var g = TQ.guessRegionPct(Q.destination);
      if (g !== Q.lifeRegionPct) { Q.lifeRegionPct = g; form.querySelector('[data-k="lifeRegionPct"]').value = g; }
      if (window.LIFE_RATES) {
        var lr = LIFE_RATES.guessLifeRegion(Q.destination);
        Q.lifeRegion = lr;
        var sel = form.querySelector('[data-k="lifeRegion"]');
        if (sel) sel.value = lr;
      }
    }
    if (/\.name$/.test(k) && /^plans\.\d+\.name$/.test(k)) {
      var i = Number(k.split('.')[1]);
      planTabs.children[i].textContent = Q.plans[i].name || ('方案' + (i + 1));
    }
  }

  function refreshDerived() {
    // 起迄日 → 天數（算頭算尾）；必須在保費查表前更新
    var synced = TQ.daysInclusive(Q.startDate, Q.endDate);
    if (synced && synced > 0 && Number(Q.days) !== synced) {
      Q.days = synced;
      var diSync = form.querySelector('[data-k="days"]');
      if (diSync) diSync.value = synced;
      skipAutoOnce.life = {};
      skipAutoOnce.prop = {};
    }
    var needRebuild = applyAutoPremiums();
    if (needRebuild && !rebuildingUI) {
      // 保障項目列數變了，重建表單一次（_appliedCode 已寫入，不會迴圈）
      buildPlanUI();
      return;
    }
    // 把自動結果寫回 input 顯示
    Q.plans.forEach(function (p, i) {
      var sec = planForms.querySelector('[data-plan="' + i + '"]');
      if (!sec) return;
      var lifeInp = sec.querySelector('[data-k="plans.' + i + '.life.premium"]');
      var propInp = sec.querySelector('[data-k="plans.' + i + '.property.premium"]');
      if (lifeInp && !skipAutoOnce.life[i]) lifeInp.value = (p.life.premium === null || p.life.premium === undefined) ? '' : p.life.premium;
      if (propInp && !skipAutoOnce.prop[i]) propInp.value = (p.property.premium === null || p.property.premium === undefined) ? '' : p.property.premium;
      ['deathWan', 'planCode', 'label', 'hospitalWan', 'accidentMedicalWan'].forEach(function (fk) {
        var el = sec.querySelector('[data-k="plans.' + i + '.property.' + fk + '"]');
        if (el && p.property[fk] !== null && p.property[fk] !== undefined) el.value = p.property[fk];
      });
      var sel = sec.querySelector('[data-preset="' + i + '"]');
      if (sel && p.property.planCode) sel.value = p.property.planCode;
      var lt = sec.querySelector('[data-life-prem-tip="' + i + '"]');
      var pt = sec.querySelector('[data-prop-prem-tip="' + i + '"]');
      if (lt) { lt.textContent = p.life._premTip || ''; lt.className = 'hint' + (p.life._premAuto ? ' auto' : ''); }
      if (pt) { pt.textContent = p.property._premTip || ''; pt.className = 'hint' + (p.property._premAuto ? ' auto' : ''); }

      var c = TQ.computePlan(p, Q);
      function ph(key, val) {
        var el = sec.querySelector('[data-k="plans.' + i + '.' + key + '"]');
        if (el) el.placeholder = '自動：' + TQ.comma(val);
      }
      ph('life.oh1Wan', c.life.enabled ? c.life.oh1 / 10000 : TQ.num(p.life.at1Wan) * 0.1);
      ph('life.mrWan', c.life.enabled ? c.life.mr / 10000 : TQ.num(p.life.at1Wan) * 0.1);
      var pct = TQ.num(Q.lifeRegionPct || 100) / 100, oh1 = (TQ.isSet(p.life.oh1Wan) ? TQ.num(p.life.oh1Wan) : TQ.num(p.life.at1Wan) * 0.1) * 10000;
      ph('life.hospitalYuan', oh1 * pct); ph('life.outpatientYuan', oh1 * 0.03 * pct); ph('life.erYuan', oh1 * 0.06 * pct);
      ph('property.outpatientYuan', c.prop.outpatient); ph('property.erYuan', c.prop.er);
      sec.querySelector('.life-box').classList.toggle('off', !p.life.enabled);
      var lifeBadge = p.life._premAuto ? '🟢自動' : '✏️';
      var propBadge = p.property._premAuto ? '🟢自動' : '✏️';
      sec.querySelector('[data-sum="' + i + '"]').innerHTML =
        '<span>意外身故失能 <b>' + TQ.fmtYuan(c.death) + '</b></span>' +
        '<span>住院 <b>' + TQ.fmtYuan(c.hospital) + '</b></span>' +
        '<span>門診 <b>' + TQ.fmtYuan(c.outpatient) + '</b></span>' +
        '<span>急診 <b>' + TQ.fmtYuan(c.er) + '</b></span>' +
        '<span>意外醫療 <b>' + TQ.fmtYuan(c.accidentMedical) + '</b></span>' +
        '<span>保費 ' + lifeBadge + '壽<b>' + TQ.comma(c.life.premium) + '</b>＋' + propBadge + '產<b>' + TQ.comma(c.prop.premium) + '</b>＝<b>' + TQ.comma(c.premium) + '</b>元</span>';
    });
    var dh = document.getElementById('daysHint');
    var d = TQ.daysInclusive(Q.startDate, Q.endDate);
    dh.textContent = d ? ('依日期計算：' + d + ' 天（算頭算尾，出發日與回程日都算）') : '請填出發日與回程日（天數＝算頭算尾）';
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
        if (!TQ.isSet(p.life.premium)) add('err', n + '：人壽保費未填（' + (p.life._premTip || '請以 GPTA 試算') + '）。');
        else if (!p.life._premAuto) add('warn', n + '：人壽保費為手填／缺表。');
        else add('ok', n + '：人壽保費已自動帶入。');
      }
      if (!TQ.isSet(p.property.premium)) add('err', n + '：產險保費未填（' + (p.property._premTip || '') + '）。');
      else if (!p.property._premAuto) add('warn', n + '：產險保費非 DM 自動（' + (p.property._premTip || '手填') + '）。');
      else add('ok', n + '：產險保費已自動帶入（DM）。');
      if (!TQ.num(p.property.deathWan)) add('warn', n + '：產險意外身故失能未填。');
      if (!p.inconvenience.length) add('warn', n + '：沒有任何不便險項目。');
      p.inconvenience.concat(p.others).forEach(function (it) {
        if (!it.amount) add('warn', n + '：「' + (it.name || '未命名') + '」保額空白。');
      });
    });
    if (!out.some(function (x) { return x.indexOf('class="err"') >= 0; }) && !out.some(function (x) { return x.indexOf('class="warn"') >= 0; })) {
      /* keep ok lines */
    }
    document.getElementById('checks').innerHTML = '<h2>送出前檢查</h2><ul>' + out.join('') + '</ul>';
  }

  function scrubForSave(q) {
    var c = clone(q);
    (c.plans || []).forEach(function (p) {
      if (p.life) { delete p.life._premTip; delete p.life._premAuto; }
      if (p.property) {
        delete p.property._premTip; delete p.property._premAuto;
        delete p.property._covAuto; delete p.property._appliedCode;
      }
    });
    return c;
  }

  var saveTimer;
  function update() {
    refreshDerived();
    TQ.renderQuote(scrubForSave(Q), preview);
    checks();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(scrubForSave(Q))); } catch (e) {}
    }, 300);
    document.getElementById('sharePanel').hidden = true;
  }

  function load(q) {
    Q = normalize(clone(q));
    activePlan = 0;
    skipAutoOnce = { life: {}, prop: {} };
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
      plan.property.planCode = p.code;
      plan.property.label = p.label;
      plan.property.deathWan = p.deathWan;
      plan.property.hospitalWan = p.hospitalWan;
      plan.property.outpatientYuan = null;
      plan.property.erYuan = null;
      plan.property.accidentMedicalWan = p.accidentMedicalWan;
      plan.inconvenience = clone(p.inconvenience);
      plan.others = clone(p.others);
      plan.property._appliedCode = p.code;
      plan.property._covAuto = true;
      delete skipAutoOnce.prop[i];
      buildPlanUI(); update();
      var pr = TQ.lookupPropertyPremium(plan.property, Q.days, Q);
      toast(pr.found ? ('已帶入 ' + p.label + '，' + Q.days + ' 天保費 ' + TQ.comma(pr.premium) + ' 元') : (pr.tip || '已帶入保障'));
      return;
    }
    if (t.hasAttribute('data-k') && (t.type === 'checkbox' || t.tagName === 'SELECT')) {
      readInput(t);
      if (t.getAttribute('data-k') === 'schengen') { buildPlanUI(); return; }
      update();
    }
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


  document.getElementById('btnSummaryPng').addEventListener('click', function () {
    var btn = document.getElementById('btnSummaryPng');
    btn.disabled = true; btn.textContent = '產生中…';
    var clean = scrubForSave(Q);
    TQ_SUMMARY.downloadSummaryPng(clean).then(function (name) {
      toast('已下載 ' + name);
    }).catch(function (err) {
      alert('產生總表圖失敗：' + (err && err.message ? err.message : err));
    }).finally(function () {
      btn.disabled = false; btn.textContent = '🖼 下載三方案總表圖';
    });
  });

  document.getElementById('btnShare').addEventListener('click', function () {
    var clean = scrubForSave(Q);
    var url = TQ.shareUrl(clean);
    var panel = document.getElementById('sharePanel');
    document.getElementById('shareUrl').value = url;
    document.getElementById('btnOpen').href = url;
    var meta = '連結長度 ' + url.length + ' 字元。';
    if (/^file:/.test(url)) meta += ' <span class="warn">目前是本機檔案路徑（file://），客戶打不開；請先把網站放到靜態主機，再從該網址開啟編輯器產生連結。</span>';
    if (url.length > 4500) meta += ' <span class="warn">連結偏長，LINE 單則訊息上限約 5,000 字。</span>';
    if (Q.sample) meta += ' <span class="warn">此報價仍標示為「範例」。</span>';
    document.getElementById('shareMeta').innerHTML = meta;
    panel.hidden = false;
    try {
      var back = TQ.decodeHash(url.slice(url.indexOf('#')));
      if (JSON.stringify(back) !== JSON.stringify(clean)) throw new Error('mismatch');
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
    var blob = new Blob([JSON.stringify(scrubForSave(Q), null, 2)], { type: 'application/json' });
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
