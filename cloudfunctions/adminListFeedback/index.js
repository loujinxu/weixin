const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database({
  throwOnNotFound: false
})

// TODO：把这里改成你自己的管理员 openid 列表
const ADMIN_OPENIDS = ['o-58x3STfW2UnhwJ2st7fpSalkAk']

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!ADMIN_OPENIDS.includes(openid)) {
    return { ok: false, msg: '无权限', openid };
  }

  const status = String((event && event.status) || '').trim()
  const limit = Math.min(100, Math.max(1, Number((event && event.limit) || 50)))

  try {
    let query = db.collection('feedbacks')
    if (status) query = query.where({ status })
    const res = await query.orderBy('createdAt', 'desc').limit(limit).get()
    return { ok: true, list: (res && res.data) || [] }
  }  catch (e) {
    return {
      ok: false,
      msg: '查询失败',
      list: [],
      error: String((e && e.message) || e)
    }
  }
}

