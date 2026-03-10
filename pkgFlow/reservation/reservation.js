const app = getApp();

Page({
  data: {
    seatNumber: 0,
    seatLabel: '',
    hours: 0,
    countdownText: '00:00:00',
    countdownTimer: null,
    remainingSeconds: 0,
    tempLeaveCount: 0,
    maxTempLeaves: 1,
    canTempLeave: true,
    showTimeEndModal: false,
    isRenewProcess: false
  },

  onLoad: function(options) {
    const seatNumber = parseInt(options.seatNumber) || 0;
    this.setData({
      seatNumber,
      seatLabel: app.formatSeatLabel(seatNumber),
      hours: parseInt(options.hours) || 1,
      isRenewProcess: options.isRenewProcess === 'true'
    });
  },

  onShow: function() {
    this.loadReservationInfo();
    this.startCountdown();
  },

  onUnload: function() { this.clearTimers(); },
  onHide: function() { this.clearTimers(); },

  loadReservationInfo: function() {
    const seatNumber = this.data.seatNumber;
    const reservation = app.globalData.reservedSeats[seatNumber];
    if (!reservation) {
      wx.reLaunch({ url: '/pages/index/index' });
      return;
    }
    if (reservation.isTempLeave) {
      wx.redirectTo({ url: `/pkgFlow/temporary/temporary?seatNumber=${seatNumber}` });
      return;
    }
    const remainingSeconds = app.getRemainingReservationSeconds(seatNumber);
    const tempLeaveCount = reservation.tempLeaveCount || 0;
    const maxTempLeaves = this.getMaxTempLeaves(reservation.hours);
    this.setData({ remainingSeconds, tempLeaveCount, maxTempLeaves });
  },

  getMaxTempLeaves: function(hours) {
    if (hours <= 2) return 1;
    if (hours <= 4) return 2;
    return 4;
  },

  startCountdown: function() {
    this.clearTimers();
    const updateCountdown = () => {
      const seatNumber = this.data.seatNumber;
      const reservation = app.globalData.reservedSeats[seatNumber];
      if (!reservation) {
        this.clearTimers();
        wx.reLaunch({ url: '/pages/index/index' });
        return;
      }
      const remainingSeconds = app.getRemainingReservationSeconds(seatNumber);
      if (remainingSeconds <= 0) {
        this.setData({ countdownText: '00:00:00', remainingSeconds: 0 });
        this.handleTimeEnd();
        return;
      }
      const h = Math.floor(remainingSeconds / 3600);
      const m = Math.floor((remainingSeconds % 3600) / 60);
      const s = remainingSeconds % 60;
      this.setData({
        countdownText: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`,
        remainingSeconds
      });
    };
    updateCountdown();
    this.setData({ countdownTimer: setInterval(updateCountdown, 1000) });
  },

  clearTimers: function() {
    if (this.data.countdownTimer) {
      clearInterval(this.data.countdownTimer);
      this.setData({ countdownTimer: null });
    }
  },

  handleTimeEnd: function() {
    this.clearTimers();
    const seatNumber = this.data.seatNumber;
    const reservation = app.globalData.reservedSeats[seatNumber];
    if (reservation) {
      reservation.status = 'expired';
      wx.setStorageSync('reservedSeats', app.globalData.reservedSeats);
    }
    app.updateReservationStatus(seatNumber, Date.now(), "已过期");
    this.setData({ showTimeEndModal: true });
  },

  renewReservation: function() {
    this.setData({ showTimeEndModal: false });
    const seatNumber = this.data.seatNumber;
    const reservation = app.globalData.reservedSeats[seatNumber];
    if (!reservation) {
      wx.showModal({ title: "无法续约", content: "预约信息已失效，请重新预约", showCancel: false });
      return;
    }
    if (reservation.userId !== app.globalData.currentUserId) {
      wx.showModal({ title: "无法续约", content: "该座位不是您的预约", showCancel: false });
      return;
    }
    app.setRenewingSeat(seatNumber, reservation.hours);
    wx.navigateTo({ url: `/pkgFlow/timeSelect/timeSelect?seatNumber=${seatNumber}&isRenew=true&expiredHours=${reservation.hours}` });
  },

  handleCancel: function() {
    this.setData({ showTimeEndModal: false });
    delete app.globalData.reservedSeats[this.data.seatNumber];
    wx.setStorageSync('reservedSeats', app.globalData.reservedSeats);
  },

  endReservation: function() {
    const self = this;
    wx.showModal({
      title: '确认退坐',
      content: '确定要结束当前预约吗？',
      success: (res) => {
        if (res.confirm) {
          self.clearTimers();
          self.setData({ countdownText: '00:00:00', remainingSeconds: 0 });
          app.check24HourEndReservations();
          app.endReservationImmediately(self.data.seatNumber, "已退坐", false);
          app.recordViolation('end_reservation');
          wx.showToast({ title: '退坐成功，座位已释放', icon: 'success', duration: 1500 });
          setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 1500);
        }
      }
    });
  },

  startTempLeave: function() {
    const seatNumber = this.data.seatNumber;
    const reservation = app.globalData.reservedSeats[seatNumber];
    if (!reservation) {
      wx.showToast({ title: '预约信息不存在', icon: 'none', duration: 2000 });
      return;
    }
    const maxTempLeaves = this.getMaxTempLeaves(reservation.hours);
    const currentTempCount = reservation.tempLeaveCount || 0;
    if (currentTempCount >= maxTempLeaves) {
      app.handleTempLeaveExceed(seatNumber);
      setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 2000);
      return;
    }
    if (app.startTempLeave(seatNumber)) {
      this.clearTimers();
      wx.navigateTo({ url: `/pkgFlow/temporary/temporary?seatNumber=${seatNumber}` });
    }
  }
});
