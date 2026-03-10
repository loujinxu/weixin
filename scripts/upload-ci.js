/**
 * 微信小程序 CI 上传脚本
 * 在 GitHub Actions 等 CI 环境中，通过私钥自动上传体验版。
 * 私钥需在微信公众平台 -> 开发 -> 开发管理 -> 开发设置 中生成并下载。
 */
const ci = require('miniprogram-ci');
const path = require('path');
const fs = require('fs');

const appId = process.env.MP_APPID || 'wx4af9b75d735194d9';
const privateKeyContent = process.env.MP_PRIVATE_KEY;
const privateKeyPath = process.env.MP_PRIVATE_KEY_PATH || path.join(__dirname, '../private.key');
const projectPath = path.join(__dirname, '..');

// 诊断信息（不打印私钥内容）
console.log('CI env check:');
console.log('  MP_APPID set:', !!process.env.MP_APPID);
console.log('  MP_PRIVATE_KEY (content) set:', !!privateKeyContent);
console.log('  MP_PRIVATE_KEY length:', privateKeyContent ? privateKeyContent.length : 0);
if (!privateKeyContent && fs.existsSync(privateKeyPath)) {
  const stat = fs.statSync(privateKeyPath);
  console.log('  private key file exists, size:', stat.size, 'bytes');
}

(async () => {
  try {
    const projectConfig = {
      appid: appId,
      type: 'miniProgram',
      projectPath,
      ignores: ['node_modules/**/*', 'images/**/*']
    };
    if (privateKeyContent) {
      projectConfig.privateKey = privateKeyContent;
    } else {
      projectConfig.privateKeyPath = privateKeyPath;
    }
    const project = new ci.Project(projectConfig);
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
    console.error('upload error:', err.message || err);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
})();
