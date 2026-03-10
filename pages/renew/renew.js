// pages/renew/renew.js
const store = require('../../utils/store.js');
const util = require('../../utils/util.js');

Page({
  data: {
    hasActive: false,
    reservation: null,
    renewOptions: [
      { label: '1小时', value: 60 },
      { label: '2小时', value: 120 },
      { label: '3小时', value: 180 },
      { label: '4小时', value: 240 }
    ],
    renewIndex: 1
  },
  onLoad() {
    this.refresh();
  },
  onShow() {
    this.refresh();
  },
  refresh() {
    store.releaseExpiredReservations();
    const active = store.getMyActiveReservation(store.getUserId());
    if (active) {
      this.setData({
        hasActive: true,
        reservation: {
          seatId: active.seatId,
          endAtText: util.formatTime(active.endAt),
          statusText: util.statusText(active.status)
        },
        renewIndex: 1
      });
    } else {
      this.setData({ hasActive: false, reservation: null });
    }
  },
  goBack() {
    wx.navigateBack();
  },
  onRenewDurationChange(e) {
    this.setData({ renewIndex: parseInt(e.detail.value, 10) });
  },
  submitRenew() {
    const { renewOptions, renewIndex } = this.data;
    const extraMinutes = renewOptions[renewIndex].value;
    const result = store.renewSeat(store.getUserId(), extraMinutes);
    if (result.ok) {
      wx.showToast({ title: '续约成功' });
      this.refresh();
    } else {
      wx.showToast({ title: result.msg || '续约失败', icon: 'none' });
    }
  },
  cancelReservation() {
    wx.showModal({
      title: '确认取消',
      content: '确定取消当前预约并释放座位？',
      success: res => {
        if (res.confirm) {
          store.cancelReservation(store.getUserId());
          wx.showToast({ title: '已取消预约' });
          setTimeout(() => wx.navigateBack(), 1500);
        }
      }
    });
  }
});
