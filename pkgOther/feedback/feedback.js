// pages/feedback/feedback.js
const FEEDBACK_KEY = 'feedback_list';
const MAX_IMAGES = 9;

Page({
  data: {
    typeList: [
      { name: '座位设施损坏', value: 'facility' },
      { name: '自习室不文明行为', value: 'behavior' },
      { name: '环境与卫生问题', value: 'environment' },
      { name: '其他问题', value: 'other' }
    ],
    typeIndex: 0,
    content: '',
    location: '',
    images: []
  },

  onTypeChange(e) {
    this.setData({ typeIndex: parseInt(e.detail.value, 10) });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  onLocationInput(e) {
    this.setData({ location: e.detail.value });
  },

  chooseImage() {
    const remain = MAX_IMAGES - this.data.images.length;
    if (remain <= 0) {
      wx.showToast({ title: '最多上传9张图片', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const files = (res.tempFiles || []).map(f => f.tempFilePath);
        const images = this.data.images.concat(files);
        this.setData({ images });
      },
      fail: (err) => {
        if (err.errMsg && !err.errMsg.includes('cancel')) {
          wx.showToast({ title: '选择图片失败', icon: 'none' });
        }
      }
    });
  },

  removeImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.images.filter((_, i) => i !== index);
    this.setData({ images });
  },

  previewImage(e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({
      current: url,
      urls: this.data.images
    });
  },

  submit() {
    const { typeList, typeIndex, content, images } = this.data;
    const typeName = typeList[typeIndex].name;
    if (!content || !content.trim()) {
      wx.showToast({ title: '请填写问题描述', icon: 'none' });
      return;
    }
    const list = wx.getStorageSync(FEEDBACK_KEY) || [];
    list.unshift({
      type: typeName,
      content: content.trim(),
      location: (this.data.location || '').trim(),
      images: images || [],
      time: Date.now()
    });
    wx.setStorageSync(FEEDBACK_KEY, list);
    wx.showToast({ title: '反馈已提交', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 1500);
  }
});
