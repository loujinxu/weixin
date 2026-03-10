App({
  // 全局核心数据
  globalData: {
    currentSeat: "",
    currentReservationHours: 0,
    remainingTime: 0,
    reservationCount: 0,
    temporaryCount: 0,
    continuousOverLimit: 0,
    // 本地仅保存“当前用户”的预约（用于倒计时/页面恢复）
    reservedSeats: {},
    reservationHistory: [],
    currentUserId: null,
    isViolation: false,
    violationStart: 0,
    violationDate: "",
    last24HoursReservations: [],
    last24HoursTempLeaves: [],
    last24HoursEndReservations: [],
    todayReservationCount: 0, // 当日新预约次数
    lastReservationDate: "",
    maxReservationLockUntil: 0,
    renewingSeat: null,  // 当前正在续约的座位
    renewingSeatHours: 0, // 续约座位的过期前时长
    isRenewProcess: false, // 标记是否为续约流程
    // 图书馆 WiFi 名称（用于取消暂离时校验，请改为本馆实际 WiFi 的 SSID）。留空则不校验
    libraryWifiSsid: '',

    // === 云开发（多用户真抢座） ===
    cloudReady: false,
    openid: '',
    // 云端座位占用缓存：{ [seatNumber]: { userId, expireTime } }
    cloudSeatLocks: {}
  },

  /**
   * 检测当前是否已连接图书馆 WiFi（用于取消暂离认证）
   * 通过微信 wx.getConnectedWifi 获取当前连接 WiFi 的 SSID，与配置的 libraryWifiSsid 比对
   * @param {Function} callback - callback(isConnected, errMsg) 是否连接图书馆WiFi，及失败时的提示
   */
  checkIsLibraryWifi(callback) {
    const librarySsid = (this.globalData.libraryWifiSsid || '').trim();
    if (!librarySsid) {
      callback(true, null); // 未配置则默认允许（兼容旧逻辑）
      return;
    }
    const normalize = (s) => {
      if (!s || typeof s !== 'string') return '';
      s = s.trim();
      if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
      return s.trim();
    };
    wx.startWifi({
      success: () => {
        wx.getConnectedWifi({
          success: (res) => {
            const currentSsid = normalize((res.wifi && res.wifi.SSID) || '');
            const isMatch = currentSsid === normalize(librarySsid);
            if (isMatch) {
              callback(true, null);
            } else {
              callback(false, '请连接图书馆 WiFi 后再取消暂离');
            }
          },
          fail: (err) => {
            const msg = (err.errMsg || '').includes('fail') ? '无法获取 WiFi 信息，请确保已连接图书馆 WiFi' : '请连接图书馆 WiFi 后再取消暂离';
            callback(false, msg);
          }
        });
      },
      fail: (err) => {
        const msg = (err.errMsg || '').includes('not support') ? '当前设备不支持 WiFi 检测，请确保已连接图书馆 WiFi 后重试' : '请连接图书馆 WiFi 后再取消暂离';
        callback(false, msg);
      }
    });
  },

  // 小程序启动时加载本地缓存
  onLaunch() {
    console.log("小程序启动");
    this.initCloud();
    this.loadLocalCache();
    this.checkNewDayReset();
    this.generateUserId(); // 云开发未就绪时的兜底；云登录成功后会覆盖为 openid
    this.cleanupExpiredReservations();
  },

  // 初始化云开发（用于多用户共享座位状态）
  initCloud() {
    if (!wx.cloud) {
      console.warn('当前基础库不支持云开发，无法实现多用户抢座（仅本地模式）');
      this.globalData.cloudReady = false;
      return;
    }
    try {
      wx.cloud.init({
        env: wx.cloud.DYNAMIC_CURRENT_ENV,
        traceUser: true
      });
      this.globalData.cloudReady = true;
      // 获取 openid 作为真正的“用户标识”
      wx.cloud.callFunction({
        name: 'login',
        data: {},
        success: (res) => {
          const openid = (res && res.result && res.result.openid) || '';
          if (openid) {
            this.globalData.openid = openid;
            this.globalData.currentUserId = openid;
            wx.setStorageSync('currentUserId', openid);
            this.migrateLocalReservationToOpenId(openid);
            console.log('云登录成功 openid:', openid);
          } else {
            console.warn('云登录未获取到 openid', res);
          }
        },
        fail: (err) => {
          console.warn('云登录失败，将使用本地 userId 兜底', err);
        }
      });
    } catch (e) {
      console.warn('云开发初始化异常', e);
      this.globalData.cloudReady = false;
    }
  },

  // 将本地已存在的预约 userId 迁移为 openid（避免云登录后“不是我的座位”）
  migrateLocalReservationToOpenId(openid) {
    try {
      const reservedSeats = this.globalData.reservedSeats || {};
      let changed = false;
      Object.keys(reservedSeats).forEach((seat) => {
        const r = reservedSeats[seat];
        if (r && r.userId && r.userId !== openid) {
          r.userId = openid;
          reservedSeats[seat] = r;
          changed = true;
        }
      });
      if (changed) {
        this.globalData.reservedSeats = reservedSeats;
        wx.setStorageSync('reservedSeats', reservedSeats);
      }
    } catch (e) {}
  },

  // 刷新某个座位范围的云端占用状态（用于座位列表“占用中”展示）
  refreshCloudSeatLocks(startSeat, endSeat, callback) {
    if (!this.globalData.cloudReady || !wx.cloud) {
      callback && callback(false);
      return;
    }
    const now = Date.now();
    wx.cloud.callFunction({
      name: 'getReservedSeats',
      data: { startSeat, endSeat, now },
      success: (res) => {
        const list = (res && res.result && res.result.list) || [];
        const map = { ...(this.globalData.cloudSeatLocks || {}) };
        list.forEach((it) => {
          if (it && it.seatNumber != null) {
            map[it.seatNumber] = { userId: it.userId, expireTime: it.expireTime };
          }
        });
        // 清理该范围内的过期缓存
        Object.keys(map).forEach((k) => {
          const sn = parseInt(k, 10);
          if (sn >= startSeat && sn <= endSeat) {
            const v = map[k];
            if (!v || !v.expireTime || v.expireTime <= now) delete map[k];
          }
        });
        this.globalData.cloudSeatLocks = map;
        callback && callback(true, map);
      },
      fail: (err) => {
        console.warn('获取云端占用座位失败', err);
        callback && callback(false);
      }
    });
  },

  // 按楼层刷新云端占用座位
  refreshCloudSeatLocksByFloor(floor, callback) {
    const f = parseInt(floor, 10) || 1;
    const ranges = {
      1: [1, 600],
      2: [601, 1200],
      3: [1201, 1800]
    };
    const [startSeat, endSeat] = ranges[f] || ranges[1];
    this.refreshCloudSeatLocks(startSeat, endSeat, callback);
  },

  // 云端抢座（事务锁座位），成功后同步到本地 reservedSeats（仅当前用户）
  cloudReserveSeat(seatNumber, hours, callback) {
    if (!this.globalData.cloudReady || !wx.cloud) {
      callback && callback(false, '云开发未开启（请先在开发者工具开通云开发并部署云函数）');
      return;
    }
    wx.cloud.callFunction({
      name: 'reserveSeat',
      data: { seatNumber: parseInt(seatNumber, 10), hours: parseInt(hours, 10) },
      success: (res) => {
        const r = (res && res.result) || {};
        if (r.ok) {
          const now = Date.now();
          const expireTime = r.expireTime || (now + parseInt(hours, 10) * 60 * 60 * 1000);
          // 本地仅保存当前用户的预约，用于倒计时展示/恢复
          this.globalData.reservedSeats[seatNumber] = {
            userId: this.globalData.currentUserId,
            hours: parseInt(hours, 10),
            startTime: now,
            expireTime: expireTime,
            isTempLeave: false,
            tempLeaveCount: 0,
            isRenew: false
          };
          wx.setStorageSync('reservedSeats', this.globalData.reservedSeats);
          callback && callback(true, null, { expireTime });
        } else {
          // 云函数主动返回的失败原因
          if (r && r.debug && (r.debug.message || r.debug.stack)) {
            console.warn('reserveSeat debug', r.debug);
          }
          callback && callback(false, r.msg || '抢座失败', r);
        }
      },
      fail: (err) => {
        const em = (err && err.errMsg) ? String(err.errMsg) : '';
        console.warn('云端抢座失败', err);
        // 常见原因提示：云环境未开通/未选择环境、云函数未部署、云函数名不对等
        if (em.includes('function not found') || em.includes('functions not found') || em.includes('Not Found')) {
          callback && callback(false, '云函数未部署：请在开发者工具里右键 cloudfunctions 下的云函数 → 上传并部署');
          return;
        }
        if (em.includes('no permission') || em.includes('permission')) {
          callback && callback(false, '云开发权限不足：请确认已开通云开发，并使用正确的云环境');
          return;
        }
        if (em.includes('init')) {
          callback && callback(false, '云开发初始化失败：请先开通云开发环境，并在工具里选择环境后再试');
          return;
        }
        callback && callback(false, em ? ('抢座失败：' + em) : '网络繁忙，请稍后再试');
      }
    });
  },

  // 云端退坐（释放座位锁）
  cloudReleaseSeat(seatNumber, callback) {
    if (!this.globalData.cloudReady || !wx.cloud) {
      callback && callback(false);
      return;
    }
    wx.cloud.callFunction({
      name: 'releaseSeat',
      data: { seatNumber: parseInt(seatNumber, 10) },
      success: (res) => {
        const r = (res && res.result) || {};
        callback && callback(!!r.ok, r.msg || null);
      },
      fail: (err) => {
        console.warn('云端退坐失败', err);
        callback && callback(false, '网络繁忙，请稍后再试');
      }
    });
  },

  // 云端抢座成功后，沿用原有本地计数/限制逻辑（用于“每日次数/24h次数/违规”）
  recordLocalReservationAfterCloud(seatNumber, hours, isRenew = false) {
    const now = Date.now();
    // 增加预约计数
    this.globalData.reservationCount += 1;
    wx.setStorageSync('reservationCount', this.globalData.reservationCount);

    // 如果不是续约，增加今日新预约计数（续约不计入）
    if (!isRenew) {
      this.globalData.todayReservationCount += 1;
      wx.setStorageSync('todayReservationCount', this.globalData.todayReservationCount);

      // 记录预约日期
      const today = this.getDateString(new Date());
      this.globalData.lastReservationDate = today;
      wx.setStorageSync('lastReservationDate', today);

      // 达到上限则锁定
      if (this.globalData.todayReservationCount >= 10) {
        this.setReservationLock();
      }
    }

    // 记录24小时内预约
    if (!this.globalData.last24HoursReservations) {
      this.globalData.last24HoursReservations = [];
    }
    this.globalData.last24HoursReservations.push({
      seat: seatNumber,
      time: now,
      status: 'active',
      isRenew: !!isRenew
    });
    wx.setStorageSync('last24HoursReservations', this.globalData.last24HoursReservations);
  },

  // 生成用户ID
  generateUserId() {
    if (!this.globalData.currentUserId) {
      this.globalData.currentUserId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      wx.setStorageSync('currentUserId', this.globalData.currentUserId);
      console.log(`生成新用户ID: ${this.globalData.currentUserId}`);
    }
  },

  // 加载本地缓存数据
  loadLocalCache() {
    console.log("加载本地缓存数据");

    const keys = [
      'reservationCount', 'temporaryCount',
      'continuousOverLimit', 'reservedSeats',
      'reservationHistory', 'violationStart',
      'isViolation', 'violationDate', 'currentUserId',
      'last24HoursReservations', 'last24HoursTempLeaves',
      'last24HoursEndReservations',
      'todayReservationCount', 'lastReservationDate', 'maxReservationLockUntil',
      'renewingSeat', 'renewingSeatHours', 'isRenewProcess'
    ];

    keys.forEach(key => {
      const value = wx.getStorageSync(key);
      if (value !== '' && value !== null && value !== undefined) {
        this.globalData[key] = value;
        console.log(`加载 ${key}:`, value);
      } else {
        console.log(`${key} 无缓存数据`);
        // 初始化数据
        if (key === 'reservationHistory') {
          this.globalData.reservationHistory = [];
        } else if (key === 'last24HoursReservations' || key === 'last24HoursTempLeaves' || key === 'last24HoursEndReservations') {
          this.globalData[key] = [];
        } else if (key === 'reservedSeats') {
          this.globalData.reservedSeats = {};
        } else if (key === 'todayReservationCount') {
          this.globalData.todayReservationCount = 0;
        } else if (key === 'maxReservationLockUntil') {
          this.globalData.maxReservationLockUntil = 0;
        } else if (key === 'renewingSeat') {
          this.globalData.renewingSeat = null;
        } else if (key === 'renewingSeatHours') {
          this.globalData.renewingSeatHours = 0;
        } else if (key === 'isRenewProcess') {
          this.globalData.isRenewProcess = false;
        }
      }
    });

    // 确保reservationHistory存在
    if (!Array.isArray(this.globalData.reservationHistory)) {
      this.globalData.reservationHistory = [];
    }

    console.log("本地缓存加载完成");
  },

  // 检查是否为新一天，重置当日计数
  checkNewDayReset() {
    const now = new Date();
    const today = this.getDateString(now);
    const lastResetDate = wx.getStorageSync('lastResetDate') || '';

    console.log(`今天: ${today}, 上次重置日期: ${lastResetDate}`);

    // 如果今天是新的一天
    if (today !== lastResetDate) {
      console.log(`新的一天开始: ${today}, 重置计数`);

      // 重置当日预约次数
      this.globalData.reservationCount = 0;
      wx.setStorageSync('reservationCount', 0);

      // 重置当日暂离次数
      this.globalData.temporaryCount = 0;
      wx.setStorageSync('temporaryCount', 0);

      // 重置今日新预约次数（改为最大10次）
      this.globalData.todayReservationCount = 0;
      wx.setStorageSync('todayReservationCount', 0);

      // 重置24小时内的预约记录
      this.globalData.last24HoursReservations = [];
      wx.setStorageSync('last24HoursReservations', []);

      // 重置24小时内的退坐记录
      this.globalData.last24HoursEndReservations = [];
      wx.setStorageSync('last24HoursEndReservations', []);

      // 重置续约状态
      this.globalData.renewingSeat = null;
      this.globalData.renewingSeatHours = 0;
      this.globalData.isRenewProcess = false;
      wx.setStorageSync('renewingSeat', null);
      wx.setStorageSync('renewingSeatHours', 0);
      wx.setStorageSync('isRenewProcess', false);

      // 记录今天的日期
      wx.setStorageSync('lastResetDate', today);

      // 检查是否需要解除预约次数锁定
      this.checkReservationLockReset(today);
    }
  },

  // 检查是否需要解除预约次数锁定
  checkReservationLockReset(today) {
    const now = new Date();
    const todayTime = now.getTime();

    // 如果当前时间已经超过了锁定时间，清除锁定
    if (this.globalData.maxReservationLockUntil && todayTime >= this.globalData.maxReservationLockUntil) {
      console.log('预约次数锁定已过期，重置锁定状态');
      this.globalData.maxReservationLockUntil = 0;
      wx.setStorageSync('maxReservationLockUntil', 0);
    }
  },

  // 获取日期字符串（YYYY-MM-DD格式）
  getDateString: function(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 检查用户是否可以预约（包含续约判断）
  canUserReserve: function(isRenew = false) {
    const now = new Date();
    const today = this.getDateString(now);
    const nowTime = now.getTime();

    console.log('检查用户是否可以预约:', {
      todayReservationCount: this.globalData.todayReservationCount,
      maxReservationLockUntil: this.globalData.maxReservationLockUntil,
      nowTime: nowTime,
      isRenew: isRenew
    });

    // 如果是续约操作，不检查预约次数限制
    if (isRenew) {
      return {
        canReserve: true,
        reason: '',
        message: '',
        isRenew: true
      };
    }

    // 检查预约次数锁定
    if (this.globalData.maxReservationLockUntil && nowTime < this.globalData.maxReservationLockUntil) {
      const lockEndDate = new Date(this.globalData.maxReservationLockUntil);
      const lockEndString = `${lockEndDate.getFullYear()}年${lockEndDate.getMonth() + 1}月${lockEndDate.getDate()}日 ${lockEndDate.getHours().toString().padStart(2, '0')}:${lockEndDate.getMinutes().toString().padStart(2, '0')}`;

      return {
        canReserve: false,
        reason: 'max_limit',
        message: `您当日的可预约次数已耗尽（每日最多3次），预约功能已被锁定。\n（解锁时间: ${lockEndString}）`,
        lockEndTime: this.globalData.maxReservationLockUntil,
        isRenew: false
      };
    }

    // 检查今日新预约次数
    if (this.globalData.todayReservationCount >= 3) {
      // 今日新预约次数已达3次，设置锁定
      this.setReservationLock();

      const lockEndDate = new Date(this.globalData.maxReservationLockUntil);
      const lockEndString = `${lockEndDate.getFullYear()}年${lockEndDate.getMonth() + 1}月${lockEndDate.getDate()}日 ${lockEndDate.getHours().toString().padStart(2, '0')}:${lockEndDate.getMinutes().toString().padStart(2, '0')}`;

      return {
        canReserve: false,
        reason: 'max_limit',
        message: `您当日的可预约次数已耗尽（每日最多3次），预约次数将在后天0:00重置。\n（解锁时间: ${lockEndString}）`,
        lockEndTime: this.globalData.maxReservationLockUntil,
        isRenew: false
      };
    }

    return {
      canReserve: true,
      reason: '',
      message: '',
      isRenew: false
    };
  },

  // 设置预约次数锁定（达到3次后锁定到第三天0:00）
  setReservationLock: function() {
    if (this.globalData.maxReservationLockUntil > 3) {
      return; // 已经锁定
    }

    const now = new Date();
    const lockEndDate = new Date(now);

    // 计算后天0:00的时间
    lockEndDate.setDate(lockEndDate.getDate() + 2); // 后天
    lockEndDate.setHours(0, 0, 0, 0); // 0:00:00.000

    this.globalData.maxReservationLockUntil = lockEndDate.getTime();
    wx.setStorageSync('maxReservationLockUntil', this.globalData.maxReservationLockUntil);

    console.log(`设置预约次数锁定，解锁时间: ${lockEndDate}`);
  },

  // 标记座位为已预约
  markSeatReserved: function(seatNumber, hours, isRenew = false) {
    const now = Date.now();
    const expireTime = now + (hours * 60 * 60 * 1000);

    // 检查用户是否可以预约
    const canReserveResult = this.canUserReserve(isRenew);
    if (!canReserveResult.canReserve) {
      wx.showModal({
        title: "预约限制",
        content: canReserveResult.message,
        showCancel: false
      });
      return false;
    }

    // 检查座位是否可用
    if (!isRenew && this.getSeatStatus(seatNumber) === 'reserved') {
      wx.showToast({
        title: '该座位已被占用',
        icon: 'none',
        duration: 2000
      });
      return false;
    }

    // 如果是新预约（非续约），检查用户是否已有预约
    if (!isRenew) {
      for (const seat in this.globalData.reservedSeats) {
        const reservation = this.globalData.reservedSeats[seat];
        if (reservation.expireTime > now && reservation.userId === this.globalData.currentUserId) {
          wx.showToast({
            title: '您已有一个预约中的座位',
            icon: 'none',
            duration: 2000
          });
          return false;
        }
      }
    }

    // 记录预约
    this.globalData.reservedSeats[seatNumber] = {
      userId: this.globalData.currentUserId,
      hours: hours,
      startTime: now,
      expireTime: expireTime,
      isTempLeave: false,
      tempLeaveCount: 0,
      isRenew: isRenew  // 标记是否为续约
    };

    wx.setStorageSync('reservedSeats', this.globalData.reservedSeats);

    // 增加预约计数
    this.globalData.reservationCount += 1;
    wx.setStorageSync('reservationCount', this.globalData.reservationCount);

    // 如果不是续约，增加今日新预约计数（续约不计入）
    if (!isRenew) {
      this.globalData.todayReservationCount += 1;
      wx.setStorageSync('todayReservationCount', this.globalData.todayReservationCount);

      // 记录预约时间
      const today = this.getDateString(new Date());
      this.globalData.lastReservationDate = today;
      wx.setStorageSync('lastReservationDate', today);

      console.log(`新预约座位 ${seatNumber}, 时长: ${hours}小时, 今日新预约次数: ${this.globalData.todayReservationCount}`);

      // 检查是否达到3次新预约限制
      if (this.globalData.todayReservationCount >= 10) {
        console.log('今日新预约次数已达3次，设置锁定');
        this.setReservationLock();
      }
    } else {
      console.log(`续约座位 ${seatNumber}, 时长: ${hours}小时, 今日新预约次数: ${this.globalData.todayReservationCount} (续约不计入)`);
    }

    // 记录24小时内预约
    if (!this.globalData.last24HoursReservations) {
      this.globalData.last24HoursReservations = [];
    }
    this.globalData.last24HoursReservations.push({
      seat: seatNumber,
      time: now,
      status: 'active',
      isRenew: isRenew
    });
    wx.setStorageSync('last24HoursReservations', this.globalData.last24HoursReservations);

    return true;
  },

  // 续约座位（核心修改：支持过期座位续约）
  renewSeat: function(seatNumber, hours, expiredHours) {
    console.log(`续约座位: ${seatNumber}, 新增时长: ${hours}小时, 过期前时长: ${expiredHours}`);

    // 检查座位是否被当前用户预约（即使过期）
    const seatInfo = this.globalData.reservedSeats[seatNumber];
    if (!seatInfo || seatInfo.userId !== this.globalData.currentUserId) {
      wx.showToast({
        title: '该座位不是您的预约',
        icon: 'none',
        duration: 2000
      });
      return false;
    }

    // 计算新的到期时间：从“当前到期时间/当前时间”中取更晚者再延长
    const now = Date.now();
    const base = Math.max(seatInfo.expireTime || 0, now);
    const newExpireTime = base + (hours * 60 * 60 * 1000);

    // 更新座位信息
    seatInfo.expireTime = newExpireTime;
    seatInfo.hours = expiredHours + hours; // 累计总时长
    seatInfo.status = 'active'; // 重置为活跃状态
    seatInfo.isRenew = true;
    seatInfo.tempLeaveCount = 0; // 重置暂离次数

    this.globalData.reservedSeats[seatNumber] = seatInfo;
    wx.setStorageSync('reservedSeats', this.globalData.reservedSeats);

    // 保存新的续约记录（状态为进行中）
    this.saveReservationHistory(seatNumber, hours, now, "进行中", true);

    // 重置续约状态
    this.globalData.renewingSeat = null;
    this.globalData.renewingSeatHours = 0;
    this.globalData.isRenewProcess = false;
    wx.setStorageSync('renewingSeat', null);
    wx.setStorageSync('renewingSeatHours', 0);
    wx.setStorageSync('isRenewProcess', false);

    console.log(`续约成功, 座位 ${seatNumber} 新增 ${hours} 小时, 新到期时间: ${new Date(newExpireTime)}`);

    // 同步到云端（多用户真抢座：延长座位锁）
    if (this.globalData.cloudReady && wx.cloud) {
      wx.cloud.callFunction({
        name: 'renewSeat',
        data: { seatNumber: parseInt(seatNumber, 10), extraHours: parseInt(hours, 10) },
        fail: (err) => console.warn('云端续约失败', err)
      });
    }
    return true;
  },

  // 更新续约历史记录（兼容旧逻辑）
  updateRenewHistory: function(seatNumber, hours, renewTime) {
    if (!this.globalData.reservationHistory || this.globalData.reservationHistory.length === 0) {
      console.log("无预约历史记录");
      return false;
    }

    console.log(`更新续约记录: 座位${seatNumber}, 增加时长:${hours}小时, 时间:${renewTime}`);

    // 找到最新的相同座位的预约记录
    for (let i = 0; i < this.globalData.reservationHistory.length; i++) {
      const record = this.globalData.reservationHistory[i];
      if (record.seat === seatNumber && record.status === "进行中") {
        // 创建续约记录
        const renewRecord = {
          id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          seat: seatNumber,
          hours: hours,
          startTime: renewTime,
          dateString: this.formatTime(renewTime),
          status: "续约",
          isRenew: true,
          originalRecordId: record.id
        };

        // 在原有记录后插入续约记录
        this.globalData.reservationHistory.splice(i + 1, 0, renewRecord);
        wx.setStorageSync('reservationHistory', this.globalData.reservationHistory);

        console.log(`续约记录保存成功, 当前记录数: ${this.globalData.reservationHistory.length}`);
        return true;
      }
    }

    console.log(`未找到座位${seatNumber}的进行中预约记录`);
    return false;
  },

  // 格式化时间
  formatTime: function(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}年${month}月${day}日 ${hour}:${minute}`;
  },

  // 保存预约记录到本地缓存
  saveReservationHistory: function(seat, hours, startTime, status = "进行中", isRenew = false) {
    console.log(`保存预约记录: 座位${seat}号, 时长:${hours}小时, 时间:${startTime}, 状态:${status}, 是否续约:${isRenew}`);

    const historyItem = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 9), // 唯一ID
      seat: seat,
      hours: hours,
      startTime: startTime,
      dateString: this.formatTime(startTime), // 格式化日期
      status: status,
      endTime: null,
      isRenew: isRenew
    };

    // 初始化预约历史数组
    if (!Array.isArray(this.globalData.reservationHistory)) {
      this.globalData.reservationHistory = [];
    }

    this.globalData.reservationHistory.unshift(historyItem);
    wx.setStorageSync('reservationHistory', this.globalData.reservationHistory);

    console.log(`预约记录保存成功, 当前记录数: ${this.globalData.reservationHistory.length}`);

    return historyItem;
  },

  // 更新预约记录状态
  updateReservationStatus: function(seat, endTime, status) {
    if (!this.globalData.reservationHistory || this.globalData.reservationHistory.length === 0) {
      console.log("无预约历史记录可更新");
      return false;
    }

    console.log(`更新预约记录状态: 座位${seat}, 结束时间:${endTime}, 状态:${status}`);

    // 找到最新的相同座位的预约记录
    for (let i = 0; i < this.globalData.reservationHistory.length; i++) {
      const record = this.globalData.reservationHistory[i];
      if (record.seat === seat && (record.status === "进行中" || record.status === "续约")) {
        record.status = status;
        record.endTime = endTime;

        // 如果是结束预约，格式化结束时间
        if (endTime) {
          const endDate = new Date(endTime);
          const year = endDate.getFullYear();
          const month = String(endDate.getMonth() + 1).padStart(2, '0');
          const day = String(endDate.getDate()).padStart(2, '0');
          const hour = String(endDate.getHours()).padStart(2, '0');
          const minute = String(endDate.getMinutes()).padStart(2, '0');
          record.endTimeString = `${year}年${month}月${day}日 ${hour}:${minute}`;
        }

        wx.setStorageSync('reservationHistory', this.globalData.reservationHistory);
        console.log(`预约记录更新成功: 座位${seat}, 状态: ${status}`);
        return true;
      }
    }

    console.log(`未找到座位${seat}的进行中预约记录`);
    return false;
  },

  // 检查座位状态
  getSeatStatus: function(seatNumber) {
    const now = Date.now();
    // 1) 当前用户本地预约
    const seatInfo = this.globalData.reservedSeats[seatNumber];

    if (!seatInfo) {
      // 2) 云端占用缓存（其他用户）
      const cloudInfo = (this.globalData.cloudSeatLocks || {})[seatNumber];
      if (cloudInfo && cloudInfo.expireTime && cloudInfo.expireTime > now) {
        return 'reserved';
      }
      return 'available';
    }

    // 检查是否过期（续约时忽略过期状态，仅判断是否为当前用户）
    if (seatInfo.expireTime && seatInfo.expireTime <= now) {
      // 本地已过期时，优先看云端是否已被他人占用
      const cloudInfo = (this.globalData.cloudSeatLocks || {})[seatNumber];
      if (cloudInfo && cloudInfo.expireTime && cloudInfo.expireTime > now) {
        return 'reserved';
      }
      return 'expired';
    }

    return 'reserved';
  },

  // 将内部座位号格式化为显示座位号（1-x / 2-x / 3-x）
  formatSeatLabel: function(seatNumber) {
    const n = Number(seatNumber);
    if (!n || Number.isNaN(n)) return String(seatNumber || '');
    if (n >= 1 && n <= 600) return `1-${n}`;
    if (n >= 601 && n <= 1200) return `2-${n - 600}`;
    if (n >= 1201 && n <= 1800) return `3-${n - 1200}`;
    return String(n);
  },

  // 检查用户是否可暂离
  canUserTemporary: function(seatNumber) {
    const seatInfo = this.globalData.reservedSeats[seatNumber];
    if (!seatInfo) {
      console.log(`座位 ${seatNumber} 的预约信息不存在`);
      return { canTemp: false, message: '预约信息不存在' };
    }

    const maxTempLeaves = this.getMaxTempLeaves(seatInfo.hours);
    const currentTempCount = seatInfo.tempLeaveCount || 0;

    console.log(`检查暂离: 座位${seatNumber}, 已暂离${currentTempCount}次, 最大允许${maxTempLeaves}次`);

    if (currentTempCount >= maxTempLeaves) {
      return {
        canTemp: false,
        message: '暂离次数已达上限',
        exceedLimit: true
      };
    }

    return { canTemp: true, message: '' };
  },

  // 获取最大暂离次数
  getMaxTempLeaves: function(hours) {
    if (hours <= 2) return 1;
    if (hours <= 4) return 2;
    return 4;
  },

  // 处理暂离次数超限
  handleTempLeaveExceed: function(seatNumber) {
    console.log(`处理暂离次数超限, 座位: ${seatNumber}`);

    const seatInfo = this.globalData.reservedSeats[seatNumber];
    if (!seatInfo) {
      console.log(`座位 ${seatNumber} 的预约信息不存在`);
      return false;
    }

    // 1. 立即结束当前预约
    this.endReservationImmediately(seatNumber, "暂离次数超限");

    // 2. 记录违规
    this.recordViolation('temp_exceed');

    // 3. 显示提示
    wx.showToast({
      title: '暂离次数超限，预约已结束',
      icon: 'none',
      duration: 3000
    });

    return true;
  },

  // 立即结束预约
  endReservationImmediately: function(seatNumber, reason = "用户退坐", isRenewExpire = false) {
    console.log(`立即结束预约: 座位${seatNumber}, 原因:${reason}, 是否续约过期:${isRenewExpire}`);

    const now = Date.now();
    const seatInfo = this.globalData.reservedSeats[seatNumber];

    if (seatInfo) {
      // 如果不是续约过期，才需要记录退坐
      if (!isRenewExpire) {
        // 增加24小时内退坐记录
        if (!this.globalData.last24HoursEndReservations) {
          this.globalData.last24HoursEndReservations = [];
        }
        this.globalData.last24HoursEndReservations.push({
          time: now,
          type: 'end_reservation'
        });
        wx.setStorageSync('last24HoursEndReservations', this.globalData.last24HoursEndReservations);

        // 记录违规
        this.recordViolation('end_reservation');
      }

      // 更新预约历史状态
      this.updateReservationStatus(seatNumber, now, reason);

      // 云端退坐：释放座位锁（多用户共享）
      this.cloudReleaseSeat(seatNumber, () => {});

      // 完全删除座位预约数据
      delete this.globalData.reservedSeats[seatNumber];
      wx.setStorageSync('reservedSeats', this.globalData.reservedSeats);

      console.log(`座位 ${seatNumber} 预约已结束`);
      return true;
    }

    console.log(`座位 ${seatNumber} 无预约信息`);
    return false;
  },

  // 记录违规行为
  recordViolation(type) {
    console.log(`记录违规行为: ${type}`);

    if (type === 'end_reservation' || type === 'temp_timeout' || type === 'temp_exceed') {
      // 记录退坐违规
      this.globalData.continuousOverLimit += 1;
      wx.setStorageSync('continuousOverLimit', this.globalData.continuousOverLimit);

      console.log(`当前连续违规次数: ${this.globalData.continuousOverLimit}`);

      // 检查是否达到违规阈值
      if (this.globalData.continuousOverLimit >= 1) {
        this.startViolation();
      }
    }
  },

  // 开始违规期
  startViolation() {
    const now = new Date();
    const today = this.getDateString(now);

    this.globalData.isViolation = true;
    this.globalData.violationStart = Date.now();
    this.globalData.violationDate = today;

    wx.setStorageSync('isViolation', true);
    wx.setStorageSync('violationStart', this.globalData.violationStart);
    wx.setStorageSync('violationDate', today);

    console.log(`用户违规，违规日期: ${today}`);
  },

  // 检查24小时内退坐次数
  check24HourEndReservations() {
    const now = Date.now();
    const last24Hours = now - 24 * 60 * 60 * 1000;

    // 初始化24小时退坐记录
    if (!this.globalData.last24HoursEndReservations) {
      this.globalData.last24HoursEndReservations = [];
    }

    // 清理24小时前的退坐记录
    this.globalData.last24HoursEndReservations = this.globalData.last24HoursEndReservations.filter(
      res => res && res.time > last24Hours
    );

    wx.setStorageSync('last24HoursEndReservations', this.globalData.last24HoursEndReservations);

    const count = this.globalData.last24HoursEndReservations.length;
    console.log(`24小时内退坐次数: ${count}`);

    return count;
  },

  // 清理过期预约（仅清理非当前用户的过期预约）
  cleanupExpiredReservations() {
    console.log("清理过期预约");

    const now = Date.now();
    const reservedSeats = this.globalData.reservedSeats || {};
    let hasChanges = false;

    for (const seat in reservedSeats) {
      const reservation = reservedSeats[seat];
      if (reservation && reservation.expireTime && reservation.expireTime <= now && reservation.userId !== this.globalData.currentUserId) {
        console.log(`清理过期预约: 座位${seat}`);
        // 预约已过期且非当前用户，清理
        delete this.globalData.reservedSeats[seat];
        hasChanges = true;

        // 更新预约历史
        this.updateReservationStatus(seat, now, "已过期");
      }
    }

    if (hasChanges) {
      wx.setStorageSync('reservedSeats', this.globalData.reservedSeats);
    }
  },

  // 开始暂离
  startTempLeave: function(seatNumber) {
    const seatInfo = this.globalData.reservedSeats[seatNumber];
    if (!seatInfo) {
      console.log(`座位 ${seatNumber} 的预约信息不存在`);
      return false;
    }

    // 检查是否已在暂离状态
    if (seatInfo.isTempLeave) {
      console.log(`座位 ${seatNumber} 已在暂离状态`);
      return true;
    }

    // 检查是否可以暂离
    const canTempResult = this.canUserTemporary(seatNumber);
    if (!canTempResult.canTemp) {
      if (canTempResult.exceedLimit) {
        // 暂离次数超限，结束预约
        this.handleTempLeaveExceed(seatNumber);
      } else {
        wx.showToast({
          title: canTempResult.message,
          icon: 'none',
          duration: 2000
        });
      }
      return false;
    }

    const now = Date.now();

    // 标记为暂离状态
    seatInfo.isTempLeave = true;
    seatInfo.tempLeaveStartTime = now;
    seatInfo.tempLeaveCount = (seatInfo.tempLeaveCount || 0) + 1;
    this.globalData.reservedSeats[seatNumber] = seatInfo;
    wx.setStorageSync('reservedSeats', this.globalData.reservedSeats);

    // 同步到云端（多用户真抢座：记录暂离状态）
    if (this.globalData.cloudReady && wx.cloud) {
      wx.cloud.callFunction({
        name: 'startTempLeave',
        data: { seatNumber: parseInt(seatNumber, 10) },
        fail: (err) => console.warn('云端开始暂离失败', err)
      });
    }

    // 增加暂离计数
    this.globalData.temporaryCount += 1;
    wx.setStorageSync('temporaryCount', this.globalData.temporaryCount);

    // 记录24小时内暂离
    if (!this.globalData.last24HoursTempLeaves) {
      this.globalData.last24HoursTempLeaves = [];
    }
    this.globalData.last24HoursTempLeaves.push({
      seat: seatNumber,
      time: now
    });
    wx.setStorageSync('last24HoursTempLeaves', this.globalData.last24HoursTempLeaves);

    console.log(`座位 ${seatNumber} 开始暂离, 当前暂离次数: ${seatInfo.tempLeaveCount}, 当天暂离次数: ${this.globalData.temporaryCount}`);

    return true;
  },

  // 结束暂离
  endTempLeave: function(seatNumber) {
    const seatInfo = this.globalData.reservedSeats[seatNumber];
    if (!seatInfo) {
      console.log(`座位 ${seatNumber} 的预约信息不存在`);
      return false;
    }

    if (!seatInfo.isTempLeave) {
      console.log(`座位 ${seatNumber} 不在暂离状态`);
      return false;
    }

    // 检查是否超时
    if (this.checkTempLeaveTimeout(seatNumber)) {
      console.log(`座位 ${seatNumber} 暂离已超时`);
      this.handleTempLeaveTimeout(seatNumber);
      return false;
    }

    // 结束暂离状态
    seatInfo.isTempLeave = false;
    seatInfo.tempLeaveStartTime = null;
    this.globalData.reservedSeats[seatNumber] = seatInfo;
    wx.setStorageSync('reservedSeats', this.globalData.reservedSeats);

    // 同步到云端（多用户真抢座：取消暂离）
    if (this.globalData.cloudReady && wx.cloud) {
      wx.cloud.callFunction({
        name: 'endTempLeave',
        data: { seatNumber: parseInt(seatNumber, 10) },
        fail: (err) => console.warn('云端结束暂离失败', err)
      });
    }

    console.log(`座位 ${seatNumber} 结束暂离`);
    return true;
  },

  // 检查暂离是否超时
  checkTempLeaveTimeout: function(seatNumber) {
    const seatInfo = this.globalData.reservedSeats[seatNumber];
    if (!seatInfo || !seatInfo.isTempLeave) {
      return false;
    }

    const now = Date.now();
    const startTime = seatInfo.tempLeaveStartTime || 0;
    const passedMinutes = Math.floor((now - startTime) / (1000 * 60));

    console.log(`暂离已过去 ${passedMinutes} 分钟, 座位: ${seatNumber}`);
    return passedMinutes >= 30; // 30分钟超时
  },

  // 处理暂离超时
  handleTempLeaveTimeout: function(seatNumber) {
    console.log(`处理暂离超时, 座位: ${seatNumber}`);

    const seatInfo = this.globalData.reservedSeats[seatNumber];
    if (!seatInfo || !seatInfo.isTempLeave) {
      console.log(`座位 ${seatNumber} 不在暂离状态`);
      return false;
    }

    // 1. 立即结束当前预约
    this.endReservationImmediately(seatNumber, "暂离超时");

    // 2. 记录违规
    this.recordViolation('temp_timeout');

    // 3. 显示提示
    wx.showToast({
      title: '暂离已超时，预约已结束',
      icon: 'none',
      duration: 3000
    });

    return true;
  },

  // 获取暂离剩余时间
  getTempLeaveRemainingTime: function(seatNumber) {
    const seatInfo = this.globalData.reservedSeats[seatNumber];
    if (!seatInfo || !seatInfo.isTempLeave) {
      return 0;
    }

    const now = Date.now();
    const startTime = seatInfo.tempLeaveStartTime || 0;
    const passedSeconds = Math.floor((now - startTime) / 1000);
    const remainingSeconds = Math.max(0, 30 * 60 - passedSeconds); // 30分钟 = 1800秒

    return remainingSeconds;
  },

  // 获取预约剩余秒数
  getRemainingReservationSeconds: function(seatNumber) {
    const now = Date.now();
    const seatInfo = this.globalData.reservedSeats[seatNumber];

    if (!seatInfo) {
      console.log(`座位 ${seatNumber} 的预约信息不存在`);
      return 0;
    }

    const expireTime = seatInfo.expireTime || 0;
    const remainingSeconds = Math.max(0, Math.floor((expireTime - now) / 1000));

    console.log(`座位 ${seatNumber} 剩余时间: ${remainingSeconds}秒`);
    return remainingSeconds;
  },

  // 设置续约状态（核心修改：保存过期前时长）
  setRenewingSeat: function(seatNumber, expiredHours) {
    this.globalData.renewingSeat = seatNumber;
    this.globalData.renewingSeatHours = expiredHours;
    this.globalData.isRenewProcess = true;
    wx.setStorageSync('renewingSeat', seatNumber);
    wx.setStorageSync('renewingSeatHours', expiredHours);
    wx.setStorageSync('isRenewProcess', true);
    console.log(`设置续约座位: ${seatNumber}, 过期前时长: ${expiredHours}`);
  },

  // 清除续约状态
  clearRenewingSeat: function() {
    this.globalData.renewingSeat = null;
    this.globalData.renewingSeatHours = 0;
    this.globalData.isRenewProcess = false;
    wx.setStorageSync('renewingSeat', null);
    wx.setStorageSync('renewingSeatHours', 0);
    wx.setStorageSync('isRenewProcess', false);
    console.log('清除续约状态');
  },

  // 检查是否可以续约当前座位
  canRenewCurrentSeat: function(seatNumber) {
    const seatInfo = this.globalData.reservedSeats[seatNumber];
    if (!seatInfo) {
      console.log(`座位 ${seatNumber} 的预约信息不存在`);
      return { canRenew: false, message: '预约信息不存在' };
    }

    // 检查是否当前用户的预约（即使过期）
    if (seatInfo.userId !== this.globalData.currentUserId) {
      return { canRenew: false, message: '该座位不是您的预约' };
    }

    return { canRenew: true, message: '' };
  },

  // 续约当前座位（兼容旧调用）
  renewCurrentSeat: function(hours) {
    const seatNumber = this.globalData.renewingSeat;
    const expiredHours = this.globalData.renewingSeatHours;
    if (!seatNumber) {
      console.log('没有续约中的座位');
      return { success: false, message: '没有续约中的座位' };
    }

    return this.renewSeat(seatNumber, hours, expiredHours);
  }
});