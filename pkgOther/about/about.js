// pages/about/about.js
Page({
  data: {},

  onLoad: function(options) {},

  goBack: function() {
    wx.navigateBack();
  },

  makePhoneCall: function() {
    wx.makePhoneCall({ phoneNumber: '0416291358888' });
  },
});
