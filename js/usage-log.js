/* 使用紀錄與流量統計（fire-and-forget；任何錯誤都吞掉，絕不影響報價／下載） */
(function (global) {
  'use strict';
  var CFG = global.TQ_CONFIG || {};
  var LOG_URL = String(CFG.USAGE_LOG_URL || '').trim();
  var GC_CODE = String(CFG.GOATCOUNTER_CODE || '').trim().toLowerCase();

  function buildVersion() {
    var m = document.querySelector('meta[name="tq-build"]');
    var v = m ? m.getAttribute('content') : '';
    return /__BUILD_LABEL__/.test(v) ? 'dev' : v;
  }

  /** 裝置類型與作業系統（只用 UA 粗分，不收集指紋） */
  function deviceInfo() {
    var ua = navigator.userAgent || '';
    var touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1; // iPadOS 桌面版 UA
    var os = /iPhone|iPad|iPod/.test(ua) || touchMac ? 'iOS' : /Android/.test(ua) ? 'Android' :
      /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '其他';
    var type = /iPad|Tablet/.test(ua) || touchMac || (/Android/.test(ua) && !/Mobile/.test(ua)) ? '平板' :
      /Mobi|iPhone|iPod|Android/.test(ua) ? '手機' : '電腦';
    return { type: type, os: os };
  }

  function post(payload) {
    if (!LOG_URL) return false;
    try {
      var body = JSON.stringify(payload);
      // text/plain＝簡單請求（不觸發 CORS preflight）；no-cors 不讀回應；keepalive 讓頁面關閉時仍送出
      var p = fetch(LOG_URL, { method: 'POST', mode: 'no-cors', cache: 'no-store', keepalive: true, credentials: 'omit',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body });
      if (p && p.catch) p.catch(function () {});
      return true;
    } catch (e) {
      try { return !!(navigator.sendBeacon && navigator.sendBeacon(LOG_URL, new Blob([JSON.stringify(payload)], { type: 'text/plain' }))); } catch (e2) { return false; }
    }
  }

  /** 開啟頁面（同一分頁工作階段每頁只記一次，重新整理不重複計） */
  function logOpen(page, extra) {
    try {
      var key = 'tq-open-logged-' + page;
      try { if (sessionStorage.getItem(key)) return false; } catch (e) {}
      var d = deviceInfo();
      var ref = '';
      try { ref = document.referrer ? new URL(document.referrer).host : ''; } catch (e) {}
      var ok = post(Object.assign({
        event: 'open', page: page, device: d.type, os: d.os, screenW: (global.screen && screen.width) || '',
        referrer: ref, version: buildVersion(), lang: navigator.language || ''
      }, extra || {}));
      if (ok) { try { sessionStorage.setItem(key, '1'); } catch (e) {} }
      return ok;
    } catch (e) { return false; }
  }

  /** 成功下載三方案總表圖 */
  function logDownload(row) {
    try {
      var d = deviceInfo();
      return post(Object.assign({ event: 'download', version: buildVersion(), device: d.type + '・' + d.os,
        url: location.origin + location.pathname }, row || {}));
    } catch (e) { return false; }
  }

  /** GoatCounter（匿名、無 cookie）；不送 #q= 報價內容（GoatCounter 預設只記 path） */
  function initGoatCounter() {
    if (!GC_CODE || !/^[a-z0-9-]+$/.test(GC_CODE)) return false;
    try {
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://gc.zgo.at/count.js';
      s.setAttribute('data-goatcounter', 'https://' + GC_CODE + '.goatcounter.com/count');
      document.head.appendChild(s);
      return true;
    } catch (e) { return false; }
  }

  global.TQ_LOG = { enabled: !!LOG_URL, goatcounter: !!GC_CODE, logOpen: logOpen, logDownload: logDownload,
    deviceInfo: deviceInfo, buildVersion: buildVersion, initGoatCounter: initGoatCounter };
  initGoatCounter();
})(window);
