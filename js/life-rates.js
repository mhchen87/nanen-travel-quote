/* 人壽 Go安行（旅行社／快易保）離線費率 — 僅含已核對的真實點，禁止內插。
 * 查無完全相符組合時，編輯器不得自動填入，請改以 GPTA 試算手填。
 *
 * 鍵值說明：
 *   rateType: 'agency'＝旅行社／快易保費率
 *   region:   'asia14'＝國外亞洲14國（可附加 OAA）
 *   ageBand:  '18-65' 等（足歲區間，僅供查表，客戶頁不顯示年齡）
 *   days, at1Wan, oh1Wan, mrWan, oaa
 *   premium:  總保費（含附約，新台幣元／人）
 *   source:   資料來源（DM 或 GPTA 既有試算）
 */
(function (global) {
  'use strict';

  /** Go安行 DM「國外・旅行社／快易保・適用」稀疏表（OH1=MR=AT1×10% 套裝；亞洲14國可含 OAA） */
  var DM_AGENCY_APPLY = [
    // days, at1Wan, premium — from dm_rules.md
    [5, 500, 850], [5, 1000, 1444], [5, 1500, 2031], [5, 2000, 2626],
    [10, 500, 1119], [10, 1000, 1855], [10, 1500, 2606], [10, 2000, 3328],
    [15, 500, 1347], [15, 1000, 2181], [15, 1500, 3057], [15, 2000, 3859],
    [30, 500, 1897], [30, 1000, 3064], [30, 1500, 4291], [30, 2000, 5410]
  ];

  var RATES = [];

  function add(row) { RATES.push(row); }

  // —— GPTA 既有真實試算點（優先，來源標註）——
  add({ rateType: 'agency', region: 'asia14', ageBand: '18-65', days: 5, at1Wan: 500, oh1Wan: 50, mrWan: 50, oaa: true, premium: 850,
    source: 'GPTA 結果截圖 kr5_life500_result.png（亦等於 DM 旅行社適用 5天/500萬）' });
  add({ rateType: 'agency', region: 'asia14', ageBand: '18-65', days: 5, at1Wan: 300, oh1Wan: 30, mrWan: 30, oaa: true, premium: 617,
    source: 'GPTA 報價稿 kr5_3plans.txt' });
  add({ rateType: 'agency', region: 'asia14', ageBand: '18-65', days: 7, at1Wan: 500, oh1Wan: 50, mrWan: 50, oaa: true, premium: 982,
    source: 'GPTA 報價稿 jp7_3plans_v5（日本7天）' });
  add({ rateType: 'agency', region: 'asia14', ageBand: '18-65', days: 7, at1Wan: 300, oh1Wan: 30, mrWan: 30, oaa: true, premium: 708,
    source: 'GPTA 報價稿 jp7_3plans_v5（日本7天）' });
  add({ rateType: 'agency', region: 'asia14', ageBand: '18-65', days: 7, at1Wan: 200, oh1Wan: 20, mrWan: 20, oaa: true, premium: 573,
    source: 'quote_flow.md／quote_line.txt（亞洲14國／18-65／7天／AT1 200）' });

  // —— DM 稀疏表（與上方 GPTA 重複的 5天/500 略過，避免重複）——
  DM_AGENCY_APPLY.forEach(function (t) {
    var days = t[0], at1 = t[1], prem = t[2];
    if (days === 5 && at1 === 500) return; // 已有 GPTA 點
    var oh = Math.round(at1 * 0.1);
    add({ rateType: 'agency', region: 'asia14', ageBand: '18-65', days: days, at1Wan: at1, oh1Wan: oh, mrWan: oh, oaa: true, premium: prem,
      source: 'Go安行 DM 國外・旅行社／快易保・適用（dm_rules.md）' });
  });

  // 亞洲14國關鍵字（OAA 服務區；與 DM／表單備註一致）
  var ASIA14 = ['中國', '大陸', '香港', '澳門', '日本', '韓國', '南韓', '越南', '新加坡', '菲律賓', '印尼', '馬來西亞', '緬甸', '泰國', '寮國', '柬埔寨', '帛琉', '馬爾地夫', '亞洲14', '亞洲十四'];

  function guessLifeRegion(destination) {
    var d = String(destination || '');
    for (var i = 0; i < ASIA14.length; i++) if (d.indexOf(ASIA14[i]) >= 0) return 'asia14';
    return 'other';
  }

  function effectiveOh1Mr(life) {
    var at1 = Number(life && life.at1Wan);
    if (!isFinite(at1) || at1 <= 0) return { oh1: null, mr: null };
    var oh1 = (life.oh1Wan === null || life.oh1Wan === undefined || life.oh1Wan === '') ? at1 * 0.1 : Number(life.oh1Wan);
    var mr = (life.mrWan === null || life.mrWan === undefined || life.mrWan === '') ? at1 * 0.1 : Number(life.mrWan);
    return { oh1: oh1, mr: mr };
  }

  /**
   * 精確比對查表（不內插、不四捨五入湊近）。
   * @returns {{found:boolean, premium?:number, source?:string, tip:string}}
   */
  function lookupLifePremium(quote, plan) {
    var life = (plan && plan.life) || {};
    if (!life.enabled) {
      return { found: true, premium: 0, source: '未含人壽', tip: '未投保人壽，保費 0' };
    }
    var at1 = Number(life.at1Wan);
    if (!isFinite(at1) || at1 <= 0) {
      return { found: false, tip: '請先填 AT1 主約保額' };
    }
    var em = effectiveOh1Mr(life);
    var days = Number(quote.days);
    var ageBand = quote.ageBand || '18-65';
    var rateType = quote.lifeRateType || 'agency';
    var region = quote.lifeRegion || guessLifeRegion(quote.destination);
    var oaa = !!life.oaa;

    if (!isFinite(days) || days <= 0) {
      return { found: false, tip: '請先填投保天數' };
    }
    if (region !== 'asia14' && oaa) {
      return { found: false, tip: 'OAA 僅限亞洲14國；目前地區＝' + region + '，尚無對應費率表' };
    }

    for (var i = 0; i < RATES.length; i++) {
      var r = RATES[i];
      if (r.rateType !== rateType) continue;
      if (r.region !== region) continue;
      if (r.ageBand !== ageBand) continue;
      if (Number(r.days) !== days) continue;
      if (Number(r.at1Wan) !== at1) continue;
      if (Number(r.oh1Wan) !== Number(em.oh1)) continue;
      if (Number(r.mrWan) !== Number(em.mr)) continue;
      if (!!r.oaa !== oaa) continue;
      return {
        found: true,
        premium: r.premium,
        source: r.source,
        tip: '自動：' + r.premium.toLocaleString('en-US') + ' 元（' + r.source.split('（')[0].trim() + '）'
      };
    }
    return {
      found: false,
      tip: '尚無此組合費率（' + rateType + '／' + region + '／' + ageBand + '／' + days + '天／AT1 ' + at1 + '萬／OH1 ' + em.oh1 + '／MR ' + em.mr + '／OAA ' + (oaa ? '有' : '無') + '），請用 GPTA 試算後手填'
    };
  }

  function listKnownCombos() {
    return RATES.map(function (r) {
      return r.days + '天 AT1' + r.at1Wan + '（OH1/MR ' + r.oh1Wan + '）OAA' + (r.oaa ? '開' : '關') + '＝' + r.premium + '　← ' + r.source;
    });
  }

  global.LIFE_RATES = {
    rates: RATES,
    guessLifeRegion: guessLifeRegion,
    lookupLifePremium: lookupLifePremium,
    listKnownCombos: listKnownCombos,
    ASIA14: ASIA14
  };
})(window);
