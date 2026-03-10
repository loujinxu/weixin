/**
 * 数据存储层 - 座位、预约、黑名单、历史记录、24h预约次数、违规封禁
 */
const KEYS = {
  SEATS: 'seats',
  RESERVATIONS: 'reservations',
  BLACKLIST: 'blacklist',
  USER_ID: 'userId',
  USER_RESERVATION_STARTS: 'user_reservation_starts', // { userId: [startAt,...] } 用于24h内预约次数
  VIOLATION_UNTIL: 'violation_until' // { userId: timestamp }
};

function getSeats() {
  return wx.getStorageSync(KEYS.SEATS) || [];
}

function setSeats(seats) {
  wx.setStorageSync(KEYS.SEATS, seats);
}

function getReservations() {
  return wx.getStorageSync(KEYS.RESERVATIONS) || [];
}

function setReservations(list) {
  wx.setStorageSync(KEYS.RESERVATIONS, list);
}

function getBlacklist() {
  return wx.getStorageSync(KEYS.BLACKLIST) || [];
}

function setBlacklist(list) {
  wx.setStorageSync(KEYS.BLACKLIST, list);
}

function getUserId() {
  return wx.getStorageSync(KEYS.USER_ID) || '';
}

function getUserReservationStarts() {
  return wx.getStorageSync(KEYS.USER_RESERVATION_STARTS) || {};
}

function setUserReservationStarts(obj) {
  wx.setStorageSync(KEYS.USER_RESERVATION_STARTS, obj);
}

function getViolationUntilMap() {
  return wx.getStorageSync(KEYS.VIOLATION_UNTIL) || {};
}

function setViolationUntil(userId, timestamp) {
  const m = getViolationUntilMap();
  m[userId] = timestamp;
  wx.setStorageSync(KEYS.VIOLATION_UNTIL, m);
}

// 预约时长对应的最大暂离次数：≤2h→1，>2h且≤4h→2，>4h→4
function getMaxLeaveCount(durationMinutes) {
  if (durationMinutes <= 120) return 1;
  if (durationMinutes <= 240) return 2;
  return 4;
}

// 24小时内（从第一次预约开始计）预约次数
function getReservationCountIn24h(userId) {
  const obj = getUserReservationStarts();
  const starts = obj[userId] || [];
  const now = Date.now();
  const windowMs = 24 * 60 * 60 * 1000;
  const valid = starts.filter(t => t >= now - windowMs && t <= now);
  return valid.length;
}

// 违规封禁截止时间戳，0 表示未封禁
function getViolationUntil(userId) {
  const m = getViolationUntilMap();
  const until = m[userId] || 0;
  if (until > 0 && until <= Date.now()) return 0;
  return until;
}

// 是否可预约（未封禁、24h内次数<3、无进行中预约）；若已达3次则视为违规并封禁
function canReserve(userId) {
  if (getViolationUntil(userId) > 0) return { ok: false, msg: '您因违规已被限制预约，24小时后方可再次预约' };
  if (getReservationCountIn24h(userId) >= 3) {
    setViolationUntil(userId, Date.now() + 24 * 60 * 60 * 1000);
    return { ok: false, msg: '24小时内预约次数已达3次，违规将限制预约24小时' };
  }
  if (getMyActiveReservation(userId)) return { ok: false, msg: '您已有进行中的预约' };
  return { ok: true };
}

// 预约座位（isFromReserveAgain=true 时不计入24h预约次数）
function reserveSeat(seatId, userId, durationMinutes = 240, isFromReserveAgain = false) {
  const seats = getSeats();
  const reservations = getReservations();
  const check = canReserve(userId);
  if (!check.ok) return check;
  const seat = seats.find(s => s.id === seatId);
  if (!seat || seat.status !== 'available') {
    return { ok: false, msg: '座位不可预约' };
  }
  const now = Date.now();
  const endAt = now + durationMinutes * 60 * 1000;
  const maxLeave = getMaxLeaveCount(durationMinutes);
  seat.status = 'in_use';
  seat.reservedBy = userId;
  seat.reservedAt = now;
  seat.leaveUntil = null;
  setSeats(seats);
  const record = {
    id: 'r_' + now,
    seatId,
    userId,
    startAt: now,
    endAt,
    durationMinutes,
    leaveCount: 0,
    maxLeaveCount: maxLeave,
    status: 'active',
    leaveUntil: null
  };
  reservations.push(record);
  setReservations(reservations);
  if (!isFromReserveAgain) {
    const obj = getUserReservationStarts();
    if (!obj[userId]) obj[userId] = [];
    obj[userId].push(now);
    setUserReservationStarts(obj);
  }
  return { ok: true, record };
}

// 申请暂离（暂离次数超过规定则违规封禁24h）
function applyLeave(userId, leaveMinutes = 30) {
  const reservations = getReservations();
  const seats = getSeats();
  const active = reservations.find(r => r.userId === userId && r.status === 'active');
  if (!active) {
    return { ok: false, msg: '没有进行中的预约' };
  }
  const leaveCount = active.leaveCount || 0;
  const maxLeave = active.maxLeaveCount != null ? active.maxLeaveCount : getMaxLeaveCount((active.endAt - active.startAt) / 60000);
  if (leaveCount >= maxLeave) {
    setViolationUntil(userId, Date.now() + 24 * 60 * 60 * 1000);
    return { ok: false, msg: '暂离次数已达上限，违规将限制预约24小时' };
  }
  const now = Date.now();
  active.leaveCount = leaveCount + 1;
  active.status = 'leave';
  active.leaveUntil = now + leaveMinutes * 60 * 1000;
  active.pausedRemainingSeconds = Math.max(0, Math.floor((active.endAt - now) / 1000));
  setReservations(reservations);
  const seat = seats.find(s => s.id === active.seatId);
  if (seat) {
    seat.status = 'leave';
    seat.leaveUntil = active.leaveUntil;
  }
  setSeats(seats);
  return { ok: true, leaveUntil: active.leaveUntil };
}

