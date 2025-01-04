const ThermostatAccessory = require('./ThermostatAccessory');

module.exports = (homebridge) => {
	homebridge.registerAccessory(
		'homebridge-http-thermostat-dummy',
		'ThermostatAccessory',
		ThermostatAccessory
	);
};