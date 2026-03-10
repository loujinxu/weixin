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

  const type = String((event && event.type) || '').trim()
  const content = String((event && event.content) || '').trim()
  const location = String((event && event.location) || '').trim()
  const images = Array.isArray(event && event.images) ? event.images.filter(Boolean) : []

  if (!content) return { ok: false, msg: '请填写问题描述' }

  const now = Date.now()
  try {
    const r = await db.collection('feedbacks').add({
      data: {
        openid,
        type: type || '其他问题',
        content,
        location,
        images,
        status: 'pending',
        createdAt: now,
        updatedAt: now
      }
    })
    return { ok: true, id: (r && r._id) || '' }
  } catch (e) {
    return { ok: false, msg: '提交失败' }
  }
}

