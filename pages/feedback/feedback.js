// pages/feedback/feedback.js
const FEEDBACK_KEY = 'feedback_list';
const MAX_IMAGES = 9;
const CLOUD_FN_SUBMIT = 'submitFeedback';

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
    images: [],
    submitting: false
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

  goRecords() {
    wx.navigateTo({ url: '/pages/feedbackRecords/feedbackRecords' });
  },

  async uploadImages(openid, filePaths) {
    if (!wx.cloud || !wx.cloud.uploadFile || !filePaths || !filePaths.length) return [];
    const now = Date.now();
    const tasks = filePaths.map((p, idx) => {
      const ext = (p.split('.').pop() || 'jpg').toLowerCase();
      const cloudPath = `feedback/${openid || 'anonymous'}/${now}_${idx}.${ext}`;
      return wx.cloud.uploadFile({ cloudPath, filePath: p })
        .then(res => res.fileID)
        .catch(() => '');
    });
    const fileIDs = await Promise.all(tasks);
    return fileIDs.filter(Boolean);
  },

  submit() {
    this.submitAsync();
  },

  async submitAsync() {
    if (this.data.submitting) return;
    const { typeList, typeIndex, content, images } = this.data;
    const typeName = typeList[typeIndex].name;
    const trimmed = (content || '').trim();
    if (!trimmed) {
      wx.showToast({ title: '请填写问题描述', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...' });

    const openid = wx.getStorageSync('currentUserId') || '';
    try {
      const app = getApp();
      const cloudEnabled = !!(wx.cloud && wx.cloud.callFunction && app && app.globalData && app.globalData.cloudReady);

      // 1) 上传图片到云存储（可选）
      const fileIDs = cloudEnabled ? await this.uploadImages(openid, images || []) : [];

      // 2) 写入云端反馈记录（优先）
      let cloudOk = false;
      if (cloudEnabled) {
        const res = await wx.cloud.callFunction({
          name: CLOUD_FN_SUBMIT,
          data: {
            type: typeName,
            content: trimmed,
            location: (this.data.location || '').trim(),
            images: fileIDs
          }
        });
        const r = (res && res.result) || {};
        cloudOk = !!r.ok;
        if (!cloudOk) {
          throw new Error((r && r.msg) || '云端提交失败');
        }
      }

      // 3) 兼容：本地也存一份（方便离线查看/旧逻辑）
      const list = wx.getStorageSync(FEEDBACK_KEY) || [];
      list.unshift({
        type: typeName,
        content: trimmed,
        location: (this.data.location || '').trim(),
        images: images || [],
        time: Date.now(),
        status: 'pending',
        cloudSynced: cloudOk
      });
      wx.setStorageSync(FEEDBACK_KEY, list);

      wx.hideLoading();
      wx.showToast({ title: cloudOk ? '反馈已提交' : '已提交（仅本地保存）', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (e) {
      wx.hideLoading();
      console.error('submit feedback failed:', e);
      const msg = (e && (e.errMsg || e.message)) ? String(e.errMsg || e.message) : '提交失败，请稍后重试';
      wx.showToast({ title: msg.slice(0, 18), icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
