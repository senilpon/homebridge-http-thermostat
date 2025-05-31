const http = require('http');
const storage = require('node-persist');
const querystring = require('querystring');

class ThermostatAccessory {
  constructor(platform, accessory, config) {
    this.platform = platform;
    this.log = platform.log;
    this.config = config;
    this.api = platform.api;
    this.accessory = accessory;

    this.Characteristic = this.api.hap.Characteristic;
    const { Service, Characteristic } = this.api.hap;

    this.service =
      this.accessory.getService(Service.Thermostat) ||
      this.accessory.addService(Service.Thermostat);

    this.apiGetTemperature = this.config.apiGetTemperature;
    this.apiSetTemperature = this.config.apiSetTemperature;

    this.apiSetOFF = this.config.apiSetOFF.url;
    this.apiSetOFFMethod = this.config.apiSetOFF.method || 'POST';
    this.apiSetOFFToken = this.config.apiSetOFF.token || null;
    this.apiContentType = this.config.apiContentType || 'application/json';
    this.apiGetToken = this.config.apiGetToken;

    this.targetHeatingCoolingState = 1;

    this.heatingOptions = {
      0: 'OFF',
      1: 'HEAT'
    };

    this.currentTemperature = 20;
    this.targetTemperature = 19;
    this.temperatureDisplayUnits = 0;

    this.currentHeatingCoolingState = 0; // OFF
    this.storageInitialized = false;

    this.initStorage();

    this.service
      .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .onGet(this.getCurrentHeatingCoolingState.bind(this));

    this.service
      .getCharacteristic(Characteristic.CurrentTemperature)
      .onGet(this.getCurrentTemperature.bind(this));

    this.service
      .getCharacteristic(Characteristic.TargetTemperature)
      .onGet(this.getTargetTemperature.bind(this))
      .onSet(value => {
        this.log(`[DEBUG] onSet triggered with value: ${value}`);
        this.setTargetTemperature(value);
      });

    this.service
      .getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .setProps({
        validValues: [
          Characteristic.TargetHeatingCoolingState.OFF,
          Characteristic.TargetHeatingCoolingState.HEAT
        ],
      })
      .onGet(this.getTargetHeatingCoolingState.bind(this))
      .onSet(this.setTargetHeatingCoolingState.bind(this));

    this.service
      .getCharacteristic(Characteristic.TemperatureDisplayUnits)
      .onGet(() => this.temperatureDisplayUnits);

    this.makeHttpRequest = this.makeHttpRequest.bind(this);

    this.service.updateCharacteristic(Characteristic.CurrentTemperature, this.currentTemperature);
    this.service.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, this.currentHeatingCoolingState);

