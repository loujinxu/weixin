// pages/leave/leave.js
const store = require('../../utils/store.js');
const util = require('../../utils/util.js');

Page({
  data: {
    hasActive: false,
    reservation: null,
    leaveOptions: [
      { label: '15分钟', value: 15 },
      { label: '30分钟', value: 30 },
      { label: '45分钟', value: 45 },
      { label: '60分钟', value: 60 }
    ],
    leaveIndex: 1
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
      const isLeave = active.status === 'leave';
      this.setData({
        hasActive: true,
        reservation: {
          seatId: active.seatId,
          endAtText: util.formatTime(active.endAt),
          statusText: util.statusText(active.status),
          leaveUntilText: active.leaveUntil ? util.formatTime(active.leaveUntil) : null,
          isLeave
        },
        leaveIndex: 1
      });
    } else {
      this.setData({ hasActive: false, reservation: null });
    }
  },
  onLeaveDurationChange(e) {
    this.setData({ leaveIndex: parseInt(e.detail.value, 10) });
  },
  applyLeave() {
    const { leaveOptions, leaveIndex, reservation } = this.data;
    if (reservation && reservation.isLeave) {
      wx.showToast({ title: '您已在暂离中', icon: 'none' });
      return;
    }
    const minutes = leaveOptions[leaveIndex].value;
    const result = store.applyLeave(store.getUserId(), minutes);
    if (result.ok) {
      wx.showToast({ title: '暂离申请成功' });
      this.refresh();
    } else {
      wx.showToast({ title: result.msg || '申请失败', icon: 'none' });
    }
  },
  goBack() {
    wx.navigateBack();
  },
  backFromLeave() {
    const result = store.backFromLeave(store.getUserId());
    if (result.ok) {
      wx.showToast({ title: '已返回座位' });
      this.refresh();
    } else {
      wx.showToast({ title: result.msg || '操作失败', icon: 'none' });
    }
  }
});
