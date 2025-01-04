const ThermostatAccessory = require('./ThermostatAccessory');

module.exports = (api) => {
	api.registerAccessory('HomebridgeThermostat', ThermostatAccessory);
};
