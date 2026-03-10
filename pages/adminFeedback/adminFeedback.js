const STATUS_TEXT = {
  pending: '待处理',
  done: '已完成'
};

// TODO：把这里改成你自己的管理员 openid 列表
const ADMIN_OPENIDS = ['o-58x3STfW2UnhwJ2st7fpSalkAk'];

function formatTime(ts) {
  const t = Number(ts) || 0;
  if (!t) return '';
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

Page({
  data: {
    isAdmin: false,
    filter: 'pending',
    list: [],
    loading: false
  },

  onShow() {
    const openid = wx.getStorageSync('currentUserId') || '';
    const isAdmin = ADMIN_OPENIDS.includes(openid);
    this.setData({ isAdmin });
    if (isAdmin) this.fetch();
  },

  setFilter(e) {
    const filter = e.currentTarget.dataset.filter || 'pending';
    if (filter === this.data.filter) return;
    this.setData({ filter });
    this.fetch();
  },

  async fetch() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    wx.showLoading({ title: '加载中...' });
    try {
      const status = this.data.filter === 'all' ? '' : this.data.filter;
      const res = await wx.cloud.callFunction({
        name: 'adminListFeedback',
        data: { status }
      });
      const r = (res && res.result) || {};
      if (!r.ok) {
        this.setData({ list: [] });
        wx.showToast({ title: r.msg || '无权限', icon: 'none' });
        return;
      }
      const list = Array.isArray(r.list) ? r.list : [];
      const mapped = list.map((it) => {
        const s = (it.status === 'done') ? 'done' : 'pending';
        return {
          ...it,
          status: s,
          statusText: STATUS_TEXT[s],
          timeText: formatTime(it.createdAt || 0)
        };
      });
      this.setData({ list: mapped });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ loading: false });
    }
  },

  async updateStatus(e) {
    const id = e.currentTarget.dataset.id;
    const status = e.currentTarget.dataset.status;
    if (!id || !status) return;
    wx.showLoading({ title: '更新中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'adminUpdateFeedbackStatus',
        data: { id, status }
      });
      const r = (res && res.result) || {};
      if (!r.ok) {
        wx.showToast({ title: r.msg || '更新失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: '已更新', icon: 'success' });
      this.fetch();
    } catch (e2) {
      wx.showToast({ title: '更新失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  }
});