    this.startPolling();
  }

  startPolling() {
    const pollInterval = this.config.pollInterval || 60; // seconds
    this.log(`Starting temperature polling every ${pollInterval} seconds`);

    setInterval(async () => {
      try {
        const temp = await this.getCurrentTemperature();
        this.currentTemperature = temp;
        this.service
          .updateCharacteristic(this.Characteristic.CurrentTemperature, temp);
        this.log(`Updated HomeKit temperature to ${temp}°C`);
      } catch (error) {
        this.log(`Polling error: ${error.stack || error.message}`);
      }
    }, pollInterval * 1000);
  }

  async initStorage() {
    try {
      await storage.init();
      this.currentTemperature = (await storage.getItem('currentTemperature')) || 20;
      this.targetTemperature = (await storage.getItem('targetTemperature')) || 19;
      this.targetHeatingCoolingState = (await storage.getItem('targetHeatingCoolingState')) || 0;

      this.storageInitialized = true;
      this.log(`Initialized storage: Current Temp: ${this.currentTemperature}, Target Temp: ${this.targetTemperature}, State: ${this.targetHeatingCoolingState}`);
      await this.getCurrentTemperature(); // force-fetch at init
    } catch (error) {
      this.log(`Error initializing storage: ${error.message}`);
    }
  }

  getCurrentHeatingCoolingState() {
    this.log(`Returning current heating/cooling state: ${this.currentHeatingCoolingState}`);
    return this.currentHeatingCoolingState;
  }

  async getCurrentTemperature() {
    if (!this.apiGetTemperature) {
      this.log("Error: apiGetTemperature is not set!");
      throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }

    this.log(`Fetching temperature from: ${this.apiGetTemperature}`);

    try {
      const response = await this.makeHttpRequest({
        url: this.apiGetTemperature,
        method: 'GET',
        token: this.apiGetToken,
        contentType: "application/json"
      });

      this.log("API Response:", JSON.stringify(response, null, 2));

      if (response && response.data && Array.isArray(response.data)) {
        const temperatureData = response.data.find(item => item.name === 'temp');
        if (temperatureData) {
          const tempVal = parseFloat(temperatureData.value);
          this.currentTemperature = isNaN(tempVal) ? 0 : tempVal;
        } else {
          this.currentTemperature = 0;
        }
      } else {
        this.currentTemperature = 0;
      }

      return this.currentTemperature;
    } catch (error) {
      this.log(`Error fetching current temperature: ${error.message}`);
      throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  getTargetTemperature() {
    this.log(`Returning target temperature: ${this.targetTemperature}`);
    return this.targetTemperature;
  }

  async setTargetTemperature(value) {
    this.log(`HomeKit requested new target temperature: ${value}°C`);

    let body;
    if (this.apiContentType === 'application/x-www-form-urlencoded') {
      body = { value }; // let makeHttpRequest encode it
    } else if (typeof this.apiSetTemperature.body === 'string') {
      body = JSON.parse(this.apiSetTemperature.body.replace('{{value}}', value));
    } else {
      body = { value };
}
    this.log.debug(`[Thermostat] Body (final): ${body}`);
    this.log.debug(`[Thermostat] Content-Type: ${this.apiContentType}`);
    try {
      await this.makeHttpRequest({
        url: this.apiSetTemperature.url,
        method: this.apiSetTemperature.method || 'POST',
        token: this.apiSetTemperature.token || null,
        contentType: this.apiContentType,
        body
      });

      this.targetTemperature = value;
      this.service.updateCharacteristic(this.Characteristic.TargetTemperature, value);
      await this.saveState();
    } catch (error) {
      this.log(`Failed to set temperature: ${error.message}`);
    }
  }

  getTargetHeatingCoolingState() {
    return this.targetHeatingCoolingState;
  }

  async setTargetHeatingCoolingState(value) {
    this.targetHeatingCoolingState = value;
    this.log(`The new heating/cooling state is ${value}`);

    this.currentHeatingCoolingState = value;
    this.service.updateCharacteristic(this.Characteristic.CurrentHeatingCoolingState, value);

    if (value === 0) {
      const url = new URL(this.apiSetOFF);
      const postData = this.apiContentType === 'application/x-www-form-urlencoded'
        ? querystring.stringify({ value: 5 })
        : JSON.stringify({ value: 5 });

      try {
        const response = await this.makeHttpRequest({
          url: url.toString(),
          method: this.apiSetOFFMethod,
          token: this.apiSetOFFToken,
          body: postData,
          contentType: this.apiContentType
        });

        const parsedResponse = typeof response === 'string' ? JSON.parse(response) : response;
        if (parsedResponse.error) {
          this.log(`API Error: ${parsedResponse.error}`);
          throw new Error(parsedResponse.error);
        }

        this.log(`Set heating/cooling to: OFF`);
      } catch (error) {
        this.log(`Error setting heating/cooling state: ${error.message}`);
        throw error;
      }
    }

    await this.saveState();
  }

  async saveState() {
    if (!this.storageInitialized) return;

    await storage.setItem('currentTemperature', this.currentTemperature);
    await storage.setItem('targetTemperature', this.targetTemperature);
    await storage.setItem('targetHeatingCoolingState', this.targetHeatingCoolingState);

    this.log('State saved');
  }

  makeHttpRequest({ url, method = 'GET', token = null, body = null, contentType = 'application/json' }) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);

      if (method !== 'GET') {
        if (contentType === 'application/x-www-form-urlencoded' && typeof body === 'object') {
          body = querystring.stringify(body); // value=18
        } else if (contentType === 'application/json' && typeof body === 'object') {
          body = JSON.stringify(body); // { "value": 18 }
        }
      }

      const headers = {
        'Content-Type': contentType
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      if (body && method !== 'GET') {
        headers['Content-Length'] = Buffer.byteLength(body);
      }

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 80,
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        headers,
      };

      const req = http.request(options, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          this.log.debug(`[Thermostat] HTTP ${res.statusCode} ${data}`);
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data); // fallback to raw
          }
        });
      });

      req.on('error', error => {
        this.log.error(`[Thermostat] HTTP error: ${error.message}`);
        reject(error);
      });

      if (body && method !== 'GET') {
        req.write(body);
      }

      req.end();
    });
  }
}

module.exports = ThermostatAccessory;