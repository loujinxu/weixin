const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database({
  throwOnNotFound: false
})

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const limit = Math.min(50, Math.max(1, Number((event && event.limit) || 20)))

  try {
    const res = await db.collection('feedbacks')
      .where({ openid })
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get()
    return { ok: true, list: (res && res.data) || [] }
  } catch (e) {
    return { ok: false, list: [], msg: '查询失败' }
  }
}

