/**
 * 微信小程序 CI 上传脚本
 * 在 GitHub Actions 等 CI 环境中，通过私钥自动上传体验版。
 * 私钥需在微信公众平台 -> 开发 -> 开发管理 -> 开发设置 中生成并下载。
 */
const ci = require('miniprogram-ci');
const path = require('path');

const appId = process.env.MP_APPID || 'wx4af9b75d735194d9';
const privateKeyPath = process.env.MP_PRIVATE_KEY_PATH || path.join(__dirname, '../private.key');
const projectPath = path.join(__dirname, '..');

(async () => {
  try {
    const project = new ci.Project({
      appid: appId,
      type: 'miniProgram',
      projectPath,
      privateKeyPath,
      ignores: ['node_modules/**/*', 'images/**/*']
    });
    const uploadResult = await ci.upload({
      project,
      version: process.env.MP_VERSION || '1.0.0',
      desc: process.env.MP_DESC || 'CI 自动上传',
      setting: {
        es6: true,
        minify: true
      }
    });
    console.log('upload result:', uploadResult);
  } catch (err) {
    console.error('upload error:', err);
    process.exit(1);
  }
})();
