// What `zapier push` uploads: the app, with its version and Zapier's.
const { signedByCurahold: _unused, ...app } = require('./app');

module.exports = {
  version: require('./package.json').version,
  platformVersion: require('zapier-platform-core').version,
  ...app,
};
