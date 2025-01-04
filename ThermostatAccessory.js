const https = require('https');

class ThermostatAccessory {
	constructor(log, config) {
		const Service = homebridge.hap.Service;
		const Characteristic = homebridge.hap.Characteristic;
		this.log = log;
		this.name = config.name || 'Thermostat';
		this.apiGetTemperature = config.apiGetTemperature;
		this.apiSetTemperature = config.apiSetTemperature;
		this.apiGetToken = config.apiGetToken;

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
		// Parse the API URL
		const url = new URL(this.apiGetTemperature);
	
		// Define request options
		const options = {
			hostname: url.hostname,
			path: url.pathname + url.search, // Combine path and query string
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${this.bearerTokenGet}`, // Include the token for authentication
			},
			port: url.port || 80, // Default to port 80 if not specified
		};
	
		try {
			// Make the HTTP request using a custom makeHttpRequest method
			const response = await this.makeHttpRequest(options);
	
			// Assuming the temperature is in response.temperature
			this.currentTemperature = response.temperature || 'Unknown';
			this.log(`Fetched current temperature: ${this.currentTemperature}`);
	
			// Call the callback with the temperature
			callback(null, this.currentTemperature);
		} catch (error) {
			// Log and handle the error
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
	
		const url = new URL(this.apiSetTemperature);
		url.pathname = '/setTemperatureDelay';
		url.searchParams.append('temp', value);
	
		const options = {
			hostname: url.hostname,
			path: url.pathname + url.search, // Combines path and query string
			method: 'GET',
			port: url.port || 80, // Add port if needed
		};
	
		try {
			await this.makeHttpRequest(options); // No body is needed for GET
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