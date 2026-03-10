const app = getApp();

Page({
  data: {
    seatNumber: 0,
    seatLabel: '',
    countdownText: '30:00',
    countdownTimer: null,
    tempRemainingSeconds: 0
  },

  onLoad: function(options) {
    const seatNumber = parseInt(options.seatNumber) || 0;
    this.setData({ seatNumber, seatLabel: app.formatSeatLabel(seatNumber) });
  },

  onShow: function() {
    this.checkReservationStatus();
  },

  onUnload: function() { this.clearTimers(); },
  onHide: function() { this.clearTimers(); },

  checkReservationStatus: function() {
    const seatNumber = this.data.seatNumber;
    const reservation = app.globalData.reservedSeats[seatNumber];
    if (!reservation) {
      wx.reLaunch({ url: '/pages/index/index' });
      return;
    }
    if (!reservation.isTempLeave) {
      wx.redirectTo({ url: `/pkgFlow/reservation/reservation?seatNumber=${seatNumber}&hours=${reservation.hours}` });
      return;
    }
    if (app.checkTempLeaveTimeout(seatNumber)) {
      this.handleTimeout();
      return;
    }
    this.startTempCountdown();
  },

  startTempCountdown: function() {
    this.clearTimers();
    const updateCountdown = () => {
      const seatNumber = this.data.seatNumber;
      const reservation = app.globalData.reservedSeats[seatNumber];
      if (!reservation) {
        this.clearTimers();
        wx.reLaunch({ url: '/pages/index/index' });
        return;
      }
      if (!reservation.isTempLeave) {
        this.clearTimers();
        wx.redirectTo({ url: `/pkgFlow/reservation/reservation?seatNumber=${seatNumber}&hours=${reservation.hours}` });
        return;
      }
      const tempRemainingSeconds = app.getTempLeaveRemainingTime(seatNumber);
      if (tempRemainingSeconds <= 0) {
        this.setData({ countdownText: '00:00', tempRemainingSeconds: 0 });
        this.handleTimeout();
        return;
      }
      const minutes = Math.floor(tempRemainingSeconds / 60);
      const seconds = tempRemainingSeconds % 60;
      this.setData({
        countdownText: `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`,
        tempRemainingSeconds
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

  handleTimeout: function() {
    if (app.handleTempLeaveTimeout(this.data.seatNumber)) {
      setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 2000);
    }
  },

  cancelTempLeave: function() {
    const seatNumber = this.data.seatNumber;
    const self = this;
    app.checkIsLibraryWifi(function(isConnected, errMsg) {
      if (!isConnected) {
        wx.showToast({ title: errMsg || '请连接图书馆 WiFi 后再取消暂离', icon: 'none', duration: 2500 });
        return;
      }
      self.clearTimers();
      const success = app.endTempLeave(seatNumber);
      if (success) {
        wx.redirectTo({ url: `/pkgFlow/reservation/reservation?seatNumber=${seatNumber}` });
      } else {
        wx.reLaunch({ url: '/pages/index/index' });
      }
    });
  }
});
