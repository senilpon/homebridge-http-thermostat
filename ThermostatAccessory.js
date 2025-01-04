const https = require('https');
const { Service, Characteristic } = require('hap-nodejs');

class ThermostatAccessory {
	constructor(log, config) {
		this.log = log;
		this.name = config.name || 'Thermostat';
		this.apiGetTemperature = config.apiGetTemperature;
		this.apiSetTemperature = config.apiSetTemperature;

		this.currentTemperature = 20;
		this.targetTemperature = 22;
		this.temperatureDisplayUnits = 0;

		this.service = new Service.Thermostat(this.name);

		this.service
			.getCharacteristic(Characteristic.CurrentTemperature)
			.on('get', this.getCurrentTemperature.bind(this));

		this.service
			.getCharacteristic(Characteristic.TargetTemperature)
			.on('get', this.getTargetTemperature.bind(this))
			.on('set', this.setTargetTemperature.bind(this));
	}

	makeHttpRequest(options, data = null) {
		return new Promise((resolve, reject) => {
			const req = https.request(options, (res) => {
				let responseData = '';
				res.on('data', (chunk) => {
					responseData += chunk;
				});
				res.on('end', () => {
					try {
						resolve(JSON.parse(responseData));
					} catch (error) {
						reject(error);
					}
				});
			});

			req.on('error', (error) => reject(error));

			if (data) {
				req.write(data);
			}

			req.end();
		});
	}

	async getCurrentTemperature(callback) {
		const options = {
			hostname: new URL(this.apiEndpoint).hostname,
			//path: '/current-temperature',
			method: 'GET',
		};

		try {
			const response = await this.makeHttpRequest(options);
			this.currentTemperature = response.temperature;
			this.log(`Fetched current temperature: ${this.currentTemperature}`);
			callback(null, this.currentTemperature);
		} catch (error) {
			this.log(`Error fetching current temperature: ${error.message}`);
			callback(error);
		}
	}

	getTargetTemperature(callback) {
		this.log(`Returning target temperature: ${this.targetTemperature}`);
		callback(null, this.targetTemperature);
	}

	async setTargetTemperature(value, callback) {
		this.targetTemperature = value;

		const options = {
			hostname: new URL(this.apiEndpoint).hostname,
			//path: '/set-temperature',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
		};

		const data = JSON.stringify({ targetTemperature: value });

		try {
			await this.makeHttpRequest(options, data);
			this.log(`Set target temperature to: ${this.targetTemperature}`);
			callback(null);
		} catch (error) {
			this.log(`Error setting target temperature: ${error.message}`);
			callback(error);
		}
	}

	getServices() {
		return [this.service];
	}
}

module.exports = ThermostatAccessory;
