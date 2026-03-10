// map.js
Page({
  data: {
    // 所有图片的URL数组
    imageUrls: [
      '/images/floors/reading_room_1.jpg',
      '/images/floors/study_room_1.jpg',
      '/images/floors/reading_room_2.jpg',
      '/images/floors/study_room_2.jpg',
      '/images/floors/reading_room_3.jpg',
      '/images/floors/study_room_3.jpg'
    ],
    // 图片对应的名称
    imageNames: [
      '1楼借阅室分布图',
      '1楼自习室分布图',
      '2楼借阅室分布图',
      '2楼自习室分布图',
      '3楼借阅室分布图',
      '3楼自习室分布图'
    ]
  },

  onLoad: function() {
    console.log('俯瞰全馆页面加载完成');
  },

  // 返回上一页
  goBack: function() {
    wx.navigateBack();
  },

  // 预览图片
  previewImage: function(e) {
    const index = e.currentTarget.dataset.index;
    
    wx.previewImage({
      urls: this.data.imageUrls,  // 所有图片的URL
      current: this.data.imageUrls[index],  // 当前点击的图片
      success: () => {
        console.log('预览图片:', this.data.imageNames[index]);
      },
      fail: (err) => {
        console.error('图片预览失败:', err);
        wx.showToast({
          title: '图片加载失败',
          icon: 'none',
          duration: 2000
        });
      }
    });
  },

  onShareAppMessage: function() {
    return {
      title: '图书馆楼层分布图',
      path: '/pages/map/map'
    };
  }
});