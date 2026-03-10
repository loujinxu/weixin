// pages/temporary/temporary.js
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
    
    this.setData({
      seatNumber: seatNumber,
      seatLabel: app.formatSeatLabel(seatNumber)
    });
    
    console.log('暂离页面加载, 座位:', seatNumber);
  },

  onShow: function() {
    // 页面显示时检查预约状态
    this.checkReservationStatus();
  },

  onUnload: function() {
    this.clearTimers();
  },

  onHide: function() {
    this.clearTimers();
  },

  // 检查预约状态
  checkReservationStatus: function() {
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
    if (!reservation.isTempLeave) {
      console.log('不在暂离状态, 跳转到预约页面');
      wx.redirectTo({
        url: `/pages/reservation/reservation?seatNumber=${seatNumber}&hours=${reservation.hours}`
      });
      return;
    }
    
    // 检查暂离是否已超时
    if (app.checkTempLeaveTimeout(seatNumber)) {
      console.log('暂离已超时');
      this.handleTimeout();
      return;
    }
    
    // 启动暂离倒计时
    this.startTempCountdown();
  },

  startTempCountdown: function() {
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
      
      // 检查是否还在暂离状态
      if (!reservation.isTempLeave) {
        console.log('暂离已结束, 返回预约页面');
        this.clearTimers();
        wx.redirectTo({
          url: `/pages/reservation/reservation?seatNumber=${seatNumber}&hours=${reservation.hours}`
        });
        return;
      }
      
      const tempRemainingSeconds = app.getTempLeaveRemainingTime(seatNumber);
      
      if (tempRemainingSeconds <= 0) {
        this.setData({
          countdownText: '00:00',
          tempRemainingSeconds: 0
        });
        this.handleTimeout();
        return;
      }
      
      const minutes = Math.floor(tempRemainingSeconds / 60);
      const seconds = tempRemainingSeconds % 60;
      
      this.setData({
        countdownText: `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
        tempRemainingSeconds: tempRemainingSeconds
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

  handleTimeout: function() {
    this.clearTimers();
    
    const seatNumber = this.data.seatNumber;
    
    // 处理暂离超时
    if (app.handleTempLeaveTimeout(seatNumber)) {
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/index/index'
        });
      }, 2000);
    }
  },

  cancelTempLeave: function() {
    this.clearTimers();
    
    const seatNumber = this.data.seatNumber;
    
    // 结束暂离
    const success = app.endTempLeave(seatNumber);
    
    if (success) {
      // 返回预约计时页面
      wx.redirectTo({
        url: `/pages/reservation/reservation?seatNumber=${seatNumber}`
      });
    } else {
      // 如果结束暂离失败，直接返回首页
      wx.switchTab({
        url: '/pages/index/index'
      });
    }
  }
});