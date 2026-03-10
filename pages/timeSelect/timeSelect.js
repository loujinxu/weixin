const app = getApp();

Page({
  data: {
    seatNumber: 0,
    seatLabel: '',
    selectedTime: 0,
    isRenewProcess: false,
    renewingSeat: null,
    expiredHours: 0 // 记录过期前时长
  },

  onLoad: function(options) {
    const seatNumber = parseInt(options.seatNumber) || 0;
    const isRenew = options.isRenew === 'true';
    const expiredHours = parseInt(options.expiredHours) || 0;

    const floor = seatNumber <= 600 ? 1 : (seatNumber <= 1200 ? 2 : 3);
    const startNum = floor === 1 ? 1 : (floor === 2 ? 601 : 1201);
    const indexInFloor = seatNumber > 0 ? (seatNumber - startNum + 1) : 0;

    this.setData({
      seatNumber: seatNumber,
      seatLabel: indexInFloor > 0 ? `${floor}-${indexInFloor}` : '',
      isRenewProcess: isRenew,
      expiredHours: expiredHours
    });

    console.log('时间选择页面, 座位:', seatNumber, '是否续约:', isRenew, '过期前时长:', expiredHours);
  },

  onShow: function() {
    // 如果是续约流程，检查续约状态
    if (this.data.isRenewProcess) {
      const renewingSeat = app.globalData.renewingSeat;
      if (!renewingSeat) {
        wx.showModal({
          title: "提示",
          content: "未找到续约座位信息，请重新开始续约流程",
          showCancel: false,
          success: () => {
            wx.switchTab({
              url: '/pages/index/index'
            });
          }
        });
        return;
      }

      this.setData({ renewingSeat: renewingSeat });
    }
  },

  goBack: function() {
    // 如果是续约流程，清除续约状态
    if (this.data.isRenewProcess) {
      app.clearRenewingSeat();
    }
    wx.navigateBack();
  },

  selectTime: function(e) {
    const time = parseInt(e.currentTarget.dataset.time);
    this.setData({ selectedTime: time });
  },

  getTempLeaveCount: function(timeSlot) {
    if (timeSlot <= 2) return 1;
    if (timeSlot <= 4) return 2;
    return 4;
  },

  cancelSelection: function() {
    // 如果是续约流程，清除续约状态
    if (this.data.isRenewProcess) {
      app.clearRenewingSeat();
    }
    wx.navigateBack();
  },

  confirmSelection: function() {
    if (!this.data.selectedTime) {
      wx.showToast({
        title: '请选择时间段',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    const seatNumber = this.data.seatNumber;
    const selectedTime = this.data.selectedTime;
    const isRenew = this.data.isRenewProcess;

    console.log('确认选择, 座位:', seatNumber, '时长:', selectedTime, '是否续约:', isRenew);

    if (isRenew) {
      // 续约流程（不计入预约次数）
      this.handleRenew(seatNumber, selectedTime);
    } else {
      // 新预约流程（计入预约次数）
      this.handleNewReservation(seatNumber, selectedTime);
    }
  },

  // 处理新预约
  handleNewReservation: function(seatNumber, hours) {
    // 检查用户是否可以预约
    const canReserveResult = app.canUserReserve(false);
    if (!canReserveResult.canReserve) {
      wx.showModal({
        title: "预约限制",
        content: canReserveResult.message,
        showCancel: false
      });
      return;
    }

    // 云端占用判断（多用户真抢座）
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
      // 云端抢座成功后，沿用本地计数/历史逻辑
      app.recordLocalReservationAfterCloud(seatNumber, hours, false);
      app.saveReservationHistory(seatNumber, hours, Date.now(), "进行中", false);
      wx.redirectTo({ url: `/pages/reservation/reservation?seatNumber=${seatNumber}&hours=${hours}` });
    });
  },

  // 处理续约（核心：不计入每日预约次数）
  handleRenew: function(seatNumber, hours) {
    console.log('处理续约, 座位:', seatNumber, '时长:', hours);

    // 直接调用app的续约方法（已处理过期状态，不计入次数）
    const success = app.renewSeat(seatNumber, hours, this.data.expiredHours);

    if (success) {
      wx.showToast({
        title: '续约成功',
        icon: 'success',
        duration: 1500
      });

      // 清除续约状态
      app.clearRenewingSeat();

      // 跳转到预约计时页面（传递新总时长）
      const newTotalHours = this.data.expiredHours + hours;
      setTimeout(() => {
        wx.redirectTo({
          url: `/pages/reservation/reservation?seatNumber=${seatNumber}&hours=${newTotalHours}`
        });
      }, 1500);
    } else {
      wx.showToast({
        title: '续约失败',
        icon: 'none',
        duration: 2000
      });

      // 清除续约状态
      app.clearRenewingSeat();
    }
  }
});