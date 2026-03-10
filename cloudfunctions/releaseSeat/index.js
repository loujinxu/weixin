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

  const seatNumber = Number(event.seatNumber)
  if (!seatNumber) return { ok: false, msg: '参数错误' }

  const now = Date.now()
  const windowMs = 24 * 60 * 60 * 1000

  try {
    await db.runTransaction(async (t) => {
      const userRef = t.collection('user_active').doc(openid)
      const stateRef = t.collection('user_state').doc(openid)
      const userSnap = await userRef.get()
      const ua = userSnap && userSnap.data

      if (!ua || !ua.seatNumber) {
        throw new Error('NO_ACTIVE')
      }
      if (Number(ua.seatNumber) !== seatNumber) {
        throw new Error('NOT_OWNER')
      }

      const seatRef = t.collection('seat_locks').doc(String(seatNumber))
      const seatSnap = await seatRef.get()
      const seat = seatSnap && seatSnap.data
      if (seat && seat.userId && seat.userId !== openid) {
        throw new Error('NOT_OWNER')
      }

      // 退坐视为违规：封禁24小时（沿用你原本的“退坐违规”逻辑）
      const stateSnap = await stateRef.get()
      const state = stateSnap && stateSnap.data
      const until = now + windowMs
      if (state) {
        await stateRef.update({ data: { violationUntil: until, updatedAt: now } })
      } else {
        await stateRef.set({
          data: { violationUntil: until, reservationStarts: [], updatedAt: now }
        })
      }

      await seatRef.remove()
      await userRef.remove()

      return true
    })

    // 事务成功后再记录历史
    try {
      await db.collection('reservation_history').add({
        data: { userId: openid, seatNumber, action: 'release', createdAt: now }
      })
    } catch (e) {}

    return { ok: true }
  } catch (e) {
    const msg = String((e && e.message) || '')
    if (msg.includes('NO_ACTIVE')) return { ok: false, msg: '没有可退坐的预约' }
    if (msg.includes('NOT_OWNER')) return { ok: false, msg: '该座位不是您的预约' }
    return { ok: false, msg: '退坐失败，请稍后重试' }
  }
}
