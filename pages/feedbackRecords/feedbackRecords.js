const STATUS_TEXT = {
  pending: '待处理',
  done: '已完成'
};

// TODO：把这里改成你自己的管理员 openid 列表（与 adminFeedback 页保持一致）
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
    list: [],
    loading: false,
    isAdmin: false
  },

  onShow() {
    const openid = wx.getStorageSync('currentUserId') || '';
    this.setData({ isAdmin: ADMIN_OPENIDS.includes(openid) });
    this.fetch();
  },

  onPullDownRefresh() {
    this.fetch(true);
  },

  goFeedback() {
    wx.navigateTo({ url: '/pages/feedback/feedback' });
  },

  goAdmin() {
    wx.navigateTo({ url: '/pages/adminFeedback/adminFeedback' });
  },

  async fetch(fromPullDown = false) {
    if (this.data.loading) return;
    this.setData({ loading: true });
    if (!fromPullDown) wx.showLoading({ title: '加载中...' });

    try {
      const localList = (wx.getStorageSync('feedback_list') || []).map((it, idx) => ({
        ...it,
        _id: it._id || `local_${idx}_${it.time || 0}`,
        __local: true
      }));

      let cloudList = [];
      let cloudUsable = false;
      if (wx.cloud && wx.cloud.callFunction) {
        try {
          const res = await wx.cloud.callFunction({ name: 'listMyFeedback', data: {} });
          const r = (res && res.result) || {};
          if (r && r.ok) {
            cloudUsable = true;
            cloudList = Array.isArray(r.list) ? r.list : [];
          }
        } catch (e2) {
          cloudUsable = false;
        }
      }

      // 合并策略：
      // - 云端可用：显示云端 + 本地未同步(cloudSynced!==true) 的记录（避免用户“提交了但没看到”）
      // - 云端不可用：仅显示本地记录
      let list = [];
      if (cloudUsable) {
        const unsyncedLocal = localList.filter((it) => it.cloudSynced !== true);
        list = cloudList.concat(unsyncedLocal);
      } else {
        list = localList;
      }

      const mapped = list.map((it) => {
        const status = (it.status === 'done') ? 'done' : 'pending';
        return {
          ...it,
          status,
          statusText: STATUS_TEXT[status],
          timeText: formatTime(it.createdAt || it.time || it.updatedAt || 0)
        };
      });

      this.setData({ list: mapped });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      if (!fromPullDown) wx.hideLoading();
      wx.stopPullDownRefresh();
      this.setData({ loading: false });
    }
  }
});

