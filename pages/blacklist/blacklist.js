// pages/blacklist/blacklist.js
const store = require('../../utils/store.js');
const util = require('../../utils/util.js');

Page({
  data: {
    list: [],
    inputUserId: '',
    inputReason: ''
  },
  onLoad() {
    this.loadList();
  },
  onShow() {
    this.loadList();
  },
  loadList() {
    const list = store.getBlacklist().map(item => ({
      ...item,
      createdAtText: util.formatTime(item.createdAt)
    }));
    this.setData({ list });
  },
  onUserIdInput(e) {
    this.setData({ inputUserId: e.detail.value });
  },
  onReasonInput(e) {
    this.setData({ inputReason: e.detail.value });
  },
  addBlacklist() {
    const { inputUserId, inputReason } = this.data;
    if (!inputUserId.trim()) {
      wx.showToast({ title: '请输入用户ID', icon: 'none' });
      return;
    }
    const result = store.addToBlacklist(inputUserId.trim(), inputReason.trim() || '违规');
    if (result.ok) {
      wx.showToast({ title: '已加入黑名单' });
      this.setData({ inputUserId: '', inputReason: '' });
      this.loadList();
    } else {
      wx.showToast({ title: result.msg || '操作失败', icon: 'none' });
    }
  },
  removeBlacklist(e) {
    const userId = e.currentTarget.dataset.userid;
    wx.showModal({
      title: '确认移除',
      content: '确定将 ' + userId + ' 移出黑名单？',
      success: res => {
        if (res.confirm) {
          store.removeFromBlacklist(userId);
          wx.showToast({ title: '已移除' });
          this.loadList();
        }
      }
    });
  }
});
