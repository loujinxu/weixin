// pages/timeslot/timeslot.js
const store = require('../../utils/store.js');

Page({
  data: {
    seatId: '',
    fromReserveAgain: false,
    slots: [
      { label: '1:00', value: 60 },
      { label: '2:00', value: 120 },
      { label: '3:00', value: 180 },
      { label: '4:00', value: 240 },
      { label: '5:00', value: 300 },
      { label: '6:00', value: 360 }
    ],
    selectedIndex: -1
  },
  onLoad(options) {
    const seatId = options.seatId || '';
    const fromReserveAgain = options.fromReserveAgain === '1';
    this.setData({ seatId, fromReserveAgain });
  },
  onSelectSlot(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10);
    this.setData({ selectedIndex: index });
  },
  cancel() {
    wx.navigateBack();
  },
  confirm() {
    const { seatId, slots, selectedIndex, fromReserveAgain } = this.data;
    if (!seatId || selectedIndex < 0) {
      wx.showToast({ title: '请选择预约时段', icon: 'none' });
      return;
    }
    const durationMinutes = slots[selectedIndex].value;
    const result = store.reserveSeat(seatId, store.getUserId(), durationMinutes, fromReserveAgain);
    if (result.ok) {
      wx.redirectTo({
        url: '/pages/countdown/countdown'
      });
    } else {
      wx.showToast({ title: result.msg || '预约失败', icon: 'none' });
    }
  }
});
