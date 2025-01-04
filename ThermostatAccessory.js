const http = require('http'); // Use the 'http' module for GET requests

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

	// Simplified version for GET requests only
	makeHttpRequest(options) {
		return new Promise((resolve, reject) => {
			const req = http.request(options, (res) => {
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
			req.end(); // End the request (GET requests don't need to send data)
		});
	}

	// Fetch current temperature using GET request
	async getCurrentTemperature(callback) {
		const url = new URL(this.apiGetTemperature);
	
		// Define request options for GET request
		const options = {
			hostname: url.hostname,
			path: url.pathname + url.search, // Combine path and query string
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${this.bearerTokenGet}`, // Include the token for authentication
			},
			port: url.port || 80, // Default to port 80 if using HTTP
		};
	
		try {
			// Make the HTTP request using the simplified makeHttpRequest method
			const response = await this.makeHttpRequest(options);
	
			// Log the full response for debugging
			this.log('API Response:', JSON.stringify(response, null, 2));
	
			// Ensure the response contains the 'data' array
			if (response.data && Array.isArray(response.data)) {
				// Find the object where 'name' is 'temp'
				const temperatureData = response.data.find(item => item.name === 'temp');
				
				if (temperatureData) {
					this.currentTemperature = temperatureData.value || 'Unknown'; // Set the temperature value
					this.log(`Fetched current temperature: ${this.currentTemperature}`);
				} else {
					this.currentTemperature = 'Unknown'; // If 'temp' data is not found
					this.log('Temperature data not found');
				}
			} else {
				this.currentTemperature = 'Unknown'; // If 'data' is not in expected format
				this.log('Invalid data format or no data found');
			}
	
			// Call the callback with the temperature
			callback(null, this.currentTemperature);
		} catch (error) {
			// Log and handle the error
			this.log(`Error fetching current temperature: ${error.message}`);
			callback(error);
		}
	}

	// Return target temperature
	getTargetTemperature(callback) {
		this.log(`Returning target temperature: ${this.targetTemperature}`);
		callback(null, this.targetTemperature);
	}

	// Set target temperature (GET request with query string)
	async setTargetTemperature(value, callback) {
		this.targetTemperature = value;

		const url = new URL(this.apiSetTemperature);
		url.pathname = '/setTemperatureDelay';
		url.searchParams.append('temp', value);

		const options = {
			hostname: url.hostname,
			path: url.pathname + url.search, // Combines path and query string
			method: 'GET',
			port: url.port || 80, // Default to port 80 if using HTTP
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

	// Return the service
	getServices() {
		return [this.service];
	}
}

module.exports = ThermostatAccessory;