// 结束暂离（返回座位），恢复预约倒计时
function backFromLeave(userId) {
  const reservations = getReservations();
  const seats = getSeats();
  const active = reservations.find(r => r.userId === userId && r.status === 'leave');
  if (!active) {
    return { ok: false, msg: '没有暂离中的预约' };
  }
  active.status = 'active';
  active.leaveUntil = null;
  const remain = active.pausedRemainingSeconds || 0;
  if (remain > 0) {
    active.endAt = Date.now() + remain * 1000;
  }
  delete active.pausedRemainingSeconds;
  setReservations(reservations);
  const seat = seats.find(s => s.id === active.seatId);
  if (seat) {
    seat.status = 'in_use';
    seat.leaveUntil = null;
  }
  setSeats(seats);
  return { ok: true };
}

// 续约
function renewSeat(userId, extraMinutes = 120) {
  const reservations = getReservations();
  const active = reservations.find(r => r.userId === userId && (r.status === 'active' || r.status === 'leave'));
  if (!active) {
    return { ok: false, msg: '没有可续约的预约' };
  }
  const newEnd = Math.max(active.endAt, Date.now()) + extraMinutes * 60 * 1000;
  active.endAt = newEnd;
  if (active.status === 'leave') {
    active.leaveUntil = null;
    active.status = 'active';
    const seats = getSeats();
    const seat = seats.find(s => s.id === active.seatId);
    if (seat) {
      seat.status = 'in_use';
      seat.leaveUntil = null;
    }
    setSeats(seats);
  }
  setReservations(reservations);
  return { ok: true, endAt: newEnd };
}

// 取消预约
function cancelReservation(userId) {
  const reservations = getReservations();
  const seats = getSeats();
  const active = reservations.find(r => r.userId === userId && (r.status === 'active' || r.status === 'leave'));
  if (!active) {
    return { ok: false, msg: '没有进行中的预约' };
  }
  active.status = 'cancelled';
  const seat = seats.find(s => s.id === active.seatId);
  if (seat) {
    seat.status = 'available';
    seat.reservedBy = null;
    seat.reservedAt = null;
    seat.leaveUntil = null;
  }
  setSeats(seats);
  setReservations(reservations);
  return { ok: true };
}

// 获取当前用户预约
function getMyActiveReservation(userId) {
  const list = getReservations();
  return list.find(r => r.userId === userId && (r.status === 'active' || r.status === 'leave'));
}

// 历史记录（所有已结束/取消的）
function getHistory(userId) {
  const list = getReservations();
  return list.filter(r => r.userId === userId && (r.status === 'finished' || r.status === 'cancelled'))
    .concat(list.filter(r => r.userId === userId && (r.status === 'active' || r.status === 'leave')))
    .sort((a, b) => b.startAt - a.startAt);
}

// 黑名单：添加
function addToBlacklist(userId, reason, adminId) {
  const list = getBlacklist();
  if (list.some(b => b.userId === userId)) {
    return { ok: false, msg: '已在黑名单中' };
  }
  list.push({
    userId,
    reason,
    adminId: adminId || 'system',
    createdAt: Date.now()
  });
  setBlacklist(list);
  return { ok: true };
}

// 黑名单：移除
function removeFromBlacklist(userId) {
  let list = getBlacklist().filter(b => b.userId !== userId);
  setBlacklist(list);
  return { ok: true };
}

// 是否在黑名单
function isBlacklisted(userId) {
  return getBlacklist().some(b => b.userId === userId);
}

// 定时任务：过期预约释放座位（可在 onShow 时调用）
function releaseExpiredReservations() {
  const now = Date.now();
  const reservations = getReservations();
  const seats = getSeats();
  let changed = false;
  reservations.forEach(r => {
    if ((r.status === 'active' || r.status === 'leave') && r.endAt <= now) {
      r.status = 'finished';
      changed = true;
      const seat = seats.find(s => s.id === r.seatId);
      if (seat) {
        seat.status = 'available';
        seat.reservedBy = null;
        seat.reservedAt = null;
        seat.leaveUntil = null;
      }
    }
    if (r.status === 'leave' && r.leaveUntil && r.leaveUntil <= now) {
      r.status = 'finished';
      changed = true;
      const seat = seats.find(s => s.id === r.seatId);
      if (seat) {
        seat.status = 'available';
        seat.reservedBy = null;
        seat.reservedAt = null;
        seat.leaveUntil = null;
      }
    }
  });
  if (changed) {
    setReservations(reservations);
    setSeats(seats);
  }
}

module.exports = {
  getSeats,
  setSeats,
  getReservations,
  setReservations,
  getBlacklist,
  setBlacklist,
  getUserId,
  getMaxLeaveCount,
  getReservationCountIn24h,
  getViolationUntil,
  canReserve,
  reserveSeat,
  applyLeave,
  backFromLeave,
  renewSeat,
  cancelReservation,
  getMyActiveReservation,
  getHistory,
  addToBlacklist,
  removeFromBlacklist,
  isBlacklisted,
  releaseExpiredReservations
};
