/* 旅平險三方案報價 — 共用函式（計算、格式化、分享連結編解碼、方案卡片渲染）
 * 純前端、無需建置。index.html 與 editor.html 共用。
 */
(function (global) {
  'use strict';

  /* ---------- 品牌（客戶頁頁首、總表圖）：大心 logo＋兩行標題；不含「內部使用」標記 ---------- */
  var ASSET_V = (function () {
    try { var m = /[?&]v=([^&#]+)/.exec((document.currentScript && document.currentScript.src) || ''); return m ? m[1] : ''; } catch (e) { return ''; }
  })();
  var BRAND = {
    slogan: '台南最大心，服務最用心',
    title: '旅平險組合方案試算報價系統',
    logo: 'img/logo.png' + (ASSET_V ? '?v=' + ASSET_V : ''),
    logoAlt: '南恩通訊處 大心'
  };
  // 預先載入 logo（總表圖下載時不會出現空白 logo）
  var brandLogoReady = (typeof Image === 'undefined') ? Promise.resolve() : new Promise(function (resolve) {
    var im = new Image();
    im.onload = im.onerror = function () { resolve(); };
    im.src = BRAND.logo;
  });
  function renderBrand(prefix) {
    prefix = prefix || 'brand';
    return '<div class="' + prefix + '-bar"><img class="' + prefix + '-logo" src="' + BRAND.logo + '" alt="' + BRAND.logoAlt + '" width="40" height="57">' +
      '<div class="' + prefix + '-text"><div class="' + prefix + '-slogan">' + BRAND.slogan + '</div>' +
      '<div class="' + prefix + '-title">' + BRAND.title + '</div></div></div>';
  }

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

  /** 目的地關鍵字比對（中文子字串；英文忽略大小寫） */
  function textHasKeyword(dest, list) {
    var t = String(dest || '').trim();
    if (!t) return false;
    var low = t.toLowerCase();
    for (var i = 0; i < list.length; i++) {
      var k = list[i];
      if (!k) continue;
      if (/[a-z]/i.test(k)) {
        if (low.indexOf(k.toLowerCase()) >= 0) return true;
      } else if (t.indexOf(k) >= 0) return true;
    }
    return false;
  }

  // Go安行 DM 註3：美加 350%；日本／歐洲／紐澳／南韓 200%（含城市與非申根歐洲：英國／愛爾蘭／賽普勒斯）
  var REGION_350 = [
    '美國', '美国', 'usa', 'u.s.a', 'u.s.', 'united states', 'america',
    '加拿大', 'canada', '美加',
    '夏威夷', 'hawaii', '關島', '关岛', 'guam', '阿拉斯加', 'alaska',
    '紐約', '纽约', 'new york', '洛杉磯', '洛杉矶', 'los angeles',
    '舊金山', '旧金山', 'san francisco', '拉斯維加斯', '拉斯维加斯', 'las vegas',
    '西雅圖', '西雅图', 'seattle', '芝加哥', 'chicago', '波士頓', '波士顿', 'boston',
    '邁阿密', '迈阿密', 'miami', '奧蘭多', '奥兰多', 'orlando',
    '華盛頓', '华盛顿', 'washington dc', 'washington, d.c',
    '聖地牙哥', '圣地亚哥', 'san diego', '休士頓', '休斯顿', 'houston', '達拉斯', 'dallas',
    '溫哥華', '温哥华', 'vancouver', '多倫多', 'toronto', '蒙特婁', '蒙特利尔', 'montreal', 'ottawa', '渥太華', '渥太华'
  ];
  var REGION_200 = [
    // 泛稱
    '日本', 'japan', '歐洲', '欧洲', 'europe', '歐陸', '申根', 'schengen', '北歐', '北欧', 'nordic', 'scandinavia',
    '紐澳', '大洋洲', 'oceania',
    // 日本城市
    '東京', '东京', 'tokyo', '大阪', 'osaka', '京都', 'kyoto', '北海道', 'hokkaido',
    '沖繩', '冲绳', 'okinawa', '名古屋', 'nagoya', '福岡', '福冈', 'fukuoka',
    '札幌', 'sapporo', '神戶', '神戸', 'kobe', '橫濱', '横滨', 'yokohama', '奈良', 'nara',
    // 南韓
    '韓國', '韩国', '南韓', '南韩', 'korea', '首爾', '首尔', 'seoul', '釜山', 'busan', '濟州', '济州', 'jeju',
    // 紐澳
    '紐西蘭', '新西兰', 'new zealand', '澳洲', '澳大利亞', '澳大利亚', 'australia',
    '奧克蘭', '奥克兰', 'auckland', '基督城', 'christchurch', '惠靈頓', '惠灵顿', 'wellington',
    '雪梨', '悉尼', 'sydney', '墨爾本', '墨尔本', 'melbourne', '布里斯本', 'brisbane',
    '柏斯', 'perth', '黃金海岸', 'gold coast', '坎培拉', 'canberra',
    // 歐洲國家（申根＋非申根英國／愛爾蘭／賽普勒斯 — DM「歐洲」皆 200%）
    '法國', '法国', '法蘭西', 'france',
    '德國', '德国', 'germany', 'deutschland',
    '義大利', '意大利', 'italy', 'italia',
    '西班牙', 'spain', 'espana', 'españa',
    '葡萄牙', 'portugal',
    '荷蘭', '荷兰', 'netherlands', 'holland',
    '比利時', '比利时', 'belgium',
    '盧森堡', '卢森堡', 'luxembourg',
    '瑞士', 'switzerland', 'swiss',
    '奧地利', '奥地利', 'austria',
    '捷克', 'czech',
    '匈牙利', 'hungary',
    '波蘭', '波兰', 'poland',
    '斯洛伐克', 'slovakia',
    '斯洛維尼亞', '斯洛文尼亞', 'slovenia',
    '克羅埃西亞', '克羅地亞', '克罗地亚', 'croatia',
    '希臘', '希腊', 'greece',
    '丹麥', '丹麦', 'denmark',
    '瑞典', 'sweden',
    '挪威', 'norway',
    '芬蘭', '芬兰', 'finland',
    '冰島', '冰岛', 'iceland',
    '愛沙尼亞', '爱沙尼亚', 'estonia',
    '拉脫維亞', '拉脱维亚', 'latvia',
    '立陶宛', 'lithuania',
    '馬爾他', '马耳他', 'malta',
    '列支敦斯登', '列支敦士登', 'liechtenstein',
    '保加利亞', '保加利亚', 'bulgaria',
    '羅馬尼亞', '罗马尼亚', 'romania',
    '安道爾', '安道尔', 'andorra',
    '摩納哥', '摩纳哥', 'monaco',
    '聖馬利諾', '圣马力诺', 'san marino',
    '教廷', '梵蒂岡', '梵蒂冈', 'vatican', 'holy see',
    '英國', '英国', '英格蘭', '英格兰', '蘇格蘭', '苏格兰', '威爾士', '威爾斯',
    'uk', 'u.k.', 'united kingdom', 'england', 'scotland', 'wales', 'britain', 'british',
    '愛爾蘭', '爱尔兰', 'ireland',
    '賽普勒斯', '塞浦路斯', 'cyprus',
    // 歐洲熱門城市
    '巴黎', 'paris', '羅馬', '罗马', 'rome', '米蘭', '米兰', 'milan',
    '威尼斯', 'venice', '佛羅倫斯', '佛罗伦萨', 'florence', 'firenze',
    '巴塞隆納', '巴塞罗那', 'barcelona', '馬德里', '马德里', 'madrid',
    '阿姆斯特丹', 'amsterdam', '布拉格', 'prague',
    '維也納', '维也纳', 'vienna', '慕尼黑', 'munich', 'münchen',
    '柏林', 'berlin', '蘇黎世', '苏黎世', 'zurich', 'zürich',
    '日內瓦', '日内瓦', 'geneva', '布達佩斯', '布达佩斯', 'budapest',
    '里斯本', 'lisbon', '雅典', 'athens',
    '斯德哥爾摩', '斯德哥尔摩', 'stockholm', '奧斯陸', '奥斯陆', 'oslo',
    '赫爾辛基', 'helsinki', '哥本哈根', 'copenhagen',
    '布魯塞爾', '布鲁塞尔', 'brussels', '法蘭克福', '法兰克福', 'frankfurt',
    '漢堡', 'hamburg', '科隆', 'cologne', 'köln', '尼斯', 'nice', '里昂', 'lyon',
    '塞維亞', '塞维利亚', 'seville', '瓦倫西亞', 'valencia', '波爾圖', 'porto',
    '札格雷布', '萨格勒布', 'zagreb', '盧布爾雅那', 'ljubljana',
    '塔林', 'tallinn', '里加', 'riga', '維爾紐斯', 'vilnius',
    '倫敦', '伦敦', 'london', '都柏林', 'dublin', '愛丁堡', '爱丁堡', 'edinburgh',
    '曼徹斯特', '曼彻斯特', 'manchester', '雷克雅維克', '雷克雅未克', 'reykjavik',
    '尼古西亞', '尼科西亞', 'nicosia'
  ];

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

  /** 人壽 OH1 住院／門診／急診地區限額比例（DM 註3） */
  function guessRegionPct(dest) {
    if (textHasKeyword(dest, REGION_350)) return 350;
    if (textHasKeyword(dest, REGION_200)) return 200;
    return 100;
  }

  /* ---------- 年齡（足歲）→ GPTA 年齡帶／人壽 AT1 上限（Go安行 DM：(Q)AT1保險金額與年齡限制） ---------- */
  // 66 歲以上保費與 18～65 相同（陳銘旭確認 2026-10-06），僅 AT1 上限不同
  var AGE_BANDS = [
    { band: 'under15', min: 0, max: 14, label: '未滿15足歲', at1Max: 0, child: true, lifeRates: 'u15' },
    { band: '15-17', min: 15, max: 17, label: '15足歲～17歲', at1Max: 600, lifeRates: 'adult' },
    { band: '18-65', min: 18, max: 65, label: '18～65歲', at1Max: 2000, lifeRates: 'adult' },
    { band: '66-70', min: 66, max: 70, label: '66～70歲', at1Max: 1000, lifeRates: 'adult' },
    { band: '71-75', min: 71, max: 75, label: '71～75歲', at1Max: 500, lifeRates: 'adult' },
    { band: '76-80', min: 76, max: 80, label: '76～80歲', at1Max: 300, lifeRates: 'adult' },
    { band: '81-100', min: 81, max: 100, label: '81～100歲', at1Max: 100, lifeRates: 'adult' }
  ];
  var CHILD_MRC_WAN = 60;          // 未滿15足歲 國外套裝：(Q)MRC 定額 60萬（兒童主約・傷害醫療每一事故最高）
  var CHILD_OH1_OPTIONS = [60, 120]; // 未滿15足歲 OH1：60萬（國外旅遊適用）或 120萬（醫療加值）
  /** 年齡（足歲）→ {set, valid, age, band, label, at1Max, child, lifeRates, error} */
  function ageInfo(age) {
    if (age === null || age === undefined || String(age).trim() === '') {
      return { set: false, valid: false, error: '請先輸入被保險人年齡（足歲），才能產生報價' };
    }
    var n = Number(age);
    if (!isFinite(n) || n < 0 || Math.floor(n) !== n) {
      return { set: true, valid: false, error: '年齡請輸入 0～100 的整數（足歲）' };
    }
    if (n > 100) return { set: true, valid: false, error: '年齡超過 100 歲，人壽（Go安行最高 100 歲）無法投保，請確認年齡' };
    for (var i = 0; i < AGE_BANDS.length; i++) {
      var b = AGE_BANDS[i];
      if (n >= b.min && n <= b.max) {
        return { set: true, valid: true, age: n, band: b.band, label: b.label, at1Max: b.at1Max, child: !!b.child, lifeRates: b.lifeRates };
      }
    }
    return { set: true, valid: false, error: '年齡無效' };
  }
  /** 是否未滿15足歲（優先看 age；舊稿無 age 時才看 ageBand） */
  function isChildQuote(q) {
    var a = ageInfo(q && q.age);
    if (a.valid) return a.child;
    return !!(q && q.ageBand === 'under15');
  }
  function childOh1Wan(life) {
    return Number(life && life.childOh1Wan) === 120 ? 120 : 60;
  }

  /** 計算單一方案所有顯示用數值（單位：元） */
  function computePlan(plan, quote) {
    var life = plan.life || {};
    var prop = plan.property || {};
    var region = num(quote.lifeRegionPct || 100) / 100;
    var child = isChildQuote(quote);
    var L = { enabled: !!life.enabled, child: false, mrc: 0 };
    if (L.enabled && child) {
      // 未滿15足歲：無 AT1、無 MR；主約 MRC 60萬（傷害醫療）＋OH1 60/120萬＋OAA
      L.child = true;
      L.at1 = 0; L.mr = 0;
      L.mrc = CHILD_MRC_WAN * 10000;
      L.oh1 = childOh1Wan(life) * 10000;
      L.hospital = isSet(life.hospitalYuan) ? num(life.hospitalYuan) : L.oh1 * LIFE_OH1_RATIO.hospital * region;
      L.outpatient = isSet(life.outpatientYuan) ? num(life.outpatientYuan) : L.oh1 * LIFE_OH1_RATIO.outpatient * region;
      L.er = isSet(life.erYuan) ? num(life.erYuan) : L.oh1 * LIFE_OH1_RATIO.er * region;
      L.oaa = !!life.oaa;
      L.premium = num(life.premium);
    } else if (L.enabled) {
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
    var P = { enabled: prop.enabled !== false };
    // 產險 DM：「※針對未滿15足歲之被保險人，本保險契約無提供意外死亡之喪葬費用保險金。」兒童方案身故及失能為「-」
    P.death = child ? 0 : num(prop.deathWan) * 10000;
    P.hospital = num(prop.hospitalWan) * 10000;
    P.outpatient = isSet(prop.outpatientYuan) ? num(prop.outpatientYuan) : P.hospital * PROP_RATIO.outpatient;
    P.er = isSet(prop.erYuan) ? num(prop.erYuan) : P.hospital * PROP_RATIO.er;
    P.accidentMedical = num(prop.accidentMedicalWan) * 10000;
    P.premium = num(prop.premium);
    if (!P.enabled) { P.death = P.hospital = P.outpatient = P.er = P.accidentMedical = P.premium = 0; }
    return {
      life: L, prop: P, child: child,
      lifePremiumMissing: L.enabled && !isSet(life.premium),
      lifeOverCap: L.enabled && !child && (function () { var a = ageInfo(quote.age); return a.valid && num(life.at1Wan) > a.at1Max; })(),
      death: L.at1 + P.death,
      hospital: L.hospital + P.hospital,
      outpatient: L.outpatient + P.outpatient,
      er: L.er + P.er,
      accidentMedical: L.mr + L.mrc + P.accidentMedical,
      premium: L.premium + P.premium
    };
  }

  /* ---------- 日期（只用年月日，避免時區／UTC 字串解析造成少算一天） ---------- */
  var WD = ['日', '一', '二', '三', '四', '五', '六'];
  /** 解析 YYYY-MM-DD → {y,m,d}；不使用 new Date('YYYY-MM-DD')（那會當 UTC 午夜） */
  function parseDateParts(s) {
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s || '').trim());
    if (!m) return null;
    var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return { y: y, m: mo, d: d };
  }
  /** 供顯示用的本地 Date（僅取年月日欄位） */
  function parseDate(s) {
    var p = parseDateParts(s);
    if (!p) return null;
    return new Date(p.y, p.m - 1, p.d);
  }
  function fmtDate(s, mode) {
    var p = parseDateParts(s);
    if (!p) return s || '';
    var dt = new Date(p.y, p.m - 1, p.d);
    var y = mode === 'ad' ? p.y : p.y - 1911;
    return y + '/' + p.m + '/' + p.d + '（' + WD[dt.getDay()] + '）';
  }
  /**
   * 投保／旅遊天數：算頭算尾（出發日、回程日都算）。
   * 例：10/13～10/19 = 7；同一天 = 1。
   * 用 Date.UTC(y,m-1,d) 做日差，不受瀏覽器時區／DST 影響。
   */
  function daysInclusive(a, b) {
    var p1 = parseDateParts(a), p2 = parseDateParts(b);
    if (!p1 || !p2) return null;
    var t1 = Date.UTC(p1.y, p1.m - 1, p1.d);
    var t2 = Date.UTC(p2.y, p2.m - 1, p2.d);
    if (t2 < t1) return null;
    return Math.floor((t2 - t1) / 86400000) + 1;
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
  /** 保額來源（只列有投保的一方）：（人壽 X＋產險 Y）／（人壽 X）／（產險 Y） */
  function covSource(lifeOn, lifeTxt, propOn, propTxt) {
    var parts = [];
    if (lifeOn) parts.push('人壽 ' + lifeTxt);
    if (propOn) parts.push('產險 ' + propTxt);
    return parts.join('＋');
  }
  function bracket(lifeOn, lifeTxt, propTxt, propOn) {
    var s = covSource(lifeOn, lifeTxt, propOn !== false, propTxt);
    return s ? '（' + s + '）' : '';
  }
  /** 保費列文字（卡片／總表圖／編輯器共用）：不投保的一方寫「不投保」 */
  function premiumParts(c) {
    var lifeTxt = !c.life.enabled ? '不投保'
      : (c.lifePremiumMissing ? (c.lifeOverCap ? 'AT1 超過年齡上限' : '需另行試算') : comma(c.life.premium));
    var propTxt = c.prop.enabled ? comma(c.prop.premium) : '不投保';
    return { life: lifeTxt, prop: propTxt, total: comma(c.premium), missing: !!c.lifePremiumMissing,
      lifeNum: !c.life.enabled || c.lifePremiumMissing ? null : c.life.premium, propNum: c.prop.enabled ? c.prop.premium : null };
  }
  /** 方案一側都不投保 → 錯誤訊息（擋總表圖） */
  function planNothingInsured(plan) {
    return !(plan.life && plan.life.enabled) && plan.property && plan.property.enabled === false;
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
    var L = c.life, P = c.prop, on = L.enabled, pOn = P.enabled;
    var h = '';
    h += '<article class="plan-card' + (plan.recommended ? ' is-reco' : '') + '" id="plan-' + (idx + 1) + '">';
    if (quote.sample) h += '<div class="card-sample">範例</div>';
    h += '<header class="plan-head"><div class="plan-title"><span class="plan-no">' + esc(plan.name || ('方案' + (idx + 1))) + '</span>' +
      (plan.recommended ? '<span class="reco-badge">推薦</span>' : '') + '</div>' +
      '<div class="plan-tagline">' + esc(plan.tagline || '') + '</div></header>';

    if (c.child) {
      // 未滿15足歲：人壽無 AT1、產險兒童方案無身故失能 → 主框改顯示兒童主約
      h += '<section class="death-box child"><div class="death-label">' + (on ? '人壽兒童主約 MRC（傷害醫療）' : '意外身故・失能 保額') + '</div>' +
        '<div class="death-val">' + (on ? esc(fmtYuan(L.mrc)) : '—') + '</div>' +
        '<div class="death-br">' + esc(on
          ? '富邦人壽兒童傷害醫療旅行平安保險（未滿15足歲不提供 AT1 意外身故）'
          : '未滿15足歲：產險兒童方案無意外身故・失能保障') + '</div></section>';
    } else {
      h += '<section class="death-box"><div class="death-label">意外身故・失能 保額</div>' +
        '<div class="death-val">' + esc(fmtYuan(c.death)) + '</div>' +
        '<div class="death-br">' + esc(covSource(on, fmtShort(L.at1), pOn, fmtShort(P.death))) + '</div></section>';
    }

    h += '<section class="cov"><h3 class="sec-title">醫療保障</h3>';
    // 合計為 0 的列（該項兩邊都沒有保障）不顯示
    if (c.hospital) h += row('海外突發疾病 住院', fmtYuan(c.hospital), bracket(on, fmtShort(L.hospital), fmtShort(P.hospital), pOn),
      on ? (L.child ? '人壽突發疾病 OH1 ' + fmtShort(L.oh1) + '・保期內最高' : '人壽保期內最高') : '');
    if (c.outpatient) h += row('海外突發疾病 門診', fmtYuan(c.outpatient), bracket(on, '每日最高 ' + fmtShort(L.outpatient), fmtShort(P.outpatient), pOn));
    if (c.er) h += row('海外突發疾病 急診', fmtYuan(c.er), bracket(on, '每日最高 ' + fmtShort(L.er), fmtShort(P.er), pOn));
    if (c.accidentMedical) h += row('意外醫療', fmtYuan(c.accidentMedical), bracket(on, L.child ? 'MRC ' + fmtShort(L.mrc) : fmtShort(L.mr), fmtShort(P.accidentMedical), pOn),
      on ? (L.child ? '人壽兒童傷害醫療 MRC・每一事故最高' : '人壽每一事故最高') : '');
    if (on && L.oaa) h += '<div class="oaa-chip">✈ 人壽另含 OAA 海外醫療專機運送（實物給付）</div>';
    h += '</section>';

    if (pOn) {
      h += '<section class="inconv"><h3 class="sec-title">不便險（產險）</h3>' + itemList(plan.inconvenience) + '</section>';
      h += '<section class="others"><h3 class="sec-title">其他產險保障</h3>' + itemList(plan.others) + '</section>';
    }

    var pp = premiumParts(c);
    h += '<footer class="premium"><div class="prem-label">保費</div>' +
      (pp.missing
        ? '<div class="prem-formula">壽 <b>' + pp.life + '</b> ＋ 產 <b>' + pp.prop + '</b>（人壽保費另計）</div></footer>'
        : '<div class="prem-formula">壽 <b>' + pp.life + '</b> ＋ 產 <b>' + pp.prop + '</b> ＝ <span class="prem-total">' + pp.total + '</span> 元</div></footer>');
    h += '</article>';
    return h;
  }

  function renderNotes(quote) {
    var notes = [];
    var anyLife = (quote.plans || []).some(function (p) { return p.life && p.life.enabled; });
    var anyProp = (quote.plans || []).some(function (p) { return !(p.property && p.property.enabled === false); });
    var propNote = '產險＝' + PROPERTY_PRODUCT + (quote.schengen ? '【計畫二・醫療加值／申根適用，海外突發疾病住院 150萬】' : '【計畫一・國外旅遊適用】');
    notes.push((anyLife ? '人壽＝' + LIFE_PRODUCT + (anyProp ? '；' : '') : '') + (anyProp ? propNote : '') + '。');
    if (anyLife !== anyProp || (quote.plans || []).some(function (p) { return !(p.life && p.life.enabled) || (p.property && p.property.enabled === false); })) {
      notes.push('保費列中「不投保」表示該方案未投保該險種（不含其保障與保費）。');
    }
    if (quote.schengen) {
      notes.push('申根行程：產險已套用計畫二；請隨身攜帶申根地區醫療旅遊保險英文投保憑證。人壽為國外其他地區（OAA 不適用），保費請以 GPTA 試算為準。');
    }
    var childQ = isChildQuote(quote);
    if (childQ) {
      if (anyLife) notes.push('未滿15足歲：人壽主約為富邦人壽兒童傷害醫療旅行平安保險 MRC 60萬（傷害醫療每一事故最高），不提供 AT1 意外身故；另含海外突發疾病 OH1 及 OAA。');
      if (anyProp) notes.push('產險：未滿15足歲適用新快樂旅綜+ 兒童方案；依 DM「針對未滿15足歲之被保險人，本保險契約無提供意外死亡之喪葬費用保險金」。');
    }
    if (anyLife) {
      var pct = num(quote.lifeRegionPct || 100);
      notes.push((childQ ? '人壽海外突發疾病（OH1）依所選保額' : '人壽海外突發疾病（OH1）與意外醫療（MR）各為 AT1 保額之 10%') +
        (pct !== 100 ? '；人壽住院／門診／急診限額已含 ' + esc(quote.destination || '') + ' ' + pct + '% 地區調整' : '') +
        '；人壽門診、急診為每日最高。');
    }
    if (anyProp) notes.push('產險門診為住院額度 2%、急診為 5%（保期內最高）。');
    (quote.extraNotes || []).forEach(function (n) { if (n) notes.push(n); });
    notes.push('本頁為保障內容與保費試算摘要，實際以保單條款、投保規定及核保結果為準。');
    return '<ul class="notes">' + notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>';
  }

  function renderHeader(quote) {
    var mode = quote.dateFormat === 'ad' ? 'ad' : 'roc';
    var dates = '';
    if (quote.startDate || quote.endDate) dates = fmtDate(quote.startDate, mode) + ' ～ ' + fmtDate(quote.endDate, mode);
    var kicker = '旅平險 三方案報價' + (quote.schengen ? '　<span class="hero-schengen">申根／計畫二</span>' : '');
    return renderBrand('brand') + '<div class="hero-kicker">' + kicker + '</div>' +
      '<h1 class="hero-title"><span class="dest">' + esc(quote.destination || '—') + '</span><span class="days">' +
      esc(quote.days || '—') + '<small> 天</small></span></h1>' +
      (dates ? '<div class="hero-dates">' + esc(dates) + '</div>' : '');
  }

  function renderFooter(quote) {
    var a = quote.agent || {};
    return '<div class="sig-unit">富邦人壽 ' + esc(a.unit || '南恩通訊處') + '</div>' +
      '<div class="sig-people"><span>' + esc(a.title || '業務經理') + ' <b>' + esc(a.name || '陳銘旭') + '</b></span></div>';
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


  /** 產險預設方案解析：保額優先對「計畫一・一般」(P1-G*)；進階方案（計畫二／租車／兒童）以 planCode 為準 */
  function findPropertyPreset(prop) {
    var list = (global.PROPERTY_PRESETS && global.PROPERTY_PRESETS.plans) || [];
    if (!prop) return null;
    if (prop.planCode) {
      for (var i = 0; i < list.length; i++) if (list[i].code === prop.planCode) return list[i];
    }
    var death = num(prop.deathWan), hosp = num(prop.hospitalWan), acc = num(prop.accidentMedicalWan);
    var hits = list.filter(function (x) {
      return num(x.deathWan) === death
        && (hosp === 0 || num(x.hospitalWan) === hosp)
        && (acc === 0 || num(x.accidentMedicalWan) === acc);
    });
    if (hits.length === 1) return hits[0];
    var byDeath = list.filter(function (x) { return num(x.deathWan) === death && x.code.indexOf('P1-G') === 0; });
    if (byDeath.length === 1) return byDeath[0];
    return null;
  }
  function resolvePropertyPreset(prop, quote) {
    var list = (global.PROPERTY_PRESETS && global.PROPERTY_PRESETS.plans) || [];
    if (!prop) return null;
    var schengen = !!(quote && quote.schengen);
    var code = prop.planCode || '';
    // 未滿15足歲 → 只能投保兒童方案（DM 投保年齡「未滿15足歲」）：計畫一 P1-CHILD／申根 P2-CHILD（可進階手選 P2-CHILD 醫療加值）
    if (quote && isChildQuote(quote)) {
      var cc = (code === 'P2-CHILD' || schengen) ? 'P2-CHILD' : 'P1-CHILD';
      for (var ci = 0; ci < list.length; ci++) if (list[ci].code === cc) return list[ci];
      return null;
    }
    if (/CHILD/.test(code)) code = ''; // 15足歲以上不可用兒童方案 → 改依保額
    // 進階手選租車 → 尊守 planCode（申根模式下仍可用）
    if (code && /-R\d/.test(code)) {
      for (var i = 0; i < list.length; i++) if (list[i].code === code) return list[i];
    }
    // 主路徑：保額優先（避免舊 planCode 把使用者剛改的保額蓋回去）
    var death = num(prop.deathWan);
    if (death > 0) {
      var want = (schengen ? 'P2-G' : 'P1-G') + death;
      for (var j = 0; j < list.length; j++) if (list[j].code === want) return list[j];
    }
    // 無有效保額時，才回落既有與模式一致的 planCode
    if (code && !schengen && /^P1-G/.test(code)) {
      for (var a = 0; a < list.length; a++) if (list[a].code === code) return list[a];
    }
    if (code && schengen && /^P2-G/.test(code)) {
      for (var b = 0; b < list.length; b++) if (list[b].code === code) return list[b];
    }
    var f = findPropertyPreset(prop);
    return (f && f.child) ? null : f;
  }
  /** 產險方案是否符合 DM 投保年齡（ageMin～ageMax）；無年齡時視為未知（不擋） */
  function propertyAgeCheck(preset, quote) {
    var a = ageInfo(quote && quote.age);
    if (!preset || !a.valid) return { ok: true, unknown: !a.valid };
    var min = preset.ageMin, max = preset.ageMax;
    if (min == null || max == null) return { ok: true };
    if (a.age >= min && a.age <= max) return { ok: true };
    return { ok: false, tip: preset.label + ' 投保年齡為「' + preset.ageLabel + '」（DM），' + a.age + ' 歲不可投保' };
  }
  /** 產險保費來源（依天數）：2～10 天 DM 費率表；11～30 天展業平台試算（見 presets.js meta.premiumSources） */
  function propertyPremiumSource(days) {
    var meta = (global.PROPERTY_PRESETS && global.PROPERTY_PRESETS.meta) || {};
    var list = meta.premiumSources || [];
    var d = num(days);
    for (var i = 0; i < list.length; i++) {
      if (d >= list[i].from && d <= list[i].to) return list[i].label;
    }
    return 'DM';
  }
  /**
   * 產險保費查表：僅 presets.js 有列的天數，絕不內插；保額／方案變更時一併帶保障項目。
   * 一般／租車 2～30 天（2～10 天 DM、11～30 天展業平台試算 2026-10-08）；兒童方案僅 2～10 天。
   */
  function lookupPropertyPremium(prop, days, quote) {
    var d = num(days);
    var preset = resolvePropertyPreset(prop, quote);
    if (!preset) {
      var sch = quote && quote.schengen;
      return { found: false, outOfRange: false, tip: sch
        ? '申根／計畫二尚無此產險保額（DM 有 200／300／500／1000／1500 萬，突發疾病住院皆 150萬）'
        : '尚無對應產險方案（請填保額 200／300／500／1000，或勾選申根／用進階下拉）', preset: null };
    }
    var ac = propertyAgeCheck(preset, quote);
    if (!ac.ok) return { found: false, outOfRange: false, ageBlocked: true, tip: ac.tip + '；請改選符合年齡的保額', preset: preset };
    var table = preset.premiumByDays || {};
    var keys = Object.keys(table).map(Number).filter(isFinite).sort(function (a, b) { return a - b; });
    var minD = keys[0], maxD = keys[keys.length - 1];
    if (!isFinite(d) || d <= 0) {
      return { found: false, outOfRange: false, tip: '請先填投保天數', preset: preset };
    }
    if (d < minD || d > maxD || table[String(d)] === undefined) {
      return {
        found: false,
        outOfRange: true,
        tip: preset.child
          ? '兒童方案（未滿15足歲）保費僅有 ' + minD + '～' + maxD + ' 天，目前 ' + d + ' 天無資料（展業平台試算未含兒童方案 11～30 天），請向產險試算後手填（禁止推估）'
          : '新快樂旅綜+ 自動保費僅有 ' + minD + '～' + maxD + ' 天（2～10 天 DM、11～30 天展業平台試算），目前 ' + d + ' 天無資料，請向產險試算後手填（禁止推估）',
        preset: preset,
        dayMin: minD,
        dayMax: maxD
      };
    }
    var prem = table[String(d)];
    var srcLabel = propertyPremiumSource(d);
    return {
      found: true,
      premium: prem,
      source: srcLabel,
      tip: '自動：' + comma(prem) + ' 元（' + preset.label + '／' + d + '天／' + srcLabel + '）',
      preset: preset,
      dayMin: minD,
      dayMax: maxD
    };
  }


  /**
   * 依目的地字串判斷是否申根行程（子字串比對；含繁中／常見異體／英文／城市／泛稱）。
   * 成員以歐盟官網為準（2025-01 保加利亞、羅馬尼亞已全面加入；賽普勒斯／愛爾蘭／英國非申根）。
   * 富邦 DM 另列安道爾／摩納哥／聖馬利諾／教廷等，一併視為申根行程。
   */
  function detectSchengen(dest) {
    var t = String(dest || '').trim();
    if (!t) return false;
    var low = t.toLowerCase();
    // 明確非申根（若整段只有這些、或未同時出現申根關鍵字）— 先蒐集命中
    var non = [
      '愛爾蘭', '爱尔兰', 'ireland', 'dublin', '都柏林',
      '英國', '英国', '英格蘭', '英格兰', '蘇格蘭', '苏格兰', '威爾士', '威爾斯',
      'uk', 'u.k.', 'united kingdom', 'england', 'scotland', 'wales', 'london', '倫敦', '伦敦',
      '賽普勒斯', '塞浦路斯', 'cyprus', '尼古西亞', '尼科西亞'
    ];
    var sch = [
      // 泛稱
      '申根', 'schengen', '歐洲', '欧洲', 'europe', '歐陸', 'eu ',
      // 國家（繁中＋異體＋英文）
      '法國', '法国', '法蘭西', 'france',
      '德國', '德国', 'germany', 'deutschland',
      '義大利', '意大利', 'italy', 'italia',
      '西班牙', 'spain', 'espana', 'españa',
      '葡萄牙', 'portugal',
      '荷蘭', '荷兰', 'netherlands', 'holland',
      '比利時', '比利时', 'belgium',
      '盧森堡', '卢森堡', 'luxembourg',
      '瑞士', 'switzerland', 'swiss',
      '奧地利', '奥地利', 'austria',
      '捷克', 'czech',
      '匈牙利', 'hungary',
      '波蘭', '波兰', 'poland',
      '斯洛伐克', 'slovakia',
      '斯洛維尼亞', '斯洛文尼亞', 'slovenia',
      '克羅埃西亞', '克羅地亞', '克罗地亚', 'croatia',
      '希臘', '希腊', 'greece',
      '丹麥', '丹麦', 'denmark',
      '瑞典', 'sweden',
      '挪威', 'norway',
      '芬蘭', '芬兰', 'finland',
      '冰島', '冰岛', 'iceland',
      '愛沙尼亞', '爱沙尼亚', 'estonia',
      '拉脫維亞', '拉脱维亚', 'latvia',
      '立陶宛', 'lithuania',
      '馬爾他', '马耳他', 'malta',
      '列支敦斯登', '列支敦士登', 'liechtenstein',
      '保加利亞', '保加利亚', 'bulgaria',
      '羅馬尼亞', '罗马尼亚', 'romania',
      // 微型國家／DM 常列
      '安道爾', '安道尔', 'andorra',
      '摩納哥', '摩纳哥', 'monaco',
      '聖馬利諾', '圣马力诺', 'san marino',
      '教廷', '梵蒂岡', '梵蒂冈', 'vatican', 'holy see',
      // 城市／熱門地
      '巴黎', 'paris',
      '羅馬', '罗马', 'rome',
      '米蘭', '米兰', 'milan',
      '威尼斯', 'venice',
      '佛羅倫斯', '佛罗伦萨', 'florence', 'firenze',
      '巴塞隆納', '巴塞罗那', 'barcelona',
      '馬德里', '马德里', 'madrid',
      '阿姆斯特丹', 'amsterdam',
      '布拉格', 'prague',
      '維也納', '维也纳', 'vienna',
      '慕尼黑', 'munich', 'münchen',
      '柏林', 'berlin',
      '蘇黎世', '苏黎世', 'zurich', 'zürich',
      '日內瓦', '日内瓦', 'geneva',
      '布達佩斯', '布达佩斯', 'budapest',
      '里斯本', 'lisbon',
      '雅典', 'athens',
      '斯德哥爾摩', '斯德哥尔摩', 'stockholm',
      '奧斯陸', '奥斯陆', 'oslo',
      '赫爾辛基', 'helsinki',
      '哥本哈根', 'copenhagen',
      '布魯塞爾', '布鲁塞尔', 'brussels',
      '法蘭克福', '法兰克福', 'frankfurt',
      '漢堡', 'hamburg',
      '科隆', 'cologne', 'köln',
      '尼斯', 'nice',
      '里昂', 'lyon',
      '塞維亞', '塞维利亚', 'seville',
      '瓦倫西亞', 'valencia',
      '波爾圖', 'porto',
      '札格雷布', '萨格勒布', 'zagreb',
      '盧布爾雅那', 'ljubljana',
      '塔林', 'tallinn',
      '里加', 'riga',
      '維爾紐斯', 'vilnius'
    ];
    function hit(list) {
      for (var i = 0; i < list.length; i++) {
        var k = list[i];
        if (!k) continue;
        if (/[a-z]/i.test(k)) {
          if (low.indexOf(k.toLowerCase()) >= 0) return true;
        } else if (t.indexOf(k) >= 0) return true;
      }
      return false;
    }
    var hasSch = hit(sch);
    if (!hasSch) return false;
    // 若同時只有非申根字樣、沒有真正申根國（理論上 hasSch 已排除），仍回 true
    // 特殊：目的地「僅」為非申根時 hasSch 應為 false；「法國＋英國」→ true
    return true;
  }

  /**
   * 台灣國內地點偵測（國內旅遊不適用海外旅平險）。
   * 只比對完整地名（不比對單字「台」），英文用單字邊界（避免 Matsu 誤中日本 Matsumoto／Matsuyama）。
   * 先排除已知外國同名詞：東京「台東區」、舊金山「金門大橋／金門公園」。
   * 回傳命中的關鍵字（字串），沒命中回傳 ''。
   */
  var DOMESTIC_WARNING = '⚠ 台灣／金門／馬祖／澎湖等屬國內旅遊，不適用海外旅平險，請輸入正確的出國目的地國家';
  var DOMESTIC_ZH = [
    // 國名
    '台灣', '臺灣', '台湾', '臺湾', '中華民國', '中华民国',
    // 離島
    '金門', '金门', '馬祖', '马祖', '澎湖', '綠島', '绿岛', '蘭嶼', '兰屿', '小琉球',
    '連江', '连江', '東引', '东引', '南竿', '北竿',
    // 縣市（繁＋簡）
    '台北', '臺北', '新北', '桃園', '桃园', '台中', '臺中', '台南', '臺南', '高雄', '基隆',
    '新竹', '苗栗', '彰化', '南投', '雲林', '云林', '嘉義', '嘉义', '屏東', '屏东',
    '宜蘭', '宜兰', '花蓮', '花莲', '台東', '臺東', '台东'
  ];
  var DOMESTIC_EN = /\b(taiwan|taipei|new taipei|kaohsiung|taichung|tainan|taoyuan|keelung|hsinchu|miaoli|changhua|nantou|yunlin|chiayi|pingtung|yilan|hualien|taitung|kinmen|matsu|penghu|lienchiang)\b/i;
  // 外國同名詞：先移除再比對
  var DOMESTIC_EXCLUDE = [
    '台東區', '台东区', '台東区', '臺東區',           // 東京都台東區（淺草／上野）
    '金門大橋', '金门大桥', '金門大桥', '金門橋', '金门桥', '金門公園', '金门公园' // 舊金山 Golden Gate
  ];
  function detectDomestic(dest) {
    var t = String(dest || '').trim();
    if (!t) return '';
    for (var e = 0; e < DOMESTIC_EXCLUDE.length; e++) t = t.split(DOMESTIC_EXCLUDE[e]).join(' ');
    t = t.replace(/golden\s+gate/ig, ' ');
    for (var i = 0; i < DOMESTIC_ZH.length; i++) if (t.indexOf(DOMESTIC_ZH[i]) >= 0) return DOMESTIC_ZH[i];
    var m = DOMESTIC_EN.exec(t);
    return m ? m[1] : '';
  }

  global.TQ = {
    LIFE_PRODUCT: LIFE_PRODUCT, PROPERTY_PRODUCT: PROPERTY_PRODUCT,
    LIFE_OH1_RATIO: LIFE_OH1_RATIO, PROP_RATIO: PROP_RATIO, REGION_OPTIONS: REGION_OPTIONS,
    num: num, isSet: isSet, comma: comma, fmtYuan: fmtYuan, fmtShort: fmtShort,
    guessRegionPct: guessRegionPct, computePlan: computePlan,
    fmtDate: fmtDate, daysInclusive: daysInclusive, parseDateParts: parseDateParts,
    encodeQuote: encodeQuote, decodeHash: decodeHash, shareUrl: shareUrl,
    findPropertyPreset: findPropertyPreset, resolvePropertyPreset: resolvePropertyPreset, lookupPropertyPremium: lookupPropertyPremium, propertyPremiumSource: propertyPremiumSource,
    detectSchengen: detectSchengen,
    detectDomestic: detectDomestic, DOMESTIC_WARNING: DOMESTIC_WARNING,
    AGE_BANDS: AGE_BANDS, ageInfo: ageInfo, isChildQuote: isChildQuote, childOh1Wan: childOh1Wan,
    CHILD_MRC_WAN: CHILD_MRC_WAN, CHILD_OH1_OPTIONS: CHILD_OH1_OPTIONS, propertyAgeCheck: propertyAgeCheck,
    BRAND: BRAND, renderBrand: renderBrand, brandLogoReady: function () { return brandLogoReady; },
    renderQuote: renderQuote, renderPlanCard: renderPlanCard, premiumParts: premiumParts, covSource: covSource, planNothingInsured: planNothingInsured, titleFor: titleFor, esc: esc
  };
})(window);
