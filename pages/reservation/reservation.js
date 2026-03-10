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
    const hours = parseInt(options.hours) || 1;
    const isRenewProcess = options.isRenewProcess === 'true';

    this.setData({
      seatNumber: seatNumber,
      seatLabel: app.formatSeatLabel(seatNumber),
      hours: hours,
      isRenewProcess: isRenewProcess
    });

    console.log('预约计时页面加载, 座位:', seatNumber, '时长:', hours, '是否续约流程:', isRenewProcess);
  },

  onShow: function() {
    // 页面显示时从全局数据获取剩余时间
    this.loadReservationInfo();
    this.startCountdown();
  },

  onUnload: function() {
    this.clearTimers();
  },

  onHide: function() {
    this.clearTimers();
  },

  // 加载预约信息
  loadReservationInfo: function() {
    const seatNumber = this.data.seatNumber;

    // 从全局数据获取预约信息
    const reservation = app.globalData.reservedSeats[seatNumber];
    if (!reservation) {
      console.log('预约信息不存在, 返回首页');
      wx.switchTab({
        url: '/pages/index/index'
      });
      return;
    }

    // 检查是否在暂离状态
    if (reservation.isTempLeave) {
      console.log('在暂离状态, 跳转到暂离页面');
      wx.redirectTo({
        url: `/pages/temporary/temporary?seatNumber=${seatNumber}`
      });
      return;
    }

    // 获取剩余秒数
    const remainingSeconds = app.getRemainingReservationSeconds(seatNumber);

    // 获取暂离次数
    const tempLeaveCount = reservation.tempLeaveCount || 0;

    // 计算最大暂离次数
    const maxTempLeaves = this.getMaxTempLeaves(reservation.hours);

    this.setData({
      remainingSeconds: remainingSeconds,
      tempLeaveCount: tempLeaveCount,
      maxTempLeaves: maxTempLeaves
    });

    console.log('预约信息加载完成, 暂离次数:', tempLeaveCount, '/', maxTempLeaves);
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
        console.log('预约已不存在, 停止计时');
        this.clearTimers();
        wx.switchTab({
          url: '/pages/index/index'
        });
        return;
      }

      const remainingSeconds = app.getRemainingReservationSeconds(seatNumber);

      if (remainingSeconds <= 0) {
        this.setData({
          countdownText: '00:00:00',
          remainingSeconds: 0
        });
        this.handleTimeEnd();
        return;
      }

      const hours = Math.floor(remainingSeconds / 3600);
      const minutes = Math.floor((remainingSeconds % 3600) / 60);
      const seconds = remainingSeconds % 60;

      this.setData({
        countdownText: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
        remainingSeconds: remainingSeconds
      });
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    this.setData({ countdownTimer: timer });
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
    const now = Date.now();

    // 保留座位关联（不删除，仅标记过期）
    const reservation = app.globalData.reservedSeats[seatNumber];
    if (reservation) {
      reservation.status = 'expired';
      app.globalData.reservedSeats[seatNumber] = reservation;
      wx.setStorageSync('reservedSeats', app.globalData.reservedSeats);
    }

    // 不清理座位数据，仅更新状态为过期
    app.updateReservationStatus(seatNumber, now, "已过期");

    this.setData({ showTimeEndModal: true });
  },

  // 续约座位（核心：不计入每日预约次数）
  renewReservation: function() {
    this.setData({ showTimeEndModal: false });

    const seatNumber = this.data.seatNumber;

    // 检查座位是否存在（即使过期）
    const reservation = app.globalData.reservedSeats[seatNumber];
    if (!reservation) {
      wx.showModal({
        title: "无法续约",
        content: "预约信息已失效，请重新预约",
        showCancel: false
      });
      return;
    }

    // 检查是否为当前用户预约
    if (reservation.userId !== app.globalData.currentUserId) {
      wx.showModal({
        title: "无法续约",
        content: "该座位不是您的预约",
        showCancel: false
      });
      return;
    }

    // 设置续约状态（传递当前过期时长）
    app.setRenewingSeat(seatNumber, reservation.hours);

    // 跳转到时间选择页面进行续约（标记isRenew=true）
    wx.navigateTo({
      url: `/pages/timeSelect/timeSelect?seatNumber=${seatNumber}&isRenew=true&expiredHours=${reservation.hours}`
    });
  },

  // 取消按钮逻辑（弹窗消失，预约结束）
  handleCancel: function() {
    this.setData({ showTimeEndModal: false });

    // 清理过期预约数据
    const seatNumber = this.data.seatNumber;
    delete app.globalData.reservedSeats[seatNumber];
    wx.setStorageSync('reservedSeats', app.globalData.reservedSeats);
  },

  endReservation: function() {
    wx.showModal({
      title: '确认退坐',
      content: '确定要结束当前预约吗？',
      success: (res) => {
        if (res.confirm) {
          // 1. 立即清除计时器
          this.clearTimers();

          // 2. 立即将倒计时清零
          this.setData({
            countdownText: '00:00:00',
            remainingSeconds: 0
          });

          // 3. 检查24小时内退坐次数
          const endReservationsCount = app.check24HourEndReservations();

          // 4. 立即结束预约
          app.endReservationImmediately(this.data.seatNumber, "已退坐", false);

          // 5. 记录退坐违规
          app.recordViolation('end_reservation');

          // 6. 检查是否达到3次退坐限制
          if (endReservationsCount >= 10) {
            wx.showToast({
              title: '退坐成功，24小时内退坐已超10次',
              icon: 'none',
              duration: 2000
            });
          } else {
            wx.showToast({
              title: '退坐成功，座位已释放',
              icon: 'success',
              duration: 1500
            });
          }

          // 7. 延迟1.5秒后返回首页
          setTimeout(() => {
            wx.switchTab({
              url: '/pages/index/index'
            });
          }, 1500);
        }
      }
    });
  },

  startTempLeave: function() {
    const seatNumber = this.data.seatNumber;
    const reservation = app.globalData.reservedSeats[seatNumber];

    if (!reservation) {
      wx.showToast({
        title: '预约信息不存在',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    const maxTempLeaves = this.getMaxTempLeaves(reservation.hours);
    const currentTempCount = reservation.tempLeaveCount || 0;

    console.log('尝试开始暂离, 当前次数:', currentTempCount, '/', maxTempLeaves);

    if (currentTempCount >= maxTempLeaves) {
      console.log('暂离次数已达上限');
      // 暂离次数超限，直接结束预约
      app.handleTempLeaveExceed(seatNumber);

      // 返回首页
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/index/index'
        });
      }, 2000);
      return;
    }

    // 开始暂离
    const success = app.startTempLeave(seatNumber);
    if (success) {
      // 暂停当前计时
      this.clearTimers();

      // 跳转到暂离计时页面
      wx.navigateTo({
        url: `/pages/temporary/temporary?seatNumber=${seatNumber}`
      });
    }
  }
});