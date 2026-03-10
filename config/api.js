/**
 * 后端 API 配置
 * - 使用微信云开发时：useAliyun = false，无需填 apiBase
 * - 迁移到阿里云后：useAliyun = true，apiBase 填你的 HTTPS 接口根地址（需在小程序后台配置为 request 合法域名）
 */
module.exports = {
  // 是否使用阿里云后端（true 时用 wx.request 请求 apiBase，false 时用 wx.cloud 云函数）
  useAliyun: false,
  // 阿里云 API 根地址，例如 'https://api.你的域名.com'，末尾不要加 /
  apiBase: ''
};
