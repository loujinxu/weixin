/**
 * 阿里云后端请求封装示例
 * 迁移到阿里云后，在 app.js 中可用本模块替代 wx.cloud.callFunction。
 * 使用前请在 config/api.js 中设置 useAliyun: true 和 apiBase。
 */

const config = require('../config/api.js');

function request(options) {
  const { path, method = 'GET', data = {}, needAuth = true } = options;
  const apiBase = (config.apiBase || '').replace(/\/$/, '');
  if (!apiBase) {
    console.warn('请先在 config/api.js 中配置 apiBase');
    return Promise.reject(new Error('未配置 API 地址'));
  }
  const openid = wx.getStorageSync('currentUserId') || '';
  const header = {
    'content-type': 'application/json',
    ...(needAuth && openid ? { 'X-Openid': openid } : {})
  };
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${apiBase}${path}`,
      method,
      data,
      header,
      success: (res) => {
        const data = res.data;
        if (res.statusCode === 200 && data) {
          resolve(data);
        } else {
          reject(new Error(data && data.msg ? data.msg : '请求失败'));
        }
      },
      fail: (err) => reject(err)
    });
  });
}

/** 登录：用 code 换 openid（后端调微信 code2session） */
function login(code) {
  return request({
    path: '/api/login',
    method: 'POST',
    data: { code },
    needAuth: false
  });
}

/** 获取已占用座位列表 */
function getReservedSeats(startSeat, endSeat, now) {
  return request({
    path: `/api/seats/reserved?startSeat=${startSeat}&endSeat=${endSeat}&now=${now}`,
    method: 'GET',
    needAuth: true
  });
}

/** 预约座位 */
function reserveSeat(seatNumber, hours) {
  return request({
    path: '/api/seats/reserve',
    method: 'POST',
    data: { seatNumber: parseInt(seatNumber, 10), hours: parseInt(hours, 10) }
  });
}

/** 释放座位 */
function releaseSeat(seatNumber) {
  return request({
    path: '/api/seats/release',
    method: 'POST',
    data: { seatNumber: parseInt(seatNumber, 10) }
  });
}

/** 续约 */
function renewSeat(seatNumber, hours, expiredHours) {
  return request({
    path: '/api/seats/renew',
    method: 'POST',
    data: { seatNumber: parseInt(seatNumber, 10), hours: parseInt(hours, 10), expiredHours: parseInt(expiredHours, 10) }
  });
}

/** 开始暂离 */
function startTempLeave(seatNumber) {
  return request({
    path: '/api/seats/tempLeave/start',
    method: 'POST',
    data: { seatNumber: parseInt(seatNumber, 10) }
  });
}

/** 结束暂离 */
function endTempLeave(seatNumber) {
  return request({
    path: '/api/seats/tempLeave/end',
    method: 'POST',
    data: { seatNumber: parseInt(seatNumber, 10) }
  });
}

module.exports = {
  request,
  login,
  getReservedSeats,
  reserveSeat,
  releaseSeat,
  renewSeat,
  startTempLeave,
  endTempLeave
};
