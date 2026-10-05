/* 三方案總表報價圖：在編輯器產生可下載 PNG（適合 LINE） */
(function (global) {
  'use strict';

  function buildSummaryHtml(quote) {
    var mode = quote.dateFormat === 'ad' ? 'ad' : 'roc';
    var dates = '';
    if (quote.startDate || quote.endDate) {
      dates = TQ.fmtDate(quote.startDate, mode) + ' ～ ' + TQ.fmtDate(quote.endDate, mode);
    }
    var a = quote.agent || {};
    var h = '';
    h += '<div class="sum-root" id="summaryCapture">';
    if (quote.sample) h += '<div class="sum-sample">⚠ 範例資料・非正式報價</div>';
    h += '<header class="sum-hero">';
    h += '<div class="sum-kicker">旅平險 三方案總表</div>';
    h += '<div class="sum-title"><span class="dest">' + TQ.esc(quote.destination || '—') + '</span>';
    h += '<span class="days">' + TQ.esc(quote.days || '—') + '<small> 天</small></span></div>';
    if (dates) h += '<div class="sum-dates">' + TQ.esc(dates) + '</div>';
    h += '</header>';
    h += '<div class="sum-plans">';
    (quote.plans || []).forEach(function (plan, idx) {
      var c = TQ.computePlan(plan, quote);
      var L = c.life, P = c.prop, on = L.enabled;
      h += '<section class="sum-card' + (plan.recommended ? ' reco' : '') + '">';
      h += '<div class="sum-card-h"><span class="sum-name">' + TQ.esc(plan.name || ('方案' + (idx + 1))) + '</span>';
      if (plan.recommended) h += '<span class="sum-badge">推薦</span>';
      h += '</div>';
      h += '<div class="sum-tag">' + TQ.esc(plan.tagline || '') + '</div>';
      h += '<div class="sum-death"><div class="lab">意外身故・失能</div><div class="val">' + TQ.esc(TQ.fmtYuan(c.death)) + '</div>';
      h += '<div class="br">' + TQ.esc(on ? ('人壽 ' + TQ.fmtShort(L.at1) + '＋產險 ' + TQ.fmtShort(P.death)) : ('產險 ' + TQ.fmtShort(P.death))) + '</div></div>';
      h += '<ul class="sum-cov">';
      h += '<li><span>海外突發 住院</span><b>' + TQ.esc(TQ.fmtYuan(c.hospital)) + '</b></li>';
      h += '<li><span>海外突發 門診</span><b>' + TQ.esc(TQ.fmtYuan(c.outpatient)) + '</b></li>';
      h += '<li><span>海外突發 急診</span><b>' + TQ.esc(TQ.fmtYuan(c.er)) + '</b></li>';
      h += '<li><span>意外醫療</span><b>' + TQ.esc(TQ.fmtYuan(c.accidentMedical)) + '</b></li>';
      h += '</ul>';
      // 不便險精簡：前 4 項 + 其餘數
      var items = (plan.inconvenience || []).slice(0, 4);
      if (items.length) {
        h += '<div class="sum-sec">不便險</div><ul class="sum-items">';
        items.forEach(function (it) {
          h += '<li><span>' + TQ.esc(it.name) + '</span><span>' + TQ.esc(it.amount) + '</span></li>';
        });
        var more = (plan.inconvenience || []).length - items.length;
        if (more > 0) h += '<li class="more">…另有 ' + more + ' 項不便險／詳見完整報價</li>';
        h += '</ul>';
      }
      h += '<div class="sum-prem">壽 ' + TQ.comma(L.premium) + ' ＋ 產 ' + TQ.comma(P.premium) +
        ' ＝ <b>' + TQ.comma(c.premium) + '</b> 元</div>';
      h += '</section>';
    });
    h += '</div>';
    h += '<footer class="sum-foot">';
    h += '<div class="u">富邦人壽 ' + TQ.esc(a.unit || '南恩通訊處') + '</div>';
    h += '<div class="p">' + TQ.esc(a.title || '業務經理') + ' <b>' + TQ.esc(a.name || '陳銘旭') + '</b>';
    h += ' ／ ' + TQ.esc(a.managerTitle || '處經理') + ' <b>' + TQ.esc(a.manager || '林秋慧') + '</b></div>';
    h += '<div class="note">實際以保單條款及核保為準</div>';
    h += '</footer></div>';
    return h;
  }

  function ensureHost() {
    var host = document.getElementById('summaryExportHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'summaryExportHost';
      host.setAttribute('aria-hidden', 'true');
      document.body.appendChild(host);
    }
    return host;
  }

  function downloadSummaryPng(quote) {
    if (!global.html2canvas) {
      alert('缺少 html2canvas，無法產生圖片');
      return Promise.reject(new Error('no html2canvas'));
    }
    var host = ensureHost();
    host.innerHTML = buildSummaryHtml(quote);
    var el = host.querySelector('#summaryCapture');
    return global.html2canvas(el, {
      scale: 2,
      backgroundColor: '#f4f6f9',
      useCORS: true,
      logging: false,
      width: el.scrollWidth,
      height: el.scrollHeight
    }).then(function (canvas) {
      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) {
          var name = (quote.sample ? '範例_' : '') + (quote.destination || '旅平險') +
            (quote.days || '') + '天_三方案總表.png';
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = name;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
          host.innerHTML = '';
          resolve(name);
        }, 'image/png');
      });
    }).catch(function (err) {
      host.innerHTML = '';
      throw err;
    });
  }

  global.TQ_SUMMARY = { downloadSummaryPng: downloadSummaryPng, buildSummaryHtml: buildSummaryHtml };
})(window);
