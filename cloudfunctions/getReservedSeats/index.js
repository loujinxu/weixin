const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const startSeat = Number(event.startSeat || 1)
  const endSeat = Number(event.endSeat || startSeat)
  const now = Number(event.now || Date.now())

  // 兼容历史数据：seatNumber / expireTime 可能被写成字符串，导致范围查询漏数据。
  // 这里先只按 expireTime 拉取“未过期的占用”，再在云函数里做数值化与楼层范围过滤。
  const limit = 100
  let skip = 0
  let all = []

  while (true) {
    const res = await db
      .collection('seat_locks')
      .where({
        expireTime: _.gt(now)
      })
      .skip(skip)
      .limit(limit)
      .get()

    const data = res.data || []
    if (data.length === 0) break

    all = all.concat(data)
    if (data.length < limit) break
    skip += data.length
  }

  const list = all
    .map((d) => {
      let seatNumber = d.seatNumber
      if (typeof seatNumber !== 'number') seatNumber = Number(seatNumber)
      if (!seatNumber || Number.isNaN(seatNumber)) seatNumber = Number(d._id)

      const expireTime = Number(d.expireTime)
      if (!seatNumber || Number.isNaN(seatNumber)) return null
      if (!expireTime || Number.isNaN(expireTime)) return null
      if (expireTime <= now) return null
      if (seatNumber < startSeat || seatNumber > endSeat) return null

      return {
        seatNumber,
        userId: d.userId,
        expireTime
      }
    })
    .filter(Boolean)

  return { ok: true, list }
}
