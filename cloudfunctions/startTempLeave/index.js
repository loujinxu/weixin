const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database({ throwOnNotFound: false })

function getMaxTempLeaves(hours) {
  if (hours <= 2) return 1
  if (hours <= 4) return 2
  return 4
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const seatNumber = Number(event.seatNumber)
  const now = Date.now()

  if (!seatNumber) return { ok: false, msg: '参数错误' }

  try {
    const result = await db.runTransaction(async (t) => {
      const userRef = t.collection('user_active').doc(openid)
      const userSnap = await userRef.get()
      const ua = userSnap && userSnap.data
      if (!ua || !ua.seatNumber) throw new Error('NO_ACTIVE')
      if (Number(ua.seatNumber) !== seatNumber) throw new Error('NOT_OWNER')

      const seatRef = t.collection('seat_locks').doc(String(seatNumber))
      const seatSnap = await seatRef.get()
      const seat = seatSnap && seatSnap.data
      if (!seat || seat.userId !== openid) throw new Error('NOT_OWNER')

      const hours = Number(seat.hours || 0)
      const maxLeave = getMaxTempLeaves(hours)
      const leaveCount = Number(seat.tempLeaveCount || 0)
      if (leaveCount >= maxLeave) throw new Error('LEAVE_LIMIT')

      const tempLeaveStartTime = now
      const tempLeaveUntil = now + 30 * 60 * 1000

      await seatRef.update({
        data: {
          isTempLeave: true,
          tempLeaveStartTime,
          tempLeaveUntil,
          tempLeaveCount: leaveCount + 1,
          updatedAt: now
        }
      })

      await userRef.update({
        data: {
          isTempLeave: true,
          tempLeaveStartTime,
          tempLeaveUntil,
          updatedAt: now
        }
      })

      return { tempLeaveUntil }
    })

    // 事务成功后再记录历史
    try {
      await db.collection('reservation_history').add({
        data: { userId: openid, seatNumber, action: 'start_temp_leave', createdAt: now }
      })
    } catch (e) {}

    return { ok: true, tempLeaveUntil: result.tempLeaveUntil }
  } catch (e) {
    const msg = String((e && e.message) || '')
    if (msg.includes('NO_ACTIVE')) return { ok: false, msg: '没有进行中的预约' }
    if (msg.includes('NOT_OWNER')) return { ok: false, msg: '该座位不是您的预约' }
    if (msg.includes('LEAVE_LIMIT')) return { ok: false, msg: '暂离次数已达上限' }
    return { ok: false, msg: '暂离失败，请稍后重试' }
  }
}
