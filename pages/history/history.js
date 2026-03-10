// pages/history/history.js
const app = getApp();

Page({
  data: {
    currentView: 'list', // 当前视图：list 或 calendar
    currentFilter: 'all', // 当前筛选：all, today, thisMonth, completed, cancelled
    currentYear: 0,
    currentMonth: 0,
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    calendarDays: [], // 日历天数数组
    selectedDate: null, // 选中的日期
    selectedDateReservations: [], // 选中日期的预约记录
    reservationHistory: [], // 所有预约记录
    filteredHistory: [], // 筛选后的预约记录
    totalReservations: 0, // 总预约数
    todayReservations: 0, // 今日预约数
    monthReservations: 0 // 本月预约数
  },

  onLoad: function(options) {
    console.log('预约记录页面加载完成');
    
    // 初始化日历
    const now = new Date();
    this.setData({
      currentYear: now.getFullYear(),
      currentMonth: now.getMonth() + 1
    });
    
    this.loadReservationHistory();
    this.generateCalendar();
  },

  onShow: function() {
    // 每次显示页面时重新加载数据
    this.loadReservationHistory();
  },

  // 返回上一页
  goBack: function() {
    wx.navigateBack();
  },

  // 加载预约记录
  loadReservationHistory: function() {
    const history = app.globalData.reservationHistory || [];
    console.log('加载预约记录:', history);
    
    // 按开始时间从新到旧排序
    const sortedHistory = [...history].sort((a, b) => b.startTime - a.startTime);
    
    // 计算统计数据
    const now = new Date();
    const today = this.getDateString(now);
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    
    let todayCount = 0;
    let monthCount = 0;
    
    sortedHistory.forEach(item => {
      const itemDate = new Date(item.startTime);
      const itemDateStr = this.getDateString(itemDate);
      const itemMonth = itemDate.getMonth() + 1;
      const itemYear = itemDate.getFullYear();
      
      if (itemDateStr === today) {
        todayCount++;
      }
      
      if (itemYear === currentYear && itemMonth === currentMonth) {
        monthCount++;
      }
    });
    
    this.setData({
      reservationHistory: sortedHistory,
      filteredHistory: this.filterHistory(sortedHistory, this.data.currentFilter),
      totalReservations: sortedHistory.length,
      todayReservations: todayCount,
      monthReservations: monthCount
    });
    
    // 更新选中日期的记录
    if (this.data.selectedDate) {
      this.updateSelectedDateReservations();
    }
  },

  // 获取日期字符串（YYYY-MM-DD格式）
  getDateString: function(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 切换视图
  switchView: function(e) {
    const view = e.currentTarget.dataset.view;
    this.setData({ currentView: view });
  },

  // 筛选预约记录
  filterReservations: function(e) {
    const filter = e.currentTarget.dataset.filter;
    const filtered = this.filterHistory(this.data.reservationHistory, filter);
    
    this.setData({
      currentFilter: filter,
      filteredHistory: filtered
    });
  },

  // 应用筛选条件
  filterHistory: function(history, filter) {
    if (filter === 'all') {
      return history;
    }
    
    const now = new Date();
    const today = this.getDateString(now);
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    
    return history.filter(item => {
      const itemDate = new Date(item.startTime);
      const itemDateStr = this.getDateString(itemDate);
      const itemMonth = itemDate.getMonth() + 1;
      const itemYear = itemDate.getFullYear();
      
      switch (filter) {
        case 'today':
          return itemDateStr === today;
        case 'thisMonth':
          return itemYear === currentYear && itemMonth === currentMonth;
        case 'completed':
          return item.status === '已过期' || item.status === '已退坐' || item.status === '暂离超时';
        case 'cancelled':
          return item.status === '已退坐' || item.status === '暂离超时';
        default:
          return true;
      }
    });
  },

  // 获取状态对应的CSS类
  getStatusClass: function(status) {
    switch (status) {
      case '进行中':
        return 'status-active';
      case '已退坐':
        return 'status-cancelled';
      case '暂离超时':
        return 'status-timeout';
      case '已过期':
        return 'status-expired';
      default:
        return '';
    }
  },

  // 获取状态说明
  getStatusDescription: function(status) {
    switch (status) {
      case '已退坐':
        return '用户主动退坐';
      case '暂离超时':
        return '暂离超过30分钟未归';
      case '已过期':
        return '预约时间结束';
      default:
        return '';
    }
  },

  // 格式化日期时间
  formatDateTime: function(timestamp) {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}年${month}月${day}日${hour}:${minute}`;
  },

  // 生成日历
  generateCalendar: function() {
    const { currentYear, currentMonth } = this.data;
    
    // 获取当月第一天
    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    const firstDayWeek = firstDay.getDay(); // 0-6，0表示周日
    
    // 获取当月天数
    const lastDay = new Date(currentYear, currentMonth, 0);
    const daysInMonth = lastDay.getDate();
    
    // 获取上月天数
    const prevLastDay = new Date(currentYear, currentMonth - 1, 0);
    const daysInPrevMonth = prevLastDay.getDate();
    
    // 生成日历天数数组
    const calendarDays = [];
    
    // 添加上个月的日期
    for (let i = firstDayWeek - 1; i >= 0; i--) {
      calendarDays.push({
        day: daysInPrevMonth - i,
        isCurrentMonth: false,
        isPrevMonth: true
      });
    }
    
    // 添加当月的日期
    for (let i = 1; i <= daysInMonth; i++) {
      calendarDays.push({
        day: i,
        isCurrentMonth: true,
        isPrevMonth: false
      });
    }
    
    // 添加下个月的日期
    const remainingDays = 42 - calendarDays.length; // 6行×7列=42个格子
    for (let i = 1; i <= remainingDays; i++) {
      calendarDays.push({
        day: i,
        isCurrentMonth: false,
        isPrevMonth: false
      });
    }
    
    this.setData({ calendarDays });
  },

  // 获取日期的CSS类
  getDayClass: function(dayData) {
    const { isCurrentMonth, isPrevMonth, day } = dayData;
    const { currentYear, currentMonth, selectedDate } = this.data;
    
    const now = new Date();
    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth() + 1;
    const todayDay = now.getDate();
    
    let classes = [];
    
    if (!isCurrentMonth) {
      classes.push('other-month');
    }
    
    if (selectedDate && 
        selectedDate.year === currentYear && 
        selectedDate.month === currentMonth && 
        selectedDate.day === day) {
      classes.push('selected');
    }
    
    if (currentYear === todayYear && 
        currentMonth === todayMonth && 
        day === todayDay) {
      classes.push('today');
    }
    
    // 检查是否有预约记录
    const hasEvents = this.getDayEvents(day, isCurrentMonth, isPrevMonth).length > 0;
    if (hasEvents) {
      classes.push('has-events');
    }
    
    return classes.join(' ');
  },

  // 获取某天的预约记录
  getDayEvents: function(day, isCurrentMonth = true, isPrevMonth = false) {
    const { currentYear, currentMonth, reservationHistory } = this.data;
    
    if (!isCurrentMonth) {
      return [];
    }
    
    return reservationHistory.filter(item => {
      const itemDate = new Date(item.startTime);
      const itemYear = itemDate.getFullYear();
      const itemMonth = itemDate.getMonth() + 1;
      const itemDay = itemDate.getDate();
      
      return itemYear === currentYear && itemMonth === currentMonth && itemDay === day;
    });
  },

  // 选择日期
  selectDate: function(e) {
    const { year, month, day, iscurrentmonth } = e.currentTarget.dataset;
    
    // 如果不是当前月份的日期，不处理
    if (!iscurrentmonth) {
      return;
    }
    
    const selectedDate = {
      year: parseInt(year),
      month: parseInt(month),
      day: parseInt(day)
    };
    
    this.setData({ selectedDate });
    this.updateSelectedDateReservations();
  },

  // 更新选中日期的预约记录
  updateSelectedDateReservations: function() {
    const { selectedDate, reservationHistory } = this.data;
    
    if (!selectedDate) {
      this.setData({ selectedDateReservations: [] });
      return;
    }
    
    const filtered = reservationHistory.filter(item => {
      const itemDate = new Date(item.startTime);
      const itemYear = itemDate.getFullYear();
      const itemMonth = itemDate.getMonth() + 1;
      const itemDay = itemDate.getDate();
      
      return itemYear === selectedDate.year && 
             itemMonth === selectedDate.month && 
             itemDay === selectedDate.day;
    });
    
    // 按时间排序
    filtered.sort((a, b) => a.startTime - b.startTime);
    
    this.setData({ selectedDateReservations: filtered });
  },

  // 上个月
  prevMonth: function() {
    let { currentYear, currentMonth } = this.data;
    
    if (currentMonth === 1) {
      currentYear--;
      currentMonth = 12;
    } else {
      currentMonth--;
    }
    
    this.setData({
      currentYear,
      currentMonth,
      selectedDate: null,
      selectedDateReservations: []
    });
    
    this.generateCalendar();
  },

  // 下个月
  nextMonth: function() {
    let { currentYear, currentMonth } = this.data;
    
    if (currentMonth === 12) {
      currentYear++;
      currentMonth = 1;
    } else {
      currentMonth++;
    }
    
    this.setData({
      currentYear,
      currentMonth,
      selectedDate: null,
      selectedDateReservations: []
    });
    
    this.generateCalendar();
  }
});