/**
 * Sugar Rush — Ads Manager
 * Rewarded ad system: no forced/interstitial ads.
 * Ads only appear on defeat ("out of moves") to offer +5 extra moves.
 *
 * Architecture:
 *  - Mock ad: a 5-second countdown video placeholder for school demo.
 *  - AdMob bridge: drop in Google AdMob for Android by replacing
 *    `AdManager.showRewardedAd(onReward, onCancel)` with the native bridge.
 *
 * For Google Play / AdMob integration:
 *    admob.rewardedAd.load({ adUnitId: 'ca-app-pub-XXXXXXXX/YYYYYYYY' });
 *    admob.rewardedAd.show();
 *    admob.rewardedAd.on('rewarded', ev => onReward(ev.amount));
 */

'use strict';

const AdManager = (() => {

  let _modal = null;
  let _timer = null;
  let _onReward = null;
  let _onCancel = null;
  let _isMockMode = true; // set false when real AdMob is integrated

  // ── DOM Helpers ──────────────────────────────────────────────────────────────

  function buildModal() {
    if (_modal) return;
    _modal = document.createElement('div');
    _modal.id = 'ad-modal';
    _modal.innerHTML = `
      <div class="ad-box">
        <div class="ad-label">Advertisement</div>
        <div class="ad-content">
          <div class="ad-video-placeholder">
            <div class="ad-video-icon">▶</div>
            <div class="ad-video-title">Sugar Rush Premium</div>
            <div class="ad-video-sub">Watch to earn +${Config.ADS.REWARD_EXTRA_MOVES} moves and keep your level!</div>
          </div>
          <div class="ad-progress-bar"><div class="ad-progress-fill" id="ad-progress-fill"></div></div>
          <div class="ad-countdown" id="ad-countdown">Watch for <span id="ad-count">${Config.ADS.MOCK_AD_DURATION_MS / 1000}</span>s...</div>
        </div>
        <div class="ad-actions">
          <button class="btn-secondary" id="ad-skip-btn" disabled>Skip</button>
          <span class="ad-reward-msg" id="ad-reward-msg" style="display:none">
            ✅ +${Config.ADS.REWARD_EXTRA_MOVES} Moves Granted!
          </span>
        </div>
      </div>
    `;
    document.body.appendChild(_modal);
  }

  function showModal() {
    if (!_modal) buildModal();
    _modal.classList.add('visible');
  }

  function hideModal() {
    if (_modal) _modal.classList.remove('visible');
    clearInterval(_timer);
  }

  // ── Mock Ad Playback ─────────────────────────────────────────────────────────

  function runMockAd(onReward, onCancel) {
    showModal();
    const durationMs = Config.ADS.MOCK_AD_DURATION_MS;
    const totalSec = durationMs / 1000;
    let remaining = totalSec;

    const countEl   = document.getElementById('ad-count');
    const fillEl    = document.getElementById('ad-progress-fill');
    const skipBtn   = document.getElementById('ad-skip-btn');
    const rewardMsg = document.getElementById('ad-reward-msg');

    if (rewardMsg) rewardMsg.style.display = 'none';
    if (skipBtn)   { skipBtn.disabled = true; skipBtn.onclick = null; }
    if (countEl)   countEl.textContent = totalSec;
    if (fillEl)    fillEl.style.width  = '0%';

    _timer = setInterval(() => {
      remaining--;
      if (countEl) countEl.textContent = Math.max(0, remaining);
      const pct = ((totalSec - remaining) / totalSec) * 100;
      if (fillEl) fillEl.style.width = pct + '%';

      if (remaining <= 0) {
        clearInterval(_timer);
        // Ad finished — grant reward
        if (countEl)   countEl.parentElement.style.display = 'none';
        if (rewardMsg) rewardMsg.style.display = 'block';
        if (skipBtn) {
          skipBtn.disabled  = false;
          skipBtn.textContent = 'Collect Reward';
          skipBtn.onclick = () => {
            hideModal();
            onReward(Config.ADS.REWARD_EXTRA_MOVES);
          };
        }
      }
    }, 1000);

    // Skip button becomes active after 3 seconds (cancels reward)
    setTimeout(() => {
      if (skipBtn && skipBtn.disabled && remaining > 0) {
        // Keep disabled until ad completes in this implementation
        // (user must watch the whole mock ad to get reward)
      }
    }, 3000);
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Show a rewarded ad.
   * @param {Function} onReward  - called with (movesGranted) when ad completes
   * @param {Function} onCancel  - called when user dismisses without watching
   */
  function showRewardedAd(onReward, onCancel) {
    _onReward = onReward;
    _onCancel = onCancel;

    if (_isMockMode) {
      runMockAd(onReward, onCancel || (() => {}));
      return;
    }

    // ── Real AdMob Bridge (for Android / Play Store) ─────────────────────────
    // When building with Capacitor or Cordova + AdMob plugin:
    //
    // import { AdMob, RewardAdPluginEvents } from '@capacitor-community/admob';
    //
    // const options = {
    //   adId: 'ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY',
    //   isTesting: false,
    // };
    // await AdMob.prepareRewardVideoAd(options);
    // AdMob.addListener(RewardAdPluginEvents.Rewarded, (reward) => {
    //   onReward(Config.ADS.REWARD_EXTRA_MOVES);
    // });
    // await AdMob.showRewardVideoAd();
    //
    // ────────────────────────────────────────────────────────────────────────
    console.warn('[AdManager] Real AdMob not configured. Using mock.');
    runMockAd(onReward, onCancel || (() => {}));
  }

  function setMockMode(val) { _isMockMode = !!val; }

  function init() {
    buildModal();
  }

  return { init, showRewardedAd, setMockMode };
})();
