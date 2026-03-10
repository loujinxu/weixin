const app = getApp();

Page({
  data: {
    seatNumber: 0,
    seatLabel: '',
    selectedTime: 0,
    isRenewProcess: false,
    renewingSeat: null,
    expiredHours: 0
  },

  onLoad: function(options) {
    const seatNumber = parseInt(options.seatNumber) || 0;
    const isRenew = options.isRenew === 'true';
    const expiredHours = parseInt(options.expiredHours) || 0;
    const floor = seatNumber <= 600 ? 1 : (seatNumber <= 1200 ? 2 : 3);
    const startNum = floor === 1 ? 1 : (floor === 2 ? 601 : 1201);
    const indexInFloor = seatNumber > 0 ? (seatNumber - startNum + 1) : 0;
    this.setData({
      seatNumber,
      seatLabel: indexInFloor > 0 ? `${floor}-${indexInFloor}` : '',
      isRenewProcess: isRenew,
      expiredHours
    });
  },

  onShow: function() {
    if (this.data.isRenewProcess && !app.globalData.renewingSeat) {
      wx.showModal({
        title: "提示",
        content: "未找到续约座位信息，请重新开始续约流程",
        showCancel: false,
        success: () => { wx.reLaunch({ url: '/pages/index/index' }); }
      });
    } else if (this.data.isRenewProcess) {
      this.setData({ renewingSeat: app.globalData.renewingSeat });
    }
  },

  goBack: function() {
    if (this.data.isRenewProcess) app.clearRenewingSeat();
    wx.navigateBack();
  },

  selectTime: function(e) {
    this.setData({ selectedTime: parseInt(e.currentTarget.dataset.time) });
  },

  getTempLeaveCount: function(timeSlot) {
    if (timeSlot <= 2) return 1;
    if (timeSlot <= 4) return 2;
    return 4;
  },

  cancelSelection: function() {
    if (this.data.isRenewProcess) app.clearRenewingSeat();
    wx.navigateBack();
  },

  confirmSelection: function() {
    if (!this.data.selectedTime) {
      wx.showToast({ title: '请选择时间段', icon: 'none', duration: 2000 });
      return;
    }
    const { seatNumber, selectedTime, isRenewProcess } = this.data;
    if (isRenewProcess) {
      this.handleRenew(seatNumber, selectedTime);
    } else {
      this.handleNewReservation(seatNumber, selectedTime);
    }
  },

  handleNewReservation: function(seatNumber, hours) {
    const canReserveResult = app.canUserReserve(false);
    if (!canReserveResult.canReserve) {
      wx.showModal({ title: "预约限制", content: canReserveResult.message, showCancel: false });
      return;
    }
    if (app.getSeatStatus(seatNumber) === 'reserved') {
      wx.showToast({ title: '该座位已被占用', icon: 'none', duration: 2000 });
      return;
    }

    wx.showLoading({ title: '正在抢座...' });
    app.cloudReserveSeat(seatNumber, hours, (ok, msg, extra) => {
      wx.hideLoading();
      if (!ok) {
        const debugText = extra && extra.debug ? JSON.stringify(extra.debug, null, 2) : '';
        const content = (msg || '抢座失败') + (debugText ? `\n\n[debug]\n${debugText}` : '');
        wx.showModal({
          title: '抢座失败',
          content,
          showCancel: !!debugText,
          confirmText: debugText ? '复制' : '确定',
          cancelText: '关闭',
          success: (res) => {
            if (res.confirm && debugText) {
              wx.setClipboardData({ data: content });
            }
          }
        });
        return;
      }
      app.recordLocalReservationAfterCloud(seatNumber, hours, false);
      app.saveReservationHistory(seatNumber, hours, Date.now(), "进行中", false);
      wx.redirectTo({ url: `/pkgFlow/reservation/reservation?seatNumber=${seatNumber}&hours=${hours}` });
    });
  },

  handleRenew: function(seatNumber, hours) {
    const success = app.renewSeat(seatNumber, hours, this.data.expiredHours);
    if (success) {
      wx.showToast({ title: '续约成功', icon: 'success', duration: 1500 });
      app.clearRenewingSeat();
      const newTotalHours = this.data.expiredHours + hours;
      setTimeout(() => {
        wx.redirectTo({ url: `/pkgFlow/reservation/reservation?seatNumber=${seatNumber}&hours=${newTotalHours}` });
      }, 1500);
    } else {
      wx.showToast({ title: '续约失败', icon: 'none', duration: 2000 });
      app.clearRenewingSeat();
    }
  }
});
