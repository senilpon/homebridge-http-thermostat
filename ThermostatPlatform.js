const ThermostatAccessory = require('./ThermostatAccessory');

class ThermostatPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.accessories = [];

    if (!config || !config.accessories || !Array.isArray(config.accessories)) {
      this.log('No accessories configured.');
      return;
    }

    this.api.on('didFinishLaunching', () => {
      this.log('DidFinishLaunching - registering accessories...');
      this.config.accessories.forEach(deviceConfig => {
        this.addAccessory(deviceConfig);
      });
    });
  }

  configureAccessory(accessory) {
    this.log(`Loading accessory from cache: ${accessory.displayName}`);
    this.accessories.push(accessory); // <-- Add this
  }

  addAccessory(deviceConfig) {
    const uuid = this.api.hap.uuid.generate(deviceConfig.name);
    const existingAccessory = this.accessories.find(acc => acc.UUID === uuid);

    if (existingAccessory) {
      this.log(`Restoring existing accessory: ${deviceConfig.name}`);
      new ThermostatAccessory(this, existingAccessory, deviceConfig);
    } else {
      this.log(`Adding new accessory: ${deviceConfig.name}`);
      const accessory = new this.api.platformAccessory(deviceConfig.name, uuid);
      new ThermostatAccessory(this, accessory, deviceConfig);

      this.api.registerPlatformAccessories('homebridge-http-thermostat-dummy', 'ThermostatPlatform', [accessory]);
    }
  }
}

module.exports = ThermostatPlatform;