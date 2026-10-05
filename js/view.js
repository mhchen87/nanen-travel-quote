/* 報價頁載入順序：
 * 1. 網址 #q=…（編輯器產生的分享連結，資料全在網址內，不需伺服器）
 * 2. ?src=xxx.json（放在同一個網站上的報價 JSON）
 * 3. 同資料夾的 quote.json（以網站伺服器開啟時）
 * 4. 以上皆無 → 顯示內建範例資料（頁面會標示「範例」）
 */
(function () {
  'use strict';
  var app = document.getElementById('app');

  function show(q, forceSample) {
    if (forceSample) q.sample = true;
    document.title = TQ.titleFor(q);
    TQ.renderQuote(q, app);
  }
  function showError(msg) {
    app.innerHTML = '<div class="error-box"><h2>無法讀取報價資料</h2><p>' + TQ.esc(msg) +
      '</p><p>請向您的服務專員索取新的連結。</p></div>';
  }
  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function load() {
    var fromHash;
    try { fromHash = TQ.decodeHash(location.hash); }
    catch (e) { showError('分享連結內容不完整或已損毀（' + e.message + '）。'); return; }
    if (fromHash) { show(fromHash, false); return; }

    var src = new URLSearchParams(location.search).get('src');
    var tryUrl = src || (location.protocol.indexOf('http') === 0 ? 'quote.json' : null);
    if (tryUrl) {
      fetchJson(tryUrl).then(function (q) { show(q, false); })
        .catch(function () {
          if (src) showError('找不到報價檔：' + src);
          else show(JSON.parse(JSON.stringify(window.SAMPLE_QUOTE)), true);
        });
      return;
    }
    show(JSON.parse(JSON.stringify(window.SAMPLE_QUOTE)), true);
  }
  window.addEventListener('hashchange', function () {
    if (/^#(q|j)=/.test(location.hash)) load();
  });
  load();
})();
