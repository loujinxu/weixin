// pages/countdown/countdown.js
const store = require('../../utils/store.js');

Page({
  data: {
    noReservation: false,
    countdownText: '00:00',
    showEndModal: false,
    endedSeatId: ''
  },
  _timer: null,
  onLoad() {},
  onShow() {
    store.releaseExpiredReservations();
    this.startCountdown();
  },
  onUnload() {
    if (this._timer) clearInterval(this._timer);
  },
  startCountdown() {
    const userId = store.getUserId();
    const active = store.getMyActiveReservation(userId);
    if (!active) {
      this.setData({ noReservation: true });
      return;
    }
    this.setData({ noReservation: false });
    const update = () => {
      const now = Date.now();
      const remain = Math.max(0, Math.floor((active.endAt - now) / 1000));
      const m = Math.floor(remain / 60);
      const s = remain % 60;
      const text = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      this.setData({ countdownText: text });
      if (remain <= 0) {
        if (this._timer) clearInterval(this._timer);
        this._timer = null;
        this._onCountdownEnd(active);
        return;
      }
    };
    update();
    this._timer = setInterval(update, 1000);
  },
  _onCountdownEnd(active) {
    const reservations = store.getReservations();
    const seats = store.getSeats();
    const r = reservations.find(x => x.id === active.id);
    if (r && (r.status === 'active' || r.status === 'leave')) {
      r.status = 'finished';
      const seat = seats.find(s => s.id === r.seatId);
      if (seat) {
        seat.status = 'available';
        seat.reservedBy = null;
        seat.reservedAt = null;
        seat.leaveUntil = null;
      }
      store.setReservations(reservations);
      store.setSeats(seats);
    }
    this.setData({
      showEndModal: true,
      endedSeatId: active.seatId
    });
  },
  hideEndModal() {
    this.setData({ showEndModal: false });
  },
  prevent() {},
  reReserve() {
    const seatId = this.data.endedSeatId;
    this.setData({ showEndModal: false });
    wx.redirectTo({
      url: '/pages/timeslot/timeslot?seatId=' + encodeURIComponent(seatId) + '&fromReserveAgain=1'
    });
  },
  confirmLeave() {
    this.setData({ showEndModal: false });
    wx.redirectTo({ url: '/pages/index/index' });
  },
  leaveSeat() {
    const result = store.cancelReservation(store.getUserId());
    if (result.ok) {
      wx.redirectTo({ url: '/pages/index/index' });
    } else {
      wx.showToast({ title: result.msg || '操作失败', icon: 'none' });
    }
  },
  tempLeave() {
    const result = store.applyLeave(store.getUserId(), 30);
    if (result.ok) {
      wx.redirectTo({ url: '/pages/templeave/templeave' });
    } else {
      wx.showToast({ title: result.msg || '操作失败', icon: 'none' });
    }
  },
  goHome() {
    wx.redirectTo({ url: '/pages/index/index' });
  }
});
