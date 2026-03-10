// pages/index/index.js
const app = getApp();

Page({
  data: {
    hasReservation: false,
    reservationSeat: 0,
    reservationSeatLabel: '',
    reservationHours: 0,
    isTempLeave: false,
    todayReservationCount: 0,
    canReserve: true,
    lockMessage: '',
    renewingSeat: null
  },

  onLoad: function() {
    console.log('首页加载完成');
  },

  onShow: function() {
    // 每次显示页面时检查状态
    this.checkReservationStatus();
    this.checkUserReserveStatus();
  },

  // 检查预约状态
  checkReservationStatus: function() {
    const now = Date.now();
    const reservedSeats = app.globalData.reservedSeats || {};
    let hasReservation = false;
    let reservationSeat = 0;
    let reservationSeatLabel = '';
    let reservationHours = 0;
    let isTempLeave = false;
    
    // 遍历所有预约座位
    for (const seat in reservedSeats) {
      const reservation = reservedSeats[seat];
      // 检查预约是否有效（存在、未过期、属于当前用户）
      if (reservation && 
          reservation.expireTime && 
          reservation.expireTime > now && 
          reservation.userId === app.globalData.currentUserId) {
        hasReservation = true;
        reservationSeat = parseInt(seat);
        reservationSeatLabel = app.formatSeatLabel(reservationSeat);
        reservationHours = reservation.hours || 0;
        isTempLeave = reservation.isTempLeave || false;
        break;
      }
    }
    
    this.setData({
      hasReservation: hasReservation,
      reservationSeat: reservationSeat,
      reservationSeatLabel: reservationSeatLabel,
      reservationHours: reservationHours,
      isTempLeave: isTempLeave,
      todayReservationCount: app.globalData.todayReservationCount || 0
    });
  },

  // 检查用户预约状态
  checkUserReserveStatus: function() {
    const canReserveResult = app.canUserReserve();
    this.setData({
      canReserve: canReserveResult.canReserve,
      lockMessage: canReserveResult.message
    });
  },

  // 跳转到座位预约页面
  navigateToSeatSelect: function() {
    // 检查用户是否可以预约
    const canReserveResult = app.canUserReserve();
    if (!canReserveResult.canReserve) {
      wx.showModal({
        title: "预约限制",
        content: canReserveResult.message,
        showCancel: false
      });
      return;
    }
    
    // 检查用户是否已有预约
    const hasReservation = this.data.hasReservation;
    if (hasReservation) {
      wx.showModal({
        title: "提示",
        content: "您已有一个预约中的座位，请先结束当前预约",
        showCancel: false
      });
      return;
    }
    
    wx.navigateTo({
      url: '/pkgFlow/seatSelect/seatSelect',
      fail: function() {
        wx.showToast({
          title: '功能开发中',
          icon: 'none',
          duration: 2000
        });
      }
    });
  },

  // 跳转到预约记录页面
  navigateToHistory: function() {
    wx.navigateTo({
      url: '/pkgOther/history/history',
      fail: function() {
        wx.showToast({
          title: '功能开发中',
          icon: 'none',
          duration: 2000
        });
      }
    });
  },

  // 跳转到关于本馆页面
  navigateToAbout: function() {
    wx.navigateTo({
      url: '/pages/about/about',
      fail: function() {
        wx.showToast({ title: '功能开发中', icon: 'none', duration: 2000 });
      }
    });
  },

  // 跳转到问题反馈页面
  navigateToFeedback: function() {
    wx.navigateTo({
      url: '/pages/feedback/feedback',
      fail: function() {
        wx.showToast({ title: '功能开发中', icon: 'none', duration: 2000 });
      }
    });
  },

  // 跳转到预约状态页面
  navigateToReservationStatus: function() {
    if (!this.data.hasReservation) {
      wx.showToast({
        title: '当前无预约座位',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    const reservationSeat = this.data.reservationSeat;
    const reservation = app.globalData.reservedSeats[reservationSeat];
    
    if (!reservation) {
      wx.showToast({
        title: '预约信息不存在',
        icon: 'none',
        duration: 2000
      });
      this.checkReservationStatus(); // 重新检查状态
      return;
    }
    
    if (reservation.isTempLeave) {
      // 如果在暂离状态，检查是否超时
      if (app.checkTempLeaveTimeout(reservationSeat)) {
        app.handleTempLeaveTimeout(reservationSeat);
        wx.showToast({
          title: '暂离已超时，预约已结束',
          icon: 'none',
          duration: 2000
        });
        this.checkReservationStatus(); // 重新检查状态
        return;
      }
      
      wx.navigateTo({
        url: `/pkgFlow/temporary/temporary?seatNumber=${reservationSeat}`
      });
    } else {
      // 检查预约是否过期
      const remainingSeconds = app.getRemainingReservationSeconds(reservationSeat);
      if (remainingSeconds <= 0) {
        // 预约已过期，清理
        delete app.globalData.reservedSeats[reservationSeat];
        wx.setStorageSync('reservedSeats', app.globalData.reservedSeats);
        app.updateReservationStatus(reservationSeat, Date.now(), "已过期");
        
        wx.showToast({
          title: '预约已过期',
          icon: 'none',
          duration: 2000
        });
        this.checkReservationStatus(); // 重新检查状态
        return;
      }
      
      wx.navigateTo({
        url: `/pkgFlow/reservation/reservation?seatNumber=${reservationSeat}&hours=${reservation.hours}`
      });
    }
  },

  onShareAppMessage: function() {
    return {
      title: '图书馆自习室座位预约系统',
      path: '/pages/index/index'
    };
  }
});