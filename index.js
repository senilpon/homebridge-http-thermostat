const ThermostatPlatform = require('./ThermostatPlatform');

module.exports = (api) => {
  api.registerPlatform('ThermostatPlatform', ThermostatPlatform);
};