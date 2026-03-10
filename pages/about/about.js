// pages/about/about.js
Page({
  data: {},

  onLoad: function(options) {
    console.log('关于本馆页面加载完成');
  },

  // 返回上一页
  goBack: function() {
    wx.navigateBack();
  }
});