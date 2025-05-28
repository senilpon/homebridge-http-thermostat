const ThermostatPlatform = require('./ThermostatPlatform');

module.exports = (homebridge) => {
  homebridge.registerPlatform(
    'homebridge-http-thermostat-dummy',
    'ThermostatPlatform',
    ThermostatPlatform
  );
};