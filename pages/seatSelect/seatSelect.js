// pages/seatSelect/seatSelect.js
const app = getApp();

Page({
  data: {
    currentFloor: 1,
    currentFloorSeats: [],
    floor1Seats: [],
    floor2Seats: [],
    floor3Seats: []
  },

  onLoad: function() {
    this.initAllFloorSeats();
    this.switchFloor({ currentTarget: { dataset: { floor: 1 } } });
  },

  onShow: function() {
    // 页面显示时刷新云端占用状态（多用户真抢座），再刷新UI
    app.refreshCloudSeatLocksByFloor(this.data.currentFloor, () => {
      this.updateSeatStatus();
    });
  },

  initAllFloorSeats: function() {
    const floor1Seats = this.generateFloorSeats(1, 1, 600);
    const floor2Seats = this.generateFloorSeats(2, 601, 1200);
    const floor3Seats = this.generateFloorSeats(3, 1201, 1800);
    
    this.setData({
      floor1Seats: floor1Seats,
      floor2Seats: floor2Seats,
      floor3Seats: floor3Seats
    });
  },

  generateFloorSeats: function(floor, startNum, endNum) {
    const seats = [];
    for (let i = startNum; i <= endNum; i++) {
      const indexInFloor = i - startNum + 1; // 每层内编号从 1 开始
      seats.push({
        id: `floor${floor}_seat${i}`,
        floor: floor,
        seatNumber: i,                    // 内部仍然用全局数字编号
        displayLabel: `${floor}-${indexInFloor}` // 显示为 1-1、1-2 ... 2-1 等
      });
    }
    return seats;
  },

  switchFloor: function(e) {
    const floor = parseInt(e.currentTarget.dataset.floor);
    this.setData({ currentFloor: floor });
    
    let targetSeats = [];
    switch (floor) {
      case 1:
        targetSeats = this.data.floor1Seats;
        break;
      case 2:
        targetSeats = this.data.floor2Seats;
        break;
      case 3:
        targetSeats = this.data.floor3Seats;
        break;
      default:
        targetSeats = this.data.floor1Seats;
    }
    
    const withStyle = this.applySeatStyles(targetSeats);
    this.setData({ currentFloorSeats: withStyle });
    // 切楼层时刷新云端占用座位
    app.refreshCloudSeatLocksByFloor(floor, () => {
      this.updateSeatStatus();
    });
  },

  getSeatStatus: function(seatNumber) {
    return app.getSeatStatus(seatNumber);
  },

  getSeatStyle: function(status) {
    if (status === 'reserved') {
      return 'background-color:#e74c3c;border:2rpx solid #e74c3c;color:#fff;opacity:0.95';
    }
    return 'background-color:#27ae60;border:2rpx solid #27ae60;color:#fff';
  },

  applySeatStyles: function(seats) {
    if (!Array.isArray(seats)) return seats;
    return seats.map(function(item) {
      var sn = Number(item.seatNumber);
      var status = app.getSeatStatus(sn);
      return Object.assign({}, item, { seatNumber: sn, status: status, seatStyle: this.getSeatStyle(status) });
    }.bind(this));
  },

  selectSeat: function(e) {
    const seatNumber = e.currentTarget.dataset.seatnumber;
    console.log('选择座位:', seatNumber);
    
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
    
    // 检查座位是否可用
    const status = this.getSeatStatus(seatNumber);
    if (status === 'reserved') {
      wx.showToast({
        title: '该座位已被占用',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    // 跳转到时间选择页面
    wx.navigateTo({
      url: `/pages/timeSelect/timeSelect?seatNumber=${seatNumber}`
    });
  },

  updateSeatStatus: function() {
    const floor = this.data.currentFloor;
    let list = floor === 1 ? this.data.floor1Seats : (floor === 2 ? this.data.floor2Seats : this.data.floor3Seats);
    const withStyle = this.applySeatStyles(list);
    this.setData({ currentFloorSeats: withStyle });
  }
});