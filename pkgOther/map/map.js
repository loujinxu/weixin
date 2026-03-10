// map.js
Page({
  data: {},

  onLoad: function() {
    console.log('俯瞰全馆页面加载完成');
  },

  // 返回上一页
  goBack: function() {
    wx.navigateBack();
  },

  onShareAppMessage: function() {
    return {
      title: '图书馆楼层分布图',
      path: '/pkgOther/map/map'
    };
  }
});