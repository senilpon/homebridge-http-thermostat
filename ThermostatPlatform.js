const ThermostatAccessory = require('./ThermostatAccessory');

class ThermostatPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.accessories = [];

    this.api.on('didFinishLaunching', () => {
      const uuid = this.api.hap.uuid.generate(this.config.name);
      const existingAccessory = this.accessories.find(a => a.UUID === uuid);

      if (!existingAccessory) {
        const accessory = new this.api.platformAccessory(this.config.name, uuid);
        new ThermostatAccessory(this, accessory, this.config);
        this.api.registerPlatformAccessories(
          'homebridge-http-thermostat-dummy',
          'ThermostatPlatform',
          [accessory]
        );
      }
    });
  }

  configureAccessory(accessory) {
    this.accessories.push(accessory);
    new ThermostatAccessory(this, accessory, this.config);
  }
}

module.exports = ThermostatPlatform;