// utils/reservationManager.js
class ReservationManager {
  constructor() {
    this.initStorage();
  }

  // 初始化存储
  initStorage() {
    const defaults = {
      'reservations': {},        // 当前所有预约
      'users': {},              // 用户信息
      'history': [],           // 预约历史
      'tempRecords': [],       // 暂离记录
      'violations': {},        // 违规记录
      'currentUser': null      // 当前用户
    };

    Object.keys(defaults).forEach(key => {
      if (!wx.getStorageSync(key)) {
        wx.setStorageSync(key, defaults[key]);
      }
    });

    // 如果没有当前用户，生成一个
    if (!wx.getStorageSync('currentUser')) {
      this.generateUserId();
    }
  }

  // 生成用户ID
  generateUserId() {
    const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    wx.setStorageSync('currentUser', userId);
    
    const users = wx.getStorageSync('users') || {};
    if (!users[userId]) {
      users[userId] = {
        id: userId,
        created: Date.now(),
        reservations: [],
        tempLeaves: 0,
        violationCount: 0
      };
      wx.setStorageSync('users', users);
    }
    
    return userId;
  }

  // 检查用户预约限制
  checkUserLimit(userId) {
    const now = Date.now();
    const users = wx.getStorageSync('users') || {};
    const user = users[userId] || {};
    
    // 检查24小时内预约次数
    const last24Hours = now - 24 * 60 * 60 * 1000;
    const recentReservations = (user.reservations || [])
      .filter(res => res.startTime > last24Hours && res.status !== 'cancelled');
    
    if (recentReservations.length >= 3) {
      return { canReserve: false, reason: '24小时内预约次数已达上限（3次）' };
    }
    
    // 检查是否有违规记录
    const violations = wx.getStorageSync('violations') || {};
    if (violations[userId] && violations[userId].endTime > now) {
      return { canReserve: false, reason: '因违规行为，24小时内无法预约' };
    }
    
    return { canReserve: true };
  }

  // 创建预约
  createReservation(seatId, timeSlot) {
    const userId = wx.getStorageSync('currentUser');
    
    // 检查限制
    const limitCheck = this.checkUserLimit(userId);
    if (!limitCheck.canReserve) {
      return { success: false, message: limitCheck.reason };
    }
    
    // 检查座位是否可用
    const reservations = wx.getStorageSync('reservations') || {};
    if (reservations[seatId]) {
      return { success: false, message: '该座位已被预约' };
    }
    
    // 检查用户是否已有预约
    for (const seat in reservations) {
      if (reservations[seat].userId === userId && reservations[seat].status === 'active') {
        return { success: false, message: '您已有一个预约中的座位' };
      }
    }
    
    // 创建预约记录
    const now = Date.now();
    const duration = parseInt(timeSlot) * 60 * 60 * 1000; // 小时转毫秒
    const endTime = now + duration;
    
    const reservation = {
      id: 'res_' + Date.now(),
      seatId: seatId,
      userId: userId,
      startTime: now,
      endTime: endTime,
      timeSlot: timeSlot,
      status: 'active',
      tempLeaves: 0,
      maxTempLeaves: this.getMaxTempLeaves(timeSlot)
    };
    
    // 保存预约
    reservations[seatId] = reservation;
    wx.setStorageSync('reservations', reservations);
    
    // 更新用户记录
    const users = wx.getStorageSync('users') || {};
    if (!users[userId].reservations) users[userId].reservations = [];
    users[userId].reservations.push({
      id: reservation.id,
      seatId: seatId,
      startTime: now,
      timeSlot: timeSlot
    });
    wx.setStorageSync('users', users);
    
    // 添加历史记录
    const history = wx.getStorageSync('history') || [];
    history.push({
      id: reservation.id,
      seatId: seatId,
      userId: userId,
      startTime: now,
      endTime: endTime,
      timeSlot: timeSlot,
      action: 'reserve'
    });
    wx.setStorageSync('history', history);
    
    return { success: true, data: reservation };
  }

  // 根据时间段获取最大暂离次数
  getMaxTempLeaves(timeSlot) {
    const hours = parseInt(timeSlot);
    if (hours <= 2) return 1;
    if (hours <= 4) return 2;
    return 4;
  }

  // 结束预约
  endReservation(seatId, reason = 'completed') {
    const reservations = wx.getStorageSync('reservations') || {};
    const reservation = reservations[seatId];
    
    if (!reservation) {
      return { success: false, message: '预约不存在' };
    }
    
    // 更新状态
    reservation.status = reason;
    reservation.endTime = Date.now();
    wx.setStorageSync('reservations', reservations);
    
    // 添加历史记录
    const history = wx.getStorageSync('history') || [];
    history.push({
      id: reservation.id,
      seatId: seatId,
      userId: reservation.userId,
      endTime: Date.now(),
      action: 'end',
      reason: reason
    });
    wx.setStorageSync('history', history);
    
    return { success: true };
  }

  // 开始暂离
  startTempLeave(seatId) {
    const reservations = wx.getStorageSync('reservations') || {};
    const reservation = reservations[seatId];
    
    if (!reservation) {
      return { success: false, message: '预约不存在' };
    }
    
    if (reservation.tempLeaves >= reservation.maxTempLeaves) {
      return { success: false, message: '暂离次数已达上限' };
    }
    
    reservation.tempLeaves++;
    reservation.tempLeaveStart = Date.now();
    reservation.isTempLeave = true;
    wx.setStorageSync('reservations', reservations);
    
    // 更新用户暂离次数
    const users = wx.getStorageSync('users') || {};
    if (users[reservation.userId]) {
      users[reservation.userId].tempLeaves = (users[reservation.userId].tempLeaves || 0) + 1;
      wx.setStorageSync('users', users);
    }
    
    return { success: true, data: reservation };
  }

  // 结束暂离
  endTempLeave(seatId) {
    const reservations = wx.getStorageSync('reservations') || {};
    const reservation = reservations[seatId];
    
    if (!reservation || !reservation.isTempLeave) {
      return { success: false, message: '没有在暂离中' };
    }
    
    const tempLeaveDuration = Date.now() - reservation.tempLeaveStart;
    reservation.endTime += tempLeaveDuration; // 延长预约结束时间
    reservation.isTempLeave = false;
    delete reservation.tempLeaveStart;
    wx.setStorageSync('reservations', reservations);
    
    return { success: true, data: reservation };
  }

  // 获取当前用户的所有预约
  getUserReservations(userId) {
    const reservations = wx.getStorageSync('reservations') || {};
    const userReservations = [];
    
    for (const seatId in reservations) {
      if (reservations[seatId].userId === userId) {
        userReservations.push({ seatId, ...reservations[seatId] });
      }
    }
    
    return userReservations;
  }

  // 清理过期预约
  cleanupExpiredReservations() {
    const now = Date.now();
    const reservations = wx.getStorageSync('reservations') || {};
    let changed = false;
    
    for (const seatId in reservations) {
      const reservation = reservations[seatId];
      if (reservation.endTime <= now && reservation.status === 'active') {
        reservation.status = 'expired';
        changed = true;
        
        // 添加历史记录
        const history = wx.getStorageSync('history') || [];
        history.push({
          id: reservation.id,
          seatId: seatId,
          userId: reservation.userId,
          endTime: now,
          action: 'expire'
        });
        wx.setStorageSync('history', history);
      }
    }
    
    if (changed) {
      wx.setStorageSync('reservations', reservations);
    }
  }
}

const reservationManager = new ReservationManager();
module.exports = reservationManager;