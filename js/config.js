/*
 * 網站設定（部署後填入；留空＝該功能自動略過，不影響網站運作）
 *
 * USAGE_LOG_URL    ：Google Apps Script 網頁應用程式網址（https://script.google.com/macros/s/……/exec）
 *                    → 每次開啟頁面（open）與成功下載三方案總表圖（download）寫入試算表「旅平險報價系統_使用紀錄」
 *                    程式碼：tools/usage_log_apps_script.gs
 * GOATCOUNTER_CODE ：GoatCounter 站台代碼（例：nanen-travel → https://nanen-travel.goatcounter.com）
 *                    → 匿名流量統計（每日瀏覽、城市／國家、裝置、瀏覽器）
 */
window.TQ_CONFIG = {
  USAGE_LOG_URL: '',
  GOATCOUNTER_CODE: ''
};
