// pages/seat/seat.js
const store = require('../../utils/store.js');
const util = require('../../utils/util.js');

Page({
  data: {
    floors: ['A', 'B', 'C'],
    currentFloor: 'A',
    seats: [],
    isBlacklisted: false,
    violationMsg: ''
  },
  onLoad() {
    const userId = store.getUserId();
    if (store.isBlacklisted(userId)) {
      this.setData({ isBlacklisted: true });
      return;
    }
    const until = store.getViolationUntil(userId);
    if (until > 0) {
      this.setData({
        violationMsg: '您因违规已被限制预约，24小时后方可再次预约。'
      });
      return;
    }
    if (store.getMyActiveReservation(userId)) {
      wx.showToast({ title: '您已有进行中的预约', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.loadSeats('A');
  },
  onFloorChange(e) {
    const floor = e.currentTarget.dataset.floor;
    this.setData({ currentFloor: floor });
    this.loadSeats(floor);
  },
  loadSeats(floor) {
    const seats = store.getSeats().filter(s => s.floor === floor);
    const list = seats.map(s => ({
      ...s,
      statusText: util.statusText(s.status)
    }));
    this.setData({ seats: list });
  },
  selectSeat(e) {
    const id = e.currentTarget.dataset.id;
    const seat = this.data.seats.find(s => s.id === id);
    if (seat && seat.status !== 'available') {
      wx.showToast({ title: '该座位已被预约', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/timeslot/timeslot?seatId=' + encodeURIComponent(id)
    });
  },
  goBack() {
    wx.navigateBack();
  }
});
