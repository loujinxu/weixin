const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database({ throwOnNotFound: false })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const seatNumber = Number(event.seatNumber)
  const extraHours = Number(event.extraHours)
  if (!seatNumber || !extraHours || extraHours <= 0) return { ok: false, msg: '参数错误' }

  const now = Date.now()

  try {
    const result = await db.runTransaction(async (t) => {
      const seatRef = t.collection('seat_locks').doc(String(seatNumber))
      const userRef = t.collection('user_active').doc(openid)

      const seatSnap = await seatRef.get()
      const seat = seatSnap && seatSnap.data
      if (!seat || seat.userId !== openid) throw new Error('NOT_OWNER')

      const currentExpire = Number(seat.expireTime || 0)
      const newExpireTime = Math.max(currentExpire, now) + extraHours * 60 * 60 * 1000

      await seatRef.update({
        data: {
          expireTime: newExpireTime,
          hours: Number(seat.hours || 0) + extraHours,
          updatedAt: now
        }
      })

      await userRef.set({
        data: {
          seatNumber,
          expireTime: newExpireTime,
          updatedAt: now
        }
      })

      return { newExpireTime }
    })

    // 事务成功后再记录历史
    try {
      await db.collection('reservation_history').add({
        data: { userId: openid, seatNumber, action: 'renew', extraHours, newExpireTime: result.newExpireTime, createdAt: now }
      })
    } catch (e) {}

    return { ok: true, newExpireTime: result.newExpireTime }
  } catch (e) {
    const msg = String((e && e.message) || '')
    if (msg.includes('NOT_OWNER')) return { ok: false, msg: '该座位不是您的预约' }
    return { ok: false, msg: '续约失败，请稍后重试' }
  }
}
