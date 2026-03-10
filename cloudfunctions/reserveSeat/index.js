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
  const hours = Number(event.hours)
  if (!seatNumber || !hours || hours <= 0) {
    return { ok: false, msg: '参数错误' }
  }

  const now = Date.now()
  const expireTime = now + hours * 60 * 60 * 1000
  const windowMs = 24 * 60 * 60 * 1000

  try {
    const result = await db.runTransaction(async (t) => {
      const seatRef = t.collection('seat_locks').doc(String(seatNumber))
      const userRef = t.collection('user_active').doc(openid)
      const stateRef = t.collection('user_state').doc(openid)

      // === 预约限制（云端统一）===
      const stateSnap = await stateRef.get()
      const state = stateSnap && stateSnap.data
      const violationUntil = Number((state && state.violationUntil) || 0)
      if (violationUntil && violationUntil > now) {
        return { deny: 'VIOLATION', violationUntil }
      }
      const starts = Array.isArray(state && state.reservationStarts) ? state.reservationStarts : []
      const validStarts = starts.filter((t) => Number(t) >= now - windowMs && Number(t) <= now).map((t) => Number(t))
      if (validStarts.length >= 3) {
        const until = now + windowMs
        // 达到上限：写入封禁（不回滚），但不占座
        if (state) {
          await stateRef.update({ data: { violationUntil: until, reservationStarts: validStarts, updatedAt: now } })
        } else {
          await stateRef.set({
            data: { violationUntil: until, reservationStarts: validStarts, updatedAt: now }
          })
        }
        return { deny: 'LIMIT', violationUntil: until }
      }

      const seatSnap = await seatRef.get()
      const seat = seatSnap && seatSnap.data

      // 座位被别人占用且未过期
      if (seat && seat.expireTime && seat.expireTime > now && seat.userId !== openid) {
        throw new Error('SEAT_TAKEN')
      }

      const userSnap = await userRef.get()
      const ua = userSnap && userSnap.data

      // 同一用户只能有一个进行中的预约
      if (ua && ua.expireTime && ua.expireTime > now && ua.seatNumber !== seatNumber) {
        throw new Error('HAS_ACTIVE')
      }

      // 写入预约开始时间（用于24小时内次数限制）
      if (state) {
        await stateRef.update({ data: { reservationStarts: [...validStarts, now], updatedAt: now } })
      } else {
        await stateRef.set({
          data: { reservationStarts: [...validStarts, now], violationUntil: 0, updatedAt: now }
        })
      }

      // 写入/覆盖座位锁与用户活跃预约（原锁已过期时会被覆盖）
      await seatRef.set({
        data: {
          seatNumber,
          userId: openid,
          startTime: now,
          expireTime,
          hours,
          updatedAt: now
        }
      })

      await userRef.set({
        data: {
          seatNumber,
          expireTime,
          updatedAt: now
        }
      })

      return { expireTime }
    })

    if (result && result.deny === 'VIOLATION') {
      return { ok: false, msg: '您因违规已被限制预约，24小时后方可再次预约', violationUntil: result.violationUntil }
    }
    if (result && result.deny === 'LIMIT') {
      return { ok: false, msg: '24小时内预约次数已达3次，违规将限制预约24小时', violationUntil: result.violationUntil }
    }
    // 事务成功后再记录历史（避免 transaction 内 add 导致失败）
    try {
      await db.collection('reservation_history').add({
        data: {
          userId: openid,
          seatNumber,
          startTime: now,
          expireTime: result.expireTime,
          hours,
          action: 'reserve',
          createdAt: now
        }
      })
    } catch (e) {}

    return { ok: true, expireTime: result.expireTime }
  } catch (e) {
    const msg = String((e && e.message) || '')
    if (msg.includes('SEAT_TAKEN')) return { ok: false, msg: '该座位已被占用' }
    if (msg.includes('HAS_ACTIVE')) return { ok: false, msg: '您已有一个预约中的座位' }
    // 返回更具体的错误信息，便于定位（调试用）
    return {
      ok: false,
      msg: '抢座失败，请稍后重试',
      debug: {
        message: String((e && e.message) || ''),
        // stack 可能较长，只保留前 300 字符
        stack: String((e && e.stack) || '').slice(0, 300)
      }
    }
  }
}
