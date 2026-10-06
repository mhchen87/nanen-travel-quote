/* 報價編輯器：填寫 → 即時預覽 → 下載三方案總表圖（草稿自動存在瀏覽器）
 * 產險保費：新快樂旅綜+ DM（天數 2～10）自動帶入；人壽保費：life-rates.js 精確相符才自動帶入。
 */
(function () {
  'use strict';
  var STORE_KEY = 'tq-editor-draft-v2';
  var STORE_KEY_LEGACY = 'tq-editor-draft-v1';
  /** 草稿結構版：選單保額／AT1 100萬刻度；舊稿需 migrate */
  var DRAFT_VERSION = 2;
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
  /** 使用者手動改過申根勾選；目的地再變時重置，改回依目的地自動 */
  var schengenManual = false;
  /** 舊分享連結／草稿只有天數、沒有出發回程日 → 沿用其天數（直到使用者填日期） */
  var keptLinkDays = false;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) { return TQ.esc(s); }
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2200);
  }

  function snapAt1(n) {
    n = Number(n);
    if (!isFinite(n) || n <= 0) return null;
    n = Math.round(n / 100) * 100;
    if (n < 100) n = 100;
    if (n > 2000) n = 2000;
    return n;
  }
  function snapDeath(n, schengen) {
    var opts = schengen ? [200, 300, 500, 1000, 1500] : [200, 300, 500, 1000];
    n = Number(n);
    if (opts.indexOf(n) >= 0) return n;
    if (!isFinite(n) || n <= 0) return null;
    var best = opts[0];
    opts.forEach(function (o) { if (Math.abs(o - n) < Math.abs(best - n)) best = o; });
    return best;
  }
  /** 舊 localStorage 草稿 → 新選單結構；丟掉會卡住 UI 的 planCode */
  function migrateDraft(q) {
    if (!q || typeof q !== 'object') return null;
    q = clone(q);
    var ver = Number(q._draftVersion || 0);
    var sch = !!q.schengen;
    if (!q.plans) q.plans = [];
    for (var i = 0; i < 3; i++) {
      if (!q.plans[i]) continue;
      var p = q.plans[i];
      p.life = p.life || {};
      p.property = p.property || {};
      // 清掉舊 planCode，改由保額對應 P1/P2，避免蓋回 select
      if (p.property.planCode) p.property.planCode = '';
      p.property._appliedCode = null;
      var defDeath = [500, 300, 300][i];
      var d = snapDeath(p.property.deathWan, sch);
      p.property.deathWan = d != null ? d : defDeath;
      if (p.life.enabled !== false && i < 2) {
        var a = snapAt1(p.life.at1Wan);
        p.life.at1Wan = a != null ? a : [500, 300][i];
      }
    }
    q._draftVersion = DRAFT_VERSION;
    return q;
  }
  function readStoredDraft() {
    var raw = null, fromLegacy = false;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) {}
    if (!raw) {
      try { raw = localStorage.getItem(STORE_KEY_LEGACY); fromLegacy = !!raw; } catch (e2) {}
    }
    if (!raw) return null;
    var q;
    try { q = JSON.parse(raw); } catch (e3) { return null; }
    if (!q || typeof q !== 'object') return null;
    var ver = Number(q._draftVersion || 0);
    if (ver < DRAFT_VERSION || fromLegacy) {
      q = migrateDraft(q);
      try {
        localStorage.removeItem(STORE_KEY_LEGACY);
        if (q) localStorage.setItem(STORE_KEY, JSON.stringify(q));
      } catch (e4) {}
    }
    return q;
  }

  function blankPlan(i) {
    var tag = ['雙實支＋醫療額度高＋不便險', '雙實支保障＋不便險', '基本保障＋不便險'][i] || '';
    var codes = ['P1-G500', 'P1-G300', 'P1-G300'];
    return {
      name: '方案' + '一二三'[i], tagline: tag, recommended: i === 0,
      life: { enabled: i < 2, at1Wan: [500, 300, null][i], childOh1Wan: 60, oh1Wan: null, mrWan: null, oaa: true, hospitalYuan: null, outpatientYuan: null, erYuan: null, premium: null },
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
    q.agent = q.agent || { unit: '南恩通訊處', name: '陳銘旭', title: '業務經理' };
    // 簽名不再列處經理（舊稿／舊連結一併移除）
    delete q.agent.manager; delete q.agent.managerTitle;
    var domesticDest = !!TQ.detectDomestic(q.destination);
    if (!q.lifeRegionPct) q.lifeRegionPct = domesticDest ? 100 : TQ.guessRegionPct(q.destination);
    if (!q.dateFormat) q.dateFormat = 'roc';
    if (!q.lifeRateType) q.lifeRateType = 'agency';
    // 年齡（足歲）：舊稿沒有 → null（編輯器會要求填寫才可產生報價）；年齡帶依年齡自動
    if (q.age === undefined || q.age === '') q.age = null;
    var ai0 = TQ.ageInfo(q.age);
    if (ai0.valid) q.ageBand = ai0.band;
    if (!q.ageBand) q.ageBand = '18-65';
    if (typeof q.schengen !== 'boolean') q.schengen = false;
    if (!q.lifeRegion) {
      q.lifeRegion = q.schengen ? 'other' : (domesticDest ? 'asia14' : ((window.LIFE_RATES && LIFE_RATES.guessLifeRegion(q.destination)) || 'asia14'));
    }
    // 方案一／二預設含人壽；方案三不含
    q.plans.forEach(function (p, idx) {
      if (p.life && typeof p.life.enabled !== 'boolean') p.life.enabled = idx < 2;
      if (p.life && TQ.CHILD_OH1_OPTIONS.indexOf(Number(p.life.childOh1Wan)) < 0) p.life.childOh1Wan = 60;
      if (q.schengen && p.life && p.life.enabled) p.life.oaa = false;
      // 對齊 select 可選值
      var sd = snapDeath(p.property.deathWan, !!q.schengen);
      if (sd != null) p.property.deathWan = sd;
      else if (!TQ.num(p.property.deathWan)) p.property.deathWan = [500, 300, 300][idx];
      if (p.life && p.life.enabled) {
        var sa = snapAt1(p.life.at1Wan);
        if (sa != null) p.life.at1Wan = sa;
        else if (!TQ.num(p.life.at1Wan)) p.life.at1Wan = [500, 300][idx];
      }
    });
    q._draftVersion = DRAFT_VERSION;
    return q;
  }



  function setSchengenHint(showAuto) {
    var el = document.getElementById('schengenAutoHint');
    if (!el) return;
    if (showAuto && Q.schengen) {
      el.hidden = false;
      el.textContent = '已依目的地自動勾選申根';
    } else if (!Q.schengen && !schengenManual && Q.destination && !TQ.detectSchengen(Q.destination)) {
      el.hidden = true;
      el.textContent = '';
    } else {
      el.hidden = true;
    }
  }
  /* ---------- 國內地點（台灣／金門／馬祖／澎湖…）→ 警告＋擋報價 ---------- */
  function isDomesticDest() { return !!TQ.detectDomestic(Q && Q.destination); }
  /* ---------- 天數：只依出發／回程日自動計算（算頭算尾），無手填欄位 ---------- */
  function dateState() {
    var s = TQ.parseDateParts(Q.startDate), e = TQ.parseDateParts(Q.endDate);
    if (s && e) {
      var d = TQ.daysInclusive(Q.startDate, Q.endDate);
      if (!d) return { days: null, error: '⚠ 回程日早於出發日，請確認日期' };
      return { days: d };
    }
    if (keptLinkDays && !s && !e && TQ.num(Q.days) > 0) return { days: Number(Q.days), kept: true, missing: true };
    return { days: null, missing: true };
  }
  /** 依日期同步 Q.days；有變動時恢復保費自動查表 */
  function syncDaysFromDates() {
    var st = dateState();
    var nd = st.days == null ? null : st.days;
    if ((Q.days == null ? null : Number(Q.days)) !== nd) {
      Q.days = nd;
      skipAutoOnce.life = {}; skipAutoOnce.prop = {};
    }
    return st;
  }
  function updateDaysDisplay(st) {
    st = st || dateState();
    var v = document.getElementById('daysAutoVal'), w = document.getElementById('dateWarn');
    var txt = '', warn = '', soft = false;
    if (st.error) warn = st.error;
    else if (st.days) {
      txt = '共 ' + st.days + ' 天' + (st.kept ? '（沿用原報價天數；請補填出發／回程日）' : '（算頭算尾）');
      if (st.days > 30) { soft = true; warn = '⚠ 自動費率僅涵蓋 1～30 天，目前 ' + st.days + ' 天：超出範圍的保費請以 GPTA／產險試算後手填'; }
    }
    if (v) v.textContent = txt;
    if (w) { w.hidden = !warn; w.textContent = warn; w.classList.toggle('soft', soft); }
    ['startDate', 'endDate'].forEach(function (k) {
      var el = form.querySelector('[data-k="' + k + '"]');
      if (el) el.classList.toggle('is-domestic', !!st.error);
    });
  }

  /* ---------- 業務員姓名（使用紀錄用；不寫入報價資料、不顯示在報價圖／客戶頁） ---------- */
  var USER_UNIT = '南恩通訊處'; // 單位：固定，不可修改
  var USER_FIELDS = [{ id: 'userName', key: 'tq-user-name', label: '業務員姓名' }, { id: 'userTitle', key: 'tq-user-title', label: '職稱' }];
  function userVal(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }
  function getUserName() { return userVal('userName'); }
  function getUserTitle() { return userVal('userTitle'); }
  function missingUserFields() {
    return USER_FIELDS.filter(function (f) { return !userVal(f.id); });
  }
  function userBlockerMsg() {
    var miss = missingUserFields();
    return miss.length ? '⚠ 請先填寫最上方「' + miss.map(function (f) { return f.label; }).join('」「') + '」（內部使用紀錄用，不會出現在報價圖）' : '';
  }
  function updateUserWarning() {
    var miss = missingUserFields(), w = document.getElementById('userWarn');
    if (w) {
      w.hidden = !miss.length;
      w.textContent = miss.length ? '⚠ 必填：請輸入' + miss.map(function (f) { return f.label; }).join('、') + '（只需填一次，本機會記住）' : '';
    }
    USER_FIELDS.forEach(function (f) {
      var el = document.getElementById(f.id); if (!el) return;
      var bad = !el.value.trim();
      el.classList.toggle('is-domestic', bad); el.setAttribute('aria-invalid', bad ? 'true' : 'false');
    });
  }
  (function initUserFields() {
    USER_FIELDS.forEach(function (f) {
      var el = document.getElementById(f.id);
      if (!el) return;
      try { el.value = localStorage.getItem(f.key) || ''; } catch (e) {}
      el.addEventListener('input', function () {
        try {
          var v = el.value.trim();
          if (v) localStorage.setItem(f.key, v); else localStorage.removeItem(f.key);
        } catch (e) {}
        updateDomesticWarning();
        checks();
      });
    });
  })();
  /** 下載成功後送使用紀錄（fire-and-forget） */
  function logSummaryDownload(q) {
    try {
      if (!window.TQ_LOG || !TQ_LOG.enabled) return;
      var ai = TQ.ageInfo(q.age);
      TQ_LOG.logDownload({
        unit: USER_UNIT, name: getUserName(), title: getUserTitle(), destination: q.destination || '', days: q.days || '',
        startDate: q.startDate || '', endDate: q.endDate || '',
        age: ai.valid ? ai.age : '', ageBand: ai.valid ? ai.label : '',
        plans: (q.plans || []).map(function (p, i) {
          var c = TQ.computePlan(p, q);
          return { name: p.name || ('方案' + (i + 1)),
            life: c.lifePremiumMissing ? '未填' : c.life.premium, prop: c.prop.premium,
            total: c.lifePremiumMissing ? '未完成' : c.premium };
        })
      });
    } catch (e) {}
  }

  /** 擋下產生報價的問題（國內目的地、日期未填／回程早於出發、年齡未填／無效、AT1 超過年齡上限、產險方案不符 DM 投保年齡） */
  function quoteBlockers() {
    var out = [];
    if (missingUserFields().length) out.push(userBlockerMsg());
    if (isDomesticDest()) out.push(TQ.DOMESTIC_WARNING);
    var ds = dateState();
    if (ds.error) out.push(ds.error);
    else if (ds.missing) out.push('⚠ 請填寫出發日與回程日（天數依日期自動計算）');
    var ai = TQ.ageInfo(Q && Q.age);
    if (!ai.valid) { out.push('⚠ ' + ai.error); return out; }
    Q.plans.forEach(function (p, i) {
      var n = p.name || ('方案' + (i + 1));
      if (p.life && p.life.enabled && !ai.child && TQ.num(p.life.at1Wan) > ai.at1Max) {
        out.push('⚠ ' + n + '：人壽 AT1 ' + p.life.at1Wan + ' 萬超過「' + ai.label + '」上限 ' + ai.at1Max + ' 萬，請調降');
      }
      var pre = TQ.resolvePropertyPreset(p.property, Q);
      var ac = TQ.propertyAgeCheck(pre, Q);
      if (!ac.ok) out.push('⚠ ' + n + '：產險' + ac.tip);
    });
    return out;
  }
  /** 年齡欄提示（紅字＝必填／無效；橘字＝80歲以上無產險方案；藍字＝年齡帶與上限） */
  function updateAgeWarning() {
    var ai = TQ.ageInfo(Q.age);
    var w = document.getElementById('ageWarn'), hint = document.getElementById('ageHint');
    var inp = form.querySelector('[data-k="age"]');
    var msg = '', soft = false, note = '';
    if (!ai.valid) {
      msg = '⚠ ' + ai.error;
    } else {
      if (ai.child) {
        note = '未滿15歲人壽主約為兒童傷害醫療旅平險 MRC 60萬，不提供AT1（OH1 可選 60／120萬＋OAA）；產險改新快樂旅綜+ 兒童方案（DM：未滿15足歲無意外死亡喪葬費用保險金）';
      } else {
        note = 'GPTA 年齡帶：' + ai.label + '｜人壽 AT1 上限 ' + ai.at1Max + ' 萬' +
          '｜產險可選：' + propertyDeathOptionsFor(ai).map(function (x) { return x + '萬'; }).join('／');
      }
      if (!ai.child && ai.age >= 66) {
        note += '（66歲以上人壽保費同 18～65，僅 AT1 上限不同）';
        if (ai.age >= 80) { soft = true; msg = '⚠ ' + ai.label + '：產險新快樂旅綜+ 投保年齡最高 79 歲，無可投保方案'; }
      } else if (ai.band === '15-17') {
        note += '（15～17歲費率同 18～65；產險 1000萬以上、租車限 18 歲以上）';
      }
    }
    if (w) { w.hidden = !msg; w.textContent = msg; w.classList.toggle('soft', soft); }
    if (hint) { hint.textContent = note; hint.className = note ? 'age-note' : 'hint'; }
    if (inp) { inp.classList.toggle('is-domestic', !ai.valid); inp.setAttribute('aria-invalid', ai.valid ? 'false' : 'true'); }
  }
  /** 顯示／隱藏目的地紅字警告與年齡提示，並鎖定「下載三方案總表圖」 */
  function updateDomesticWarning() {
    var dom = isDomesticDest();
    var w = document.getElementById('destWarn');
    if (w) { w.hidden = !dom; w.textContent = dom ? TQ.DOMESTIC_WARNING : ''; }
    var inp = form.querySelector('[data-k="destination"]');
    if (inp) { inp.classList.toggle('is-domestic', dom); inp.setAttribute('aria-invalid', dom ? 'true' : 'false'); }
    updateAgeWarning();
    updateUserWarning();
    var bl = quoteBlockers();
    ['btnSummaryPng'].forEach(function (id) {
      var b = document.getElementById(id);
      if (!b) return;
      b.classList.toggle('is-blocked', bl.length > 0);
      b.setAttribute('aria-disabled', bl.length ? 'true' : 'false');
      if (bl.length) b.title = bl.join('\n'); else b.removeAttribute('title');
    });
    if (dom) setSchengenHint(false);
    return dom;
  }
  /** 有任何擋報價問題時擋下下載總表圖；回傳 true 表示已擋 */
  function blockIfDomestic() {
    var bl = quoteBlockers();
    if (!bl.length) return false;
    updateDomesticWarning();
    alert(bl.join('\n'));
    var focusKey = isDomesticDest() ? 'destination' : (!TQ.ageInfo(Q.age).valid ? 'age' : null);
    var mUser = missingUserFields()[0];
    var inp = mUser ? document.getElementById(mUser.id) : (focusKey && form.querySelector('[data-k="' + focusKey + '"]'));
    if (inp) inp.focus();
    return true;
  }

  /** 依目的地自動勾／取消申根；手動覆寫期間不改 */
  function syncSchengenFromDestination() {
    if (schengenManual) { setSchengenHint(false); return false; }
    // 國內地點：不依此文字自動分類（申根／地區）
    if (isDomesticDest()) { setSchengenHint(false); return false; }
    var want = TQ.detectSchengen(Q.destination);
    var cb = form.querySelector('[data-k="schengen"]');
    if (want === !!Q.schengen) {
      setSchengenHint(want);
      if (cb) cb.checked = !!Q.schengen;
      return false;
    }
    applySchengenMode(want);
    if (cb) cb.checked = want;
    setSchengenHint(want);
    return true; // 呼叫端應 rebuild
  }

  function applySchengenMode(on) {
    Q.schengen = !!on;
    if (on) {
      Q.lifeRegion = 'other';
      // 申根／歐洲：依目的地套 DM 註3（歐洲＝200%；若判不到則預設 200%）
      Q.lifeRegionPct = TQ.guessRegionPct(Q.destination) || 200;
      if (Number(Q.lifeRegionPct) === 100) Q.lifeRegionPct = 200;
      Q.plans.forEach(function (p) {
        if (p.life && p.life.enabled) {
          p.life.oaa = false;
          // 離線表無「國外其他」費率 → 清掉自動壽險保費，改手填
          if (p.life._premAuto || true) { p.life.premium = null; p.life._premAuto = false; }
        }
        // 對齊申根可選保額
        if ([200, 300, 500, 1000, 1500].indexOf(Number(p.property.deathWan)) < 0) p.property.deathWan = 500;
        p.property._appliedCode = null; // 強制改套 P2
        if (p.property.planCode && /^P1-G/.test(p.property.planCode)) p.property.planCode = '';
      });
    } else {
      Q.lifeRegion = (window.LIFE_RATES && LIFE_RATES.guessLifeRegion(Q.destination)) || 'asia14';
      Q.lifeRegionPct = TQ.guessRegionPct(Q.destination);
      Q.plans.forEach(function (p) {
        if (p.life && p.life.enabled) p.life.oaa = (Q.lifeRegion === 'asia14');
        // 非申根無 1500 → 對齊最近檔
        var d = Number(p.property.deathWan);
        if ([200, 300, 500, 1000].indexOf(d) < 0) {
          p.property.deathWan = (d >= 750 ? 1000 : (d >= 400 ? 500 : (d >= 250 ? 300 : 200)));
        }
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
      plan.property._premTip = Q.schengen
        ? '尚無對應產險方案（申根請選 200／300／500／1000／1500）'
        : '尚無對應產險方案（請選 200／300／500／1000，或用進階下拉）';
      plan.property._covAuto = false;
      return false;
    }
    var changed = plan.property._appliedCode !== preset.code
      || !plan.inconvenience || !plan.inconvenience.length
      || !plan.others || !plan.others.length;
    plan.property.planCode = preset.code;
    plan.property.label = preset.label;
    if (!preset.child) plan.property.deathWan = preset.deathWan; // 兒童方案無身故：保留成人保額以便改回年齡時還原
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
        } else if (pr.ageBlocked) {
          p.property.premium = null;
          p.property._premTip = pr.tip;
          p.property._premAuto = false;
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
          if (p.life._premAuto || lr.overCap || lr.noRates) p.life.premium = null;
          p.life._premTip = (Q.schengen && !lr.overCap && !lr.noRates && TQ.ageInfo(Q.age).valid !== false)
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
    var attrs = '';
    if (opts.type !== 'text') {
      attrs += ' inputmode="numeric"';
      attrs += ' min="' + (opts.min != null ? opts.min : 0) + '"';
      if (opts.max != null) attrs += ' max="' + opts.max + '"';
      attrs += ' step="' + (opts.step != null ? opts.step : 'any') + '"';
    }
    return '<label>' + esc(label) + '<input type="' + (opts.type || 'number') + '" data-k="' + key + '"' + attrs +
      (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : '') + '>' +
      (opts.hint ? '<span class="hint' + (opts.auto ? ' auto' : '') + '" data-hint="' + key + '">' + esc(opts.hint) + '</span>' : '') + '</label>';
  }
  /** DM 固定產險保額（一般 G）；申根＝計畫二另有 1500 */
  function propertyDeathOptions() {
    return Q.schengen ? [200, 300, 500, 1000, 1500] : [200, 300, 500, 1000];
  }
  /** 依 DM 投保年齡過濾可選產險保額（一般 G 方案 ageMin～ageMax） */
  function propertyDeathOptionsFor(ai) {
    var all = propertyDeathOptions();
    if (!ai || !ai.valid || ai.child) return all;
    var pre = Q.schengen ? 'P2-G' : 'P1-G';
    return all.filter(function (d) {
      var x = PRESETS.filter(function (p) { return p.code === pre + d; })[0];
      return !x || x.ageMin == null || (ai.age >= x.ageMin && ai.age <= x.ageMax);
    });
  }
  /** 選單選項：可選者正常顯示；目前值若不符年齡則附上「超過上限」選項以便看見並警告 */
  function withCurrent(opts, cur, overLabel) {
    var out = opts.map(function (v) { return { value: v, label: v + ' 萬' }; });
    var n = Number(cur);
    if (cur != null && cur !== '' && isFinite(n) && opts.indexOf(n) < 0) out.push({ value: n, label: n + ' 萬（' + overLabel + '）' });
    return out;
  }
  function selectField(label, key, options, opts) {
    opts = opts || {};
    var h = '<label>' + esc(label) + '<select data-k="' + key + '" data-num="1">';
    if (opts.blank) h += '<option value="">—</option>';
    options.forEach(function (o) {
      var val = (o && typeof o === 'object') ? o.value : o;
      var lab = (o && typeof o === 'object') ? o.label : (o + ' 萬');
      h += '<option value="' + esc(String(val)) + '">' + esc(String(lab)) + '</option>';
    });
    h += '</select>';
    if (opts.hint) h += '<span class="hint' + (opts.auto ? ' auto' : '') + '" data-hint="' + key + '">' + esc(opts.hint) + '</span>';
    h += '</label>';
    return h;
  }
  function at1Options(cap) {
    var out = [];
    var max = Math.min(2000, cap || 2000);
    for (var n = 100; n <= max; n += 100) out.push(n);
    return out;
  }
  function presetOptions(selected) {
    var h = '<option value="">— 選擇方案帶入（新快樂旅綜+ 115.04 DM）—</option>';
    var ai = TQ.ageInfo(Q.age);
    PRESETS.forEach(function (p) {
      var ok = !ai.valid || p.ageMin == null || (ai.age >= p.ageMin && ai.age <= p.ageMax);
      h += '<option value="' + esc(p.code) + '"' + (selected === p.code ? ' selected' : '') + (ok ? '' : ' disabled') + '>' +
        esc(p.label + '（' + p.ageLabel + '）' + (ok ? '' : '｜年齡不符')) + '</option>';
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
    var ai = TQ.ageInfo(Q.age);
    var child = TQ.isChildQuote(Q);
    var h = '<section class="ed-card plan-form" data-plan="' + i + '"' + (i === activePlan ? '' : ' hidden') + '>';
    h += '<h2>' + esc(plan.name || ('方案' + (i + 1))) +
      (plan.recommended ? ' <span class="reco-badge" style="font-size:13px">推薦</span>' : '') + '</h2>';
    h += '<p class="plan-simple-hint">' + (hasLife
      ? '此方案只需填：人壽保額、產險保額（其餘自動）'
      : '此方案只需填：產險保額（純產險，無人壽）') +
      (Q.schengen ? '　｜已勾選申根→產險用計畫二（突發疾病 150萬）' : '') + '</p>';

    h += '<div class="grid g2">';
    if (hasLife && child) {
      h += selectField('人壽 OH1 海外突發疾病（萬）', b + 'life.childOh1Wan',
        TQ.CHILD_OH1_OPTIONS.map(function (v) { return { value: v, label: v + ' 萬' + (v === 60 ? '（預設）' : '（醫療加值）') }; }), {
        hint: '未滿15歲人壽主約為兒童傷害醫療旅平險 MRC 60萬，不提供AT1；無 MR；OAA 同成人', auto: true
      });
    } else if (hasLife) {
      var cap = ai.valid ? ai.at1Max : 2000;
      h += selectField('人壽保額 AT1（萬）', b + 'life.at1Wan', withCurrent(at1Options(cap), plan.life.at1Wan, '超過年齡上限 ' + cap + ' 萬'), {
        hint: (ai.valid ? ai.label + '：AT1 100～' + cap + ' 萬' : '以 100 萬為單位（100～2000）') + '；OH1／MR＝AT1×10%' +
          '，保費自動查表', auto: true
      });
    }
    if (child) {
      h += '<label>產險方案<input type="text" readonly value="' + esc(Q.schengen || plan.property.planCode === 'P2-CHILD' ? '計畫二 兒童醫療加值（P2-CHILD）' : '計畫一 兒童國外（P1-CHILD）') + '">' +
        '<span class="hint auto">未滿15足歲只能投保兒童方案；DM：無意外死亡之喪葬費用保險金（身故及失能「-」）</span></label>';
    } else {
      h += selectField('產險保額（萬）', b + 'property.deathWan', withCurrent(propertyDeathOptionsFor(ai), plan.property.deathWan, '不符 DM 投保年齡'), {
        hint: Q.schengen ? '計畫二 P2-G*（突發疾病住院 150萬）' : '計畫一 P1-G*',
        auto: true
      });
    }
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
      (child ? '' : field('OH1（萬）', b + 'life.oh1Wan', { hint: '空白＝AT1×10%', auto: true }) +
        field('MR（萬）', b + 'life.mrWan', { hint: '空白＝AT1×10%', auto: true })) +
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
    else if (el.type === 'number' || (el.tagName === 'SELECT' && (k === 'lifeRegionPct' || el.getAttribute('data-num') === '1'))) {
      v = el.value === '' ? null : Number(el.value);
      if (v !== null && !isFinite(v)) v = null;
    } else v = el.value;
    // AT1：對齊 100 萬刻度（100～2000）
    if (/\.life\.at1Wan$/.test(k) && v != null) {
      v = Math.round(v / 100) * 100;
      if (v < 100) v = 100;
      if (v > 2000) v = 2000;
      if (el.tagName === 'SELECT' || el.type === 'number') el.value = String(v);
    }
    setPath(Q, k, v);

    // 手動改保費 → 跳過自動覆寫
    var mLife = /^plans\.(\d+)\.life\.premium$/.exec(k);
    var mProp = /^plans\.(\d+)\.property\.premium$/.exec(k);
    if (mLife) { skipAutoOnce.life[Number(mLife[1])] = true; Q.plans[Number(mLife[1])].life._premAuto = false; }
    if (mProp) { skipAutoOnce.prop[Number(mProp[1])] = true; Q.plans[Number(mProp[1])].property._premAuto = false; }

    // 改關鍵欄位 → 恢復自動
    if (k === 'age') {
      var aiR = TQ.ageInfo(v);
      if (aiR.valid) {
        Q.ageBand = aiR.band;
        var abSel = form.querySelector('[data-k="ageBand"]');
        if (abSel) abSel.value = aiR.band;
      }
    }
    if (k === 'age' || k === 'startDate' || k === 'endDate' || k === 'ageBand' || k === 'lifeRegion' || k === 'lifeRateType' || k === 'destination' || k === 'schengen') {
      skipAutoOnce.life = {}; skipAutoOnce.prop = {};
    }
    if (k === 'schengen') {
      schengenManual = true;
      applySchengenMode(!!v);
      setSchengenHint(false); // 手動 → 不顯示自動提示
    }
    var mAt = /^plans\.(\d+)\.life\.(at1Wan|childOh1Wan|oh1Wan|mrWan|oaa|enabled)$/.exec(k);
    if (mAt) delete skipAutoOnce.life[Number(mAt[1])];
    var mPc = /^plans\.(\d+)\.property\.(planCode|deathWan|hospitalWan)$/.exec(k);
    if (mPc) {
      var pi = Number(mPc[1]);
      delete skipAutoOnce.prop[pi];
      // 保額或方案變了 → 強制重套不便險／保障；改保額時清掉舊 planCode 以免蓋回
      if (mPc[2] === 'deathWan') {
        Q.plans[pi].property._appliedCode = null;
        Q.plans[pi].property.planCode = '';
      } else if (mPc[2] === 'planCode') {
        Q.plans[pi].property._appliedCode = null;
      }
    }

    if (k === 'startDate' || k === 'endDate') {
      keptLinkDays = false; // 已開始填日期 → 天數一律依日期
      syncDaysFromDates();
    }
    if (k === 'destination' && isDomesticDest()) {
      // 國內地點（台灣／金門／馬祖／澎湖…）：顯示警告，不依此文字自動判斷申根／地區
      schengenManual = false;
      updateDomesticWarning();
    } else if (k === 'destination') {
      // 目的地變更 → 重新依地名自動申根（取消先前手動覆寫）
      schengenManual = false;
      syncSchengenFromDestination();
      // 人壽 OH1 地區比例：一律依目的地重判（申根模式若仍 100% 會在 applySchengenMode 抬到 200%）
      var g = TQ.guessRegionPct(Q.destination);
      if (Q.schengen && Number(g) === 100) g = 200;
      if (g !== Q.lifeRegionPct) { Q.lifeRegionPct = g; form.querySelector('[data-k="lifeRegionPct"]').value = g; }
      else {
        var lpEl = form.querySelector('[data-k="lifeRegionPct"]');
        if (lpEl) lpEl.value = Q.lifeRegionPct;
      }
      // 人壽地區：若已（自動）申根，applySchengenMode 已設 other；否則依目的地猜
      if (!Q.schengen) {
        if (window.LIFE_RATES) {
          var lr = LIFE_RATES.guessLifeRegion(Q.destination);
          Q.lifeRegion = lr;
          var sel = form.querySelector('[data-k="lifeRegion"]');
          if (sel) sel.value = lr;
        }
      } else {
        var sel2 = form.querySelector('[data-k="lifeRegion"]');
        if (sel2) sel2.value = Q.lifeRegion;
      }
    }
    if (/\.name$/.test(k) && /^plans\.\d+\.name$/.test(k)) {
      var i = Number(k.split('.')[1]);
      planTabs.children[i].textContent = Q.plans[i].name || ('方案' + (i + 1));
    }
  }

  function refreshDerived() {
    // 起迄日 → 天數（算頭算尾）；必須在保費查表前更新
    var dsNow = syncDaysFromDates();
    updateDaysDisplay(dsNow);
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
    document.getElementById('regionHint').textContent = isDomesticDest()
      ? '目的地為台灣國內地點，暫不自動判斷地區；請改填出國目的地'
      : '依目的地自動判斷，可手動調整（Go安行 DM 註3）';
  }

  function checks() {
    var out = [];
    function add(cls, msg) { out.push('<li class="' + cls + '">' + esc(msg) + '</li>'); }
    if (Q.sample) add('err', '目前標示為「範例資料」— 傳給客戶前請取消勾選並確認所有金額。');
    if (!Q.destination) add('warn', '尚未填寫目的地。');
    quoteBlockers().forEach(function (m) { add('err', m + '（目前無法下載三方案總表圖）'); });
    var aiC = TQ.ageInfo(Q.age);
    if (aiC.valid && aiC.child) add('ok', '未滿15足歲：人壽為兒童傷害醫療旅平險 MRC 60萬＋OH1＋OAA（無 AT1／MR）；產險為兒童方案。');
    var dsC = dateState();
    if (dsC.days > 30) add('warn', '共 ' + dsC.days + ' 天：自動費率僅涵蓋 1～30 天，超出範圍的保費請以 GPTA／產險試算後手填。');
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
    c._draftVersion = DRAFT_VERSION;
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
    updateDomesticWarning();
    refreshDerived();
    TQ.renderQuote(scrubForSave(Q), preview);
    checks();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        var payload = JSON.stringify(scrubForSave(Q));
        localStorage.setItem(STORE_KEY, payload);
        localStorage.removeItem(STORE_KEY_LEGACY);
      } catch (e) {}
    }, 300);
  }

  function load(q) {
    Q = normalize(clone(q));
    // 舊連結／草稿：有天數但無出發回程日 → 沿用其天數；有日期則一律依日期重算
    keptLinkDays = !!(q && TQ.num(q.days) > 0 && !TQ.parseDateParts(q.startDate) && !TQ.parseDateParts(q.endDate));
    activePlan = 0;
    skipAutoOnce = { life: {}, prop: {} };
    schengenManual = false;
    Array.prototype.forEach.call(form.querySelectorAll('.ed-card:not(.plan-form)'), function (c) { fillInputs(c); });
    // 載入時若 JSON 未顯式設 schengen，依目的地補一次；已顯式 true/false 則尊重資料
    if (q && typeof q.schengen === 'boolean') {
      setSchengenHint(false);
    } else {
      syncSchengenFromDestination();
    }
    buildPlanUI();
    update();
  }

  /* ---------- 事件 ---------- */
  form.addEventListener('input', function (e) {
    // SELECT 改由 change 處理，避免 input+change 雙觸發重建
    if (e.target.tagName === 'SELECT') return;
    if (e.target.hasAttribute('data-k')) {
      readInput(e.target);
      if (e.target.getAttribute('data-k') === 'destination' || e.target.getAttribute('data-k') === 'age') {
        // syncSchengenFromDestination 可能已改模式／年齡改變可選保額 → 重建方案表單
        buildPlanUI();
        update();
        return;
      }
      update();
    }
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
      if (!p.child) plan.property.deathWan = p.deathWan; // 兒童方案無身故：保留成人保額
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
    if (blockIfDomestic()) return;
    var btn = document.getElementById('btnSummaryPng');
    btn.disabled = true; btn.textContent = '產生中…';
    var clean = scrubForSave(Q);
    TQ_SUMMARY.downloadSummaryPng(clean).then(function (name) {
      toast('已下載 ' + name);
      logSummaryDownload(clean);
    }).catch(function (err) {
      alert('產生總表圖失敗：' + (err && err.message ? err.message : err));
    }).finally(function () {
      btn.disabled = false; btn.textContent = '🖼 下載三方案總表圖';
    });
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
  if (!initial) initial = readStoredDraft();
  load(initial || window.SAMPLE_QUOTE);
  // 開啟紀錄（未設定 USAGE_LOG_URL 時自動略過）
  try { if (window.TQ_LOG) TQ_LOG.logOpen('editor', { unit: USER_UNIT, name: getUserName(), title: getUserTitle() }); } catch (e) {}
})();
