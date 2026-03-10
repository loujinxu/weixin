const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database({ throwOnNotFound: false })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const seatNumber = Number(event.seatNumber)
  if (!seatNumber) return { ok: false, msg: '参数错误' }

  const now = Date.now()

  try {
    await db.runTransaction(async (t) => {
      const userRef = t.collection('user_active').doc(openid)
      const userSnap = await userRef.get()
      const ua = userSnap && userSnap.data
      if (!ua || !ua.seatNumber) throw new Error('NO_ACTIVE')
      if (Number(ua.seatNumber) !== seatNumber) throw new Error('NOT_OWNER')

      const seatRef = t.collection('seat_locks').doc(String(seatNumber))
      const seatSnap = await seatRef.get()
      const seat = seatSnap && seatSnap.data
      if (!seat || seat.userId !== openid) throw new Error('NOT_OWNER')

      await seatRef.update({
        data: {
          isTempLeave: false,
          tempLeaveStartTime: null,
          tempLeaveUntil: null,
          updatedAt: now
        }
      })

      await userRef.update({
        data: {
          isTempLeave: false,
          tempLeaveStartTime: null,
          tempLeaveUntil: null,
          updatedAt: now
        }
      })
    })

    // 事务成功后再记录历史
    try {
      await db.collection('reservation_history').add({
        data: { userId: openid, seatNumber, action: 'end_temp_leave', createdAt: now }
      })
    } catch (e) {}

    return { ok: true }
  } catch (e) {
    const msg = String((e && e.message) || '')
    if (msg.includes('NO_ACTIVE')) return { ok: false, msg: '没有暂离中的预约' }
    if (msg.includes('NOT_OWNER')) return { ok: false, msg: '该座位不是您的预约' }
    return { ok: false, msg: '取消暂离失败，请稍后重试' }
  }
}
