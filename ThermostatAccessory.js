const https = require('http');

class ThermostatAccessory {
	constructor(log, config, api) {
		const Service = api.hap.Service;
		const Characteristic = api.hap.Characteristic;
		this.log = log;
		this.name = config.name || 'Thermostat';
		this.apiGetTemperature = config.apiGetTemperature;
		this.apiSetTemperature = config.apiSetTemperature;
		this.bearerTokenGet = config.apiGetToken;

		this.currentTemperature = 20;
		this.targetTemperature = 19;
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
			const req = http.request(options, (res) => { // Use http.request instead of https.request
				let responseData = '';
				res.on('data', (chunk) => {
					responseData += chunk;
				});
				res.on('end', () => {
					try {
						resolve(JSON.parse(responseData)); // Parse the response if it's JSON
					} catch (error) {
						reject(error); // Handle any parsing errors
					}
				});
			});
	
			req.on('error', (error) => reject(error)); // Reject the promise on any request error
	
			if (data) {
				req.write(data); // Write data to the request if provided (for POST requests)
			}
			req.end(); // End the request
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
	
			// Find the temperature value from the response data
			const temperatureData = response.data.find(item => item.name === 'temp');
			
			if (temperatureData) {
				this.currentTemperature = temperatureData.value || 'Unknown'; // Set the temperature value
				this.log(`Fetched current temperature: ${this.currentTemperature}`);
			} else {
				this.currentTemperature = 'Unknown'; // If no temperature data found
				this.log('Temperature data not found');
			}
	
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