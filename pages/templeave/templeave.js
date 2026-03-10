// pages/templeave/templeave.js
const store = require('../../utils/store.js');

Page({
  data: {
    noLeave: false,
    countdownText: '30:00'
  },
  _timer: null,
  onShow() {
    store.releaseExpiredReservations();
    this.startLeaveCountdown();
  },
  onUnload() {
    if (this._timer) clearInterval(this._timer);
  },
  startLeaveCountdown() {
    const userId = store.getUserId();
    const active = store.getMyActiveReservation(userId);
    if (!active || active.status !== 'leave' || !active.leaveUntil) {
      this.setData({ noLeave: true });
      return;
    }
    this.setData({ noLeave: false });
    const update = () => {
      const now = Date.now();
      const remain = Math.max(0, Math.floor((active.leaveUntil - now) / 1000));
      const m = Math.floor(remain / 60);
      const s = remain % 60;
      this.setData({ countdownText: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` });
      if (remain <= 0) {
        if (this._timer) clearInterval(this._timer);
        this._timer = null;
        wx.redirectTo({ url: '/pages/index/index' });
      }
    };
    update();
    this._timer = setInterval(update, 1000);
  },
  cancelLeave() {
    const app = getApp();
    app.checkIsLibraryWifi((isConnected, errMsg) => {
      if (!isConnected) {
        wx.showToast({ title: errMsg || '请连接图书馆 WiFi 后再取消暂离', icon: 'none', duration: 2500 });
        return;
      }
      const result = store.backFromLeave(store.getUserId());
      if (result.ok) {
        wx.redirectTo({ url: '/pages/countdown/countdown' });
      } else {
        wx.showToast({ title: result.msg || '操作失败', icon: 'none' });
      }
    });
  },
  goHome() {
    wx.redirectTo({ url: '/pages/index/index' });
  }
});
