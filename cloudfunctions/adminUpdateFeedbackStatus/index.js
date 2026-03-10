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

  const id = String((event && event.id) || '').trim()
  const status = String((event && event.status) || '').trim()
  if (!id) return { ok: false, msg: '缺少 id' }
  if (!['pending', 'done'].includes(status)) return { ok: false, msg: '状态不合法' }

  const now = Date.now()
  try {
    await db.collection('feedbacks').doc(id).update({
      data: { status, updatedAt: now }
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, msg: '更新失败' }
  }
}